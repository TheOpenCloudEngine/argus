"""Impala query history collector — receives audit events from Java Agent and persists them."""

import logging
import uuid
from datetime import datetime, timezone

from pydantic import BaseModel

from sync.core.database import get_session
from sync.platforms.impala.models import ImpalaQueryHistory

logger = logging.getLogger(__name__)


class ImpalaQueryEvent(BaseModel):
    """Incoming query event from Impala Java Agent (ASM instrumentation).

    Fields match the JSON payload sent by QuerySender.java:
    - timestamp: query start time (epoch millis)
    - query: SQL query text
    - plan: query execution plan (may be null)
    - user: connected user (effective user)
    - delegateUser: delegated/proxy user (may be null)
    - platformId: Argus Catalog platform ID
    """

    timestamp: int | None = None
    query: str | None = None
    plan: str | None = None
    user: str | None = None
    delegateUser: str | None = None
    platformId: str | None = None


def save_impala_query_event(event: ImpalaQueryEvent) -> ImpalaQueryHistory:
    """Save a single Impala query event from the Java Agent to the database."""
    logger.debug("Received Impala query event: user=%s, platform=%s",
                 event.user, event.platformId)

    # Generate a unique query_id (Agent doesn't have Impala's internal query ID)
    query_id = f"agent-{uuid.uuid4().hex[:16]}"

    start_time = None
    if event.timestamp:
        start_time = datetime.fromtimestamp(event.timestamp / 1000, tz=timezone.utc)

    record = ImpalaQueryHistory(
        query_id=query_id,
        query_type="QUERY",
        query_state="FINISHED",
        statement=event.query,
        plan=event.plan,
        username=event.user,
        delegate_user=event.delegateUser,
        start_time=start_time,
        platform_id=event.platformId,
    )

    session = get_session()
    try:
        session.add(record)
        session.commit()
        session.refresh(record)
        logger.debug("Saved Impala query history: id=%d, queryId=%s, user=%s",
                     record.id, record.query_id, record.username)
        return record
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
