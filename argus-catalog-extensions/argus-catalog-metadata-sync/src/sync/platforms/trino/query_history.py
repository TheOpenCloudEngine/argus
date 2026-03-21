"""Trino query history collector — receives events from EventListener plugin."""

import json
import logging
from datetime import datetime, timezone

from sync.core.database import get_session
from sync.platforms.trino.models import TrinoQueryHistory

logger = logging.getLogger(__name__)


def save_trino_query_event(event: dict) -> TrinoQueryHistory:
    """Save a Trino query event from the EventListener plugin.

    The event dict matches the JSON payload from QueryAuditListener.java:
    queryId, query, queryState, queryType, user, principal, source,
    catalog, schema, inputs (list), output (dict), plan, timing fields,
    failureInfo, platformId.
    """
    query_id = event.get("queryId", "")
    if not query_id:
        raise ValueError("queryId is required")

    logger.debug("Received Trino query event: queryId=%s, state=%s, user=%s",
                 query_id, event.get("queryState"), event.get("user"))

    # Serialize input/output for storage
    inputs_json = json.dumps(event.get("inputs", []))
    output_json = json.dumps(event.get("output")) if event.get("output") else None

    # Error info
    failure = event.get("failureInfo")
    error_code = failure.get("errorCode") if failure else None
    error_message = failure.get("failureMessage") if failure else None

    record = TrinoQueryHistory(
        query_id=query_id,
        query_state=event.get("queryState"),
        query_type=event.get("queryType"),
        statement=event.get("query"),
        plan=event.get("plan"),
        username=event.get("user"),
        principal=event.get("principal"),
        source=event.get("source"),
        catalog=event.get("catalog"),
        schema=event.get("schema"),
        remote_client_address=event.get("remoteClientAddress"),
        create_time=_parse_epoch(event.get("createTime")),
        execution_start_time=_parse_epoch(event.get("executionStartTime")),
        end_time=_parse_epoch(event.get("endTime")),
        wall_time_ms=event.get("wallTimeMs"),
        cpu_time_ms=event.get("cpuTimeMs"),
        physical_input_bytes=event.get("physicalInputBytes"),
        physical_input_rows=event.get("physicalInputRows"),
        output_bytes=event.get("outputBytes"),
        output_rows=event.get("outputRows"),
        peak_memory_bytes=event.get("peakMemoryBytes"),
        error_code=error_code,
        error_message=error_message,
        inputs_json=inputs_json,
        output_json=output_json,
        platform_id=event.get("platformId"),
    )

    session = get_session()
    try:
        session.add(record)
        session.commit()
        session.refresh(record)
        return record
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def save_trino_lineage(record: TrinoQueryHistory) -> int:
    """Extract lineage from Trino's native input/output metadata and save.

    Trino EventListener provides resolved input/output tables directly,
    so no SQL parsing is needed.
    """
    from sync.platforms.hive.models import ColumnLineage, QueryLineage

    if not record.inputs_json or not record.output_json:
        return 0

    try:
        inputs = json.loads(record.inputs_json)
        output = json.loads(record.output_json)
    except (json.JSONDecodeError, TypeError):
        return 0

    if not inputs or not output:
        return 0

    target_table = f"{output.get('schema', '')}.{output.get('table', '')}"

    session = get_session()
    try:
        count = 0
        for inp in inputs:
            source_table = f"{inp.get('schema', '')}.{inp.get('table', '')}"

            ql = QueryLineage(
                query_hist_id=record.id,
                source_table=source_table,
                target_table=target_table,
            )
            session.add(ql)
            session.flush()
            count += 1

            # Column lineage from Trino's native column tracking
            src_columns = inp.get("columns", [])
            tgt_columns = output.get("columns", [])
            for col_name in src_columns:
                col_record = ColumnLineage(
                    query_lineage_id=ql.id,
                    source_column=f"{source_table}.{col_name}",
                    target_column=col_name,
                    transform_type="DIRECT",
                )
                session.add(col_record)

        session.commit()
        logger.debug("Saved %d lineage records for Trino query %s", count, record.query_id)
        return count
    except Exception:
        session.rollback()
        logger.exception("Failed to save Trino lineage for query %s", record.query_id)
        return 0
    finally:
        session.close()


def _parse_epoch(value) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value) / 1000, tz=timezone.utc)
    except (ValueError, TypeError, OSError):
        return None
