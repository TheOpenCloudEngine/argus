"""Thrift backend — access Hive Metastore via hmsclient (Thrift RPC).

Extracted from the original sync.py. Connects to HMS on port 9083
and fetches metadata via the standard Thrift API.
"""

import logging
import os
import subprocess

from sync.platforms.hive.backend_base import HiveBackend, HiveTableMetadata

logger = logging.getLogger(__name__)


class HiveThriftBackend(HiveBackend):
    """Hive Metastore Thrift backend using hmsclient."""

    def __init__(self, settings):
        self.settings = settings
        self._hms_client = None

    def _init_kerberos(self) -> None:
        """Initialize Kerberos authentication if configured."""
        if not self.settings.hive_kerberos_enabled:
            return

        keytab = self.settings.hive_kerberos_keytab
        principal = self.settings.hive_kerberos_principal

        if not os.path.isfile(keytab):
            raise FileNotFoundError(f"Keytab file not found: {keytab}")

        logger.info("Initializing Kerberos: principal=%s, keytab=%s", principal, keytab)
        result = subprocess.run(
            ["kinit", "-kt", keytab, principal],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"kinit failed: {result.stderr.strip()}")
        logger.info("Kerberos authentication successful")

    def connect(self) -> bool:
        """Connect to Hive Metastore via Thrift."""
        try:
            self._init_kerberos()

            from hmsclient import HMSClient

            self._hms_client = HMSClient(
                host=self.settings.hive_metastore_host,
                port=self.settings.hive_metastore_port,
            )
            self._hms_client.open()
            self._hms_client.get_all_databases()
            logger.info(
                "Connected to Hive Metastore (Thrift) at %s:%d",
                self.settings.hive_metastore_host,
                self.settings.hive_metastore_port,
            )
            return True
        except Exception as e:
            logger.error("Failed to connect to Hive Metastore (Thrift): %s", e)
            return False

    def disconnect(self) -> None:
        """Close the Thrift connection."""
        if self._hms_client:
            try:
                self._hms_client.close()
            except Exception:
                pass
            self._hms_client = None

    def get_databases(self) -> list[str]:
        """Return all database names from HMS."""
        return self._hms_client.get_all_databases()

    def get_tables(self, database: str) -> list[str]:
        """Return all table names in a database."""
        return self._hms_client.get_all_tables(database)

    def get_table_metadata(self, database: str, table: str) -> HiveTableMetadata:
        """Fetch table metadata via Thrift and convert to HiveTableMetadata."""
        t = self._hms_client.get_table(database, table)

        columns = []
        if t.sd and t.sd.cols:
            for col in t.sd.cols:
                columns.append({
                    "name": col.name,
                    "type": col.type,
                    "comment": col.comment or "",
                })

        partition_keys = []
        for pk in (t.partitionKeys or []):
            partition_keys.append({
                "name": pk.name,
                "type": pk.type,
                "comment": pk.comment or "",
            })

        parameters = {}
        if t.parameters:
            parameters = {k: str(v) for k, v in t.parameters.items() if v is not None}

        return HiveTableMetadata(
            database=database,
            table_name=table,
            table_type=t.tableType or "MANAGED_TABLE",
            owner=t.owner or "",
            location=t.sd.location if t.sd else None,
            input_format=t.sd.inputFormat if t.sd else None,
            columns=columns,
            partition_keys=partition_keys,
            parameters=parameters,
            comment=parameters.get("comment"),
        )
