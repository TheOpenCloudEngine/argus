"""SQL backend — access Hive Metastore by querying its backend RDBMS directly.

Connects to the MySQL/PostgreSQL database that backs Hive Metastore
and reads metadata from DBS, TBLS, SDS, COLUMNS_V2, PARTITION_KEYS,
and TABLE_PARAMS tables.

Advantages over Thrift:
- No Kerberos required
- No hmsclient dependency
- Faster (SQL vs Thrift RPC)
- Works even when HMS service is down
"""

import logging

from sqlalchemy import create_engine, text

from sync.platforms.hive.backend_base import HiveBackend, HiveTableMetadata

logger = logging.getLogger(__name__)


class HiveSqlBackend(HiveBackend):
    """Direct SQL access to Hive Metastore's backend database."""

    def __init__(self, settings):
        self.settings = settings
        self._engine = None

    def connect(self) -> bool:
        """Connect to the Metastore backend database."""
        try:
            db_type = self.settings.hive_metastore_db_type
            user = self.settings.hive_metastore_db_username
            pwd = self.settings.hive_metastore_db_password
            host = self.settings.hive_metastore_db_host
            port = self.settings.hive_metastore_db_port
            name = self.settings.hive_metastore_db_name

            if db_type in ("mysql", "mariadb"):
                url = f"mysql+pymysql://{user}:{pwd}@{host}:{port}/{name}?charset=utf8mb4"
            elif db_type == "postgresql":
                url = f"postgresql+psycopg2://{user}:{pwd}@{host}:{port}/{name}"
            else:
                raise ValueError(f"Unsupported Metastore DB type: {db_type}")

            self._engine = create_engine(url, pool_size=3, pool_recycle=3600)

            # Test connection
            with self._engine.connect() as conn:
                conn.execute(text("SELECT 1"))

            logger.info("Connected to Hive Metastore DB (%s) at %s:%d/%s",
                         db_type, host, port, name)
            return True
        except Exception as e:
            logger.error("Failed to connect to Hive Metastore DB: %s", e)
            return False

    def disconnect(self) -> None:
        """Dispose the engine and close all connections."""
        if self._engine:
            self._engine.dispose()
            self._engine = None

    def get_databases(self) -> list[str]:
        """Return all database names from DBS table."""
        with self._engine.connect() as conn:
            result = conn.execute(text("SELECT NAME FROM DBS ORDER BY NAME"))
            return [row[0] for row in result.fetchall()]

    def get_tables(self, database: str) -> list[str]:
        """Return all table names in a database."""
        with self._engine.connect() as conn:
            result = conn.execute(text("""
                SELECT t.TBL_NAME
                FROM TBLS t
                JOIN DBS d ON t.DB_ID = d.DB_ID
                WHERE d.NAME = :db_name
                ORDER BY t.TBL_NAME
            """), {"db_name": database})
            return [row[0] for row in result.fetchall()]

    def get_table_metadata(self, database: str, table: str) -> HiveTableMetadata:
        """Fetch full table metadata via SQL queries."""
        with self._engine.connect() as conn:
            # 1. Table basic info
            row = conn.execute(text("""
                SELECT t.TBL_ID, t.TBL_NAME, t.TBL_TYPE, t.OWNER,
                       s.LOCATION, s.INPUT_FORMAT, s.SD_ID
                FROM TBLS t
                JOIN DBS d ON t.DB_ID = d.DB_ID
                LEFT JOIN SDS s ON t.SD_ID = s.SD_ID
                WHERE d.NAME = :db_name AND t.TBL_NAME = :tbl_name
            """), {"db_name": database, "tbl_name": table}).fetchone()

            if not row:
                raise ValueError(f"Table not found: {database}.{table}")

            tbl_id = row[0]
            tbl_type = row[2] or "MANAGED_TABLE"
            owner = row[3] or ""
            location = row[4]
            input_format = row[5]
            sd_id = row[6]

            # 2. Columns
            columns = []
            if sd_id:
                # Get CD_ID from SDS
                cd_row = conn.execute(text(
                    "SELECT CD_ID FROM SDS WHERE SD_ID = :sd_id"
                ), {"sd_id": sd_id}).fetchone()

                if cd_row and cd_row[0]:
                    col_rows = conn.execute(text("""
                        SELECT COLUMN_NAME, TYPE_NAME, COMMENT, INTEGER_IDX
                        FROM COLUMNS_V2
                        WHERE CD_ID = :cd_id
                        ORDER BY INTEGER_IDX
                    """), {"cd_id": cd_row[0]}).fetchall()

                    for cr in col_rows:
                        columns.append({
                            "name": cr[0],
                            "type": cr[1],
                            "comment": cr[2] or "",
                        })

            # 3. Partition keys
            pk_rows = conn.execute(text("""
                SELECT PKEY_NAME, PKEY_TYPE, PKEY_COMMENT, INTEGER_IDX
                FROM PARTITION_KEYS
                WHERE TBL_ID = :tbl_id
                ORDER BY INTEGER_IDX
            """), {"tbl_id": tbl_id}).fetchall()

            partition_keys = [
                {"name": r[0], "type": r[1], "comment": r[2] or ""}
                for r in pk_rows
            ]

            # 4. Table parameters
            param_rows = conn.execute(text("""
                SELECT PARAM_KEY, PARAM_VALUE
                FROM TABLE_PARAMS
                WHERE TBL_ID = :tbl_id
            """), {"tbl_id": tbl_id}).fetchall()

            parameters = {r[0]: (r[1] or "") for r in param_rows}

            return HiveTableMetadata(
                database=database,
                table_name=table,
                table_type=tbl_type,
                owner=owner,
                location=location,
                input_format=input_format,
                columns=columns,
                partition_keys=partition_keys,
                parameters=parameters,
                comment=parameters.get("comment"),
            )
