"""StarRocks query history collector — receives events from AuditPlugin."""

import logging

from sync.core.database import get_session
from sync.platforms.starrocks.models import StarRocksQueryHistory

logger = logging.getLogger(__name__)


def save_starrocks_query_event(event: dict) -> StarRocksQueryHistory:
    """Save a StarRocks query event from the AuditPlugin.

    The event dict matches the JSON payload from QuerySender.java.
    """
    query_id = event.get("queryId", "")
    if not query_id:
        raise ValueError("queryId is required")

    logger.debug("Received StarRocks query event: queryId=%s, state=%s, user=%s",
                 query_id, event.get("state"), event.get("user"))

    record = StarRocksQueryHistory(
        query_id=query_id,
        statement=event.get("query"),
        digest=event.get("digest"),
        username=event.get("user"),
        authorized_user=event.get("authorizedUser"),
        client_ip=event.get("clientIp"),
        database=event.get("database"),
        catalog=event.get("catalog"),
        state=event.get("state"),
        error_code=event.get("errorCode"),
        query_time_ms=event.get("queryTimeMs"),
        scan_rows=event.get("scanRows"),
        scan_bytes=event.get("scanBytes"),
        return_rows=event.get("returnRows"),
        cpu_cost_ns=event.get("cpuCostNs"),
        mem_cost_bytes=event.get("memCostBytes"),
        pending_time_ms=event.get("pendingTimeMs"),
        is_query=1 if event.get("isQuery") else 0,
        fe_ip=event.get("feIp"),
        event_timestamp=event.get("timestamp"),
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
