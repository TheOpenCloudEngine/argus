"""Abstract backend interface for Hive Metastore metadata access.

Both Thrift (HMS API) and SQL (direct DB) backends implement this
interface, producing identical HiveTableMetadata objects.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class HiveTableMetadata:
    """Normalized table metadata from either Thrift or SQL backend.

    This is the contract between backends and the sync orchestrator.
    Both backends must produce identical instances for the same table.
    """

    database: str
    table_name: str
    table_type: str                          # MANAGED_TABLE, EXTERNAL_TABLE, VIRTUAL_VIEW
    owner: str
    location: str | None                     # SDS.LOCATION or table.sd.location
    input_format: str | None                 # Java class name (e.g. OrcInputFormat)
    columns: list[dict] = field(default_factory=list)      # [{"name", "type", "comment"}]
    partition_keys: list[dict] = field(default_factory=list) # [{"name", "type", "comment"}]
    parameters: dict[str, str] = field(default_factory=dict) # TABLE_PARAMS key-value
    comment: str | None = None


class HiveBackend(ABC):
    """Abstract backend for accessing Hive Metastore metadata."""

    @abstractmethod
    def connect(self) -> bool:
        """Establish connection. Returns True if successful."""
        ...

    @abstractmethod
    def disconnect(self) -> None:
        """Close connection and release resources."""
        ...

    @abstractmethod
    def get_databases(self) -> list[str]:
        """Return list of all database names."""
        ...

    @abstractmethod
    def get_tables(self, database: str) -> list[str]:
        """Return list of table names in a database."""
        ...

    @abstractmethod
    def get_table_metadata(self, database: str, table: str) -> HiveTableMetadata:
        """Return full metadata for a single table."""
        ...
