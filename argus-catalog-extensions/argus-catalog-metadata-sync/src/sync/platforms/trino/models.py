"""SQLAlchemy models for Trino query history collection."""

from sqlalchemy import BigInteger, Column, DateTime, Integer, String, Text, func

from sync.core.database import Base


class TrinoQueryHistory(Base):
    """Trino query execution history collected from EventListener plugin."""

    __tablename__ = "argus_collector_trino_query_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    query_id = Column(String(256), nullable=False, unique=True, index=True)
    query_state = Column(String(32), nullable=True)       # FINISHED, FAILED
    query_type = Column(String(32), nullable=True)        # SELECT, INSERT, etc.
    statement = Column(Text, nullable=True)
    plan = Column(Text, nullable=True)
    username = Column(String(256), nullable=True)          # Effective user
    principal = Column(String(256), nullable=True)         # Kerberos/OAuth principal
    source = Column(String(256), nullable=True)            # Client tool (trino-cli, etc.)
    catalog = Column(String(256), nullable=True)
    schema = Column(String(256), nullable=True)
    remote_client_address = Column(String(256), nullable=True)
    create_time = Column(DateTime, nullable=True)
    execution_start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    wall_time_ms = Column(BigInteger, nullable=True)
    cpu_time_ms = Column(BigInteger, nullable=True)
    physical_input_bytes = Column(BigInteger, nullable=True)
    physical_input_rows = Column(BigInteger, nullable=True)
    output_bytes = Column(BigInteger, nullable=True)
    output_rows = Column(BigInteger, nullable=True)
    peak_memory_bytes = Column(BigInteger, nullable=True)
    error_code = Column(String(128), nullable=True)
    error_message = Column(Text, nullable=True)
    inputs_json = Column(Text, nullable=True)              # JSON: [{catalog, schema, table, columns}]
    output_json = Column(Text, nullable=True)              # JSON: {catalog, schema, table, columns}
    platform_id = Column(String(100), nullable=True, index=True)
    received_at = Column(DateTime, server_default=func.now(), nullable=False)
