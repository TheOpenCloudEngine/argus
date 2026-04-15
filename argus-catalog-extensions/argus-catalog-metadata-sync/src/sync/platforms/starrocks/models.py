"""SQLAlchemy models for StarRocks query history collection."""

from sqlalchemy import BigInteger, Column, DateTime, Integer, String, Text, func

from sync.core.database import Base


class StarRocksQueryHistory(Base):
    """StarRocks query execution history collected from AuditPlugin."""

    __tablename__ = "argus_collector_starrocks_query_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    query_id = Column(String(256), nullable=False, unique=True, index=True)
    statement = Column(Text, nullable=True)
    digest = Column(String(64), nullable=True)             # Query fingerprint
    username = Column(String(256), nullable=True)          # Effective user
    authorized_user = Column(String(256), nullable=True)   # Authenticated user
    client_ip = Column(String(64), nullable=True)
    database = Column(String(256), nullable=True)
    catalog = Column(String(256), nullable=True)
    state = Column(String(16), nullable=True)              # EOF, ERR, OK
    error_code = Column(String(512), nullable=True)
    query_time_ms = Column(BigInteger, nullable=True)
    scan_rows = Column(BigInteger, nullable=True)
    scan_bytes = Column(BigInteger, nullable=True)
    return_rows = Column(BigInteger, nullable=True)
    cpu_cost_ns = Column(BigInteger, nullable=True)
    mem_cost_bytes = Column(BigInteger, nullable=True)
    pending_time_ms = Column(BigInteger, nullable=True)
    is_query = Column(Integer, nullable=True)              # 1=query, 0=non-query
    fe_ip = Column(String(128), nullable=True)
    event_timestamp = Column(BigInteger, nullable=True)    # epoch millis from AuditEvent
    platform_id = Column(String(100), nullable=True, index=True)
    received_at = Column(DateTime, server_default=func.now(), nullable=False)
