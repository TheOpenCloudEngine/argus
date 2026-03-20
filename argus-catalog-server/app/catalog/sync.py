"""Platform metadata synchronization.

Connects to external data platforms and syncs table/column metadata into the catalog.
"""

import io
import json
import logging
from dataclasses import dataclass, field

import aiomysql
import asyncpg
import httpx
import pyarrow as pa
import pyarrow.parquet as pq
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.models import (
    Dataset,
    DatasetSchema,
    Platform,
    PlatformConfiguration,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class ColumnInfo:
    name: str
    data_type: str
    native_type: str
    nullable: bool
    ordinal: int
    column_key: str = ""
    column_default: str | None = None
    comment: str = ""


@dataclass
class TableInfo:
    database: str
    name: str
    table_type: str  # BASE TABLE, VIEW, SYSTEM VIEW
    engine: str | None = None
    table_comment: str = ""
    columns: list[ColumnInfo] = field(default_factory=list)


@dataclass
class SyncResult:
    platform_id: str
    databases_scanned: list[str] = field(default_factory=list)
    tables_created: int = 0
    tables_updated: int = 0
    tables_removed: int = 0
    tables_total: int = 0
    samples_uploaded: int = 0
    errors: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# MySQL / MariaDB type mapping
# ---------------------------------------------------------------------------

MYSQL_TYPE_MAP = {
    "tinyint": "NUMBER", "smallint": "NUMBER", "mediumint": "NUMBER",
    "int": "NUMBER", "bigint": "NUMBER", "decimal": "NUMBER",
    "float": "NUMBER", "double": "NUMBER",
    "char": "STRING", "varchar": "STRING",
    "tinytext": "STRING", "text": "STRING", "mediumtext": "STRING", "longtext": "STRING",
    "binary": "BYTES", "varbinary": "BYTES",
    "tinyblob": "BYTES", "blob": "BYTES", "mediumblob": "BYTES", "longblob": "BYTES",
    "date": "DATE", "datetime": "DATE", "timestamp": "DATE", "time": "DATE", "year": "DATE",
    "json": "MAP", "enum": "ENUM", "set": "ARRAY",
    "geometry": "STRING", "point": "STRING", "linestring": "STRING", "polygon": "STRING",
}


def _map_field_type(native_type: str) -> str:
    """Map a MySQL/MariaDB column type to a generic catalog field type."""
    base = native_type.split("(")[0].strip().lower()
    return MYSQL_TYPE_MAP.get(base, "STRING")


# ---------------------------------------------------------------------------
# MariaDB / MySQL metadata reader
# ---------------------------------------------------------------------------

SYSTEM_DATABASES = {"information_schema", "performance_schema", "mysql", "sys"}


async def _read_mysql_metadata(
    host: str, port: int, user: str, password: str, database: str | None = None,
) -> list[TableInfo]:
    """Connect to MySQL/MariaDB and read table + column metadata from INFORMATION_SCHEMA."""

    conn = await aiomysql.connect(
        host=host, port=port, user=user, password=password,
        db="information_schema", charset="utf8mb4",
    )
    tables: list[TableInfo] = []

    try:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            # Determine target databases
            if database:
                target_dbs = [database]
            else:
                await cur.execute("SELECT SCHEMA_NAME FROM SCHEMATA")
                rows = await cur.fetchall()
                target_dbs = [
                    r["SCHEMA_NAME"] for r in rows
                    if r["SCHEMA_NAME"].lower() not in SYSTEM_DATABASES
                ]

            for db in target_dbs:
                # Fetch tables
                await cur.execute(
                    "SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_COMMENT "
                    "FROM TABLES WHERE TABLE_SCHEMA = %s",
                    (db,),
                )
                table_rows = await cur.fetchall()

                for tr in table_rows:
                    table = TableInfo(
                        database=db,
                        name=tr["TABLE_NAME"],
                        table_type=tr["TABLE_TYPE"],
                        engine=tr.get("ENGINE"),
                        table_comment=tr.get("TABLE_COMMENT") or "",
                    )

                    # Fetch columns
                    await cur.execute(
                        "SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, "
                        "ORDINAL_POSITION, COLUMN_KEY, COLUMN_DEFAULT, COLUMN_COMMENT "
                        "FROM COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s "
                        "ORDER BY ORDINAL_POSITION",
                        (db, table.name),
                    )
                    col_rows = await cur.fetchall()

                    for cr in col_rows:
                        table.columns.append(ColumnInfo(
                            name=cr["COLUMN_NAME"],
                            data_type=_map_field_type(cr["DATA_TYPE"]),
                            native_type=cr["COLUMN_TYPE"],
                            nullable=cr["IS_NULLABLE"] == "YES",
                            ordinal=cr["ORDINAL_POSITION"],
                            column_key=cr.get("COLUMN_KEY") or "",
                            column_default=cr.get("COLUMN_DEFAULT"),
                            comment=cr.get("COLUMN_COMMENT") or "",
                        ))

                    tables.append(table)

    finally:
        conn.close()

    return tables


# ---------------------------------------------------------------------------
# PostgreSQL type mapping
# ---------------------------------------------------------------------------

PG_TYPE_MAP = {
    "smallint": "NUMBER", "integer": "NUMBER", "bigint": "NUMBER",
    "int2": "NUMBER", "int4": "NUMBER", "int8": "NUMBER",
    "decimal": "NUMBER", "numeric": "NUMBER",
    "real": "NUMBER", "double precision": "NUMBER", "float4": "NUMBER", "float8": "NUMBER",
    "serial": "NUMBER", "bigserial": "NUMBER",
    "character varying": "STRING", "varchar": "STRING",
    "character": "STRING", "char": "STRING",
    "text": "STRING", "name": "STRING", "citext": "STRING",
    "bytea": "BYTES",
    "date": "DATE", "timestamp without time zone": "DATE",
    "timestamp with time zone": "DATE", "time without time zone": "DATE",
    "time with time zone": "DATE", "interval": "DATE",
    "boolean": "BOOLEAN", "bool": "BOOLEAN",
    "json": "MAP", "jsonb": "MAP",
    "uuid": "STRING", "inet": "STRING", "cidr": "STRING", "macaddr": "STRING",
    "xml": "STRING", "money": "NUMBER",
    "point": "STRING", "line": "STRING", "polygon": "STRING", "geometry": "STRING",
    "ARRAY": "ARRAY", "USER-DEFINED": "STRING",
}

SYSTEM_SCHEMAS_PG = {"pg_catalog", "information_schema", "pg_toast"}


def _map_pg_field_type(udt_name: str, data_type: str) -> str:
    """Map a PostgreSQL column type to a generic catalog field type."""
    if data_type == "ARRAY":
        return "ARRAY"
    if data_type == "USER-DEFINED":
        return "STRING"
    return PG_TYPE_MAP.get(data_type, PG_TYPE_MAP.get(udt_name, "STRING"))


# ---------------------------------------------------------------------------
# PostgreSQL metadata reader
# ---------------------------------------------------------------------------

async def _read_pg_metadata(
    host: str, port: int, user: str, password: str,
    database: str, schema: str | None = None,
) -> list[TableInfo]:
    """Connect to PostgreSQL and read table + column metadata."""

    conn = await asyncpg.connect(
        host=host, port=port, user=user, password=password, database=database,
    )
    tables: list[TableInfo] = []

    try:
        # Determine target schemas
        if schema:
            target_schemas = [schema]
        else:
            rows = await conn.fetch(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast') "
                "AND schema_name NOT LIKE 'pg_temp%'"
            )
            target_schemas = [r["schema_name"] for r in rows]

        for sch in target_schemas:
            # Fetch tables and views
            table_rows = await conn.fetch(
                "SELECT table_name, table_type "
                "FROM information_schema.tables "
                "WHERE table_schema = $1 AND table_type IN ('BASE TABLE', 'VIEW')",
                sch,
            )

            for tr in table_rows:
                # Get table comment
                comment_row = await conn.fetchrow(
                    "SELECT obj_description(c.oid) AS comment "
                    "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                    "WHERE n.nspname = $1 AND c.relname = $2",
                    sch, tr["table_name"],
                )
                table_comment = (comment_row["comment"] or "") if comment_row else ""

                table = TableInfo(
                    database=sch,  # PostgreSQL schema maps to our "database" level
                    name=tr["table_name"],
                    table_type=tr["table_type"],
                    engine=None,
                    table_comment=table_comment,
                )

                # Fetch columns
                col_rows = await conn.fetch(
                    "SELECT column_name, data_type, udt_name, is_nullable, "
                    "ordinal_position, column_default "
                    "FROM information_schema.columns "
                    "WHERE table_schema = $1 AND table_name = $2 "
                    "ORDER BY ordinal_position",
                    sch, tr["table_name"],
                )

                for cr in col_rows:
                    # Get column comment
                    col_comment_row = await conn.fetchrow(
                        "SELECT col_description(c.oid, a.attnum) AS comment "
                        "FROM pg_class c "
                        "JOIN pg_namespace n ON n.oid = c.relnamespace "
                        "JOIN pg_attribute a ON a.attrelid = c.oid "
                        "WHERE n.nspname = $1 AND c.relname = $2 AND a.attname = $3",
                        sch, tr["table_name"], cr["column_name"],
                    )
                    col_comment = (col_comment_row["comment"] or "") if col_comment_row else ""

                    native_type = cr["udt_name"]
                    if cr["data_type"] == "ARRAY":
                        native_type = f"{cr['udt_name']}[]"

                    table.columns.append(ColumnInfo(
                        name=cr["column_name"],
                        data_type=_map_pg_field_type(cr["udt_name"], cr["data_type"]),
                        native_type=native_type,
                        nullable=cr["is_nullable"] == "YES",
                        ordinal=cr["ordinal_position"],
                        column_key="",
                        column_default=cr.get("column_default"),
                        comment=col_comment,
                    ))

                tables.append(table)

    finally:
        await conn.close()

    return tables


async def _fetch_pg_sample_rows(
    host: str, port: int, user: str, password: str,
    database: str, schema: str, table_name: str, limit: int = 100,
) -> bytes | None:
    """Fetch sample rows from PostgreSQL and return as parquet bytes."""
    try:
        conn = await asyncpg.connect(
            host=host, port=port, user=user, password=password, database=database,
        )
        try:
            rows = await conn.fetch(
                f'SELECT * FROM "{schema}"."{table_name}" LIMIT $1', limit,
            )
        finally:
            await conn.close()

        if not rows:
            return None

        # Convert to dict list, all values as STRING
        if not rows:
            return None
        col_names = list(rows[0].keys())
        columns: dict[str, list] = {k: [] for k in col_names}
        for row in rows:
            for k in col_names:
                v = row[k]
                columns[k].append(str(v) if v is not None else None)

        arrow_table = pa.table(columns)
        buf = io.BytesIO()
        pq.write_table(arrow_table, buf)
        return buf.getvalue()

    except Exception as e:
        logger.warning("Failed to fetch PG sample for %s.%s: %s", schema, table_name, e)
        return None


async def _fetch_sample_rows(
    host: str, port: int, user: str, password: str,
    database: str, table_name: str, limit: int = 100,
) -> bytes | None:
    """Fetch up to `limit` rows from a table and return as parquet bytes."""
    try:
        conn = await aiomysql.connect(
            host=host, port=port, user=user, password=password,
            db=database, charset="utf8mb4",
        )
        try:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(
                    f"SELECT * FROM `{table_name}` LIMIT %s", (limit,)
                )
                rows = await cur.fetchall()
        finally:
            conn.close()

        if not rows:
            return None

        # Convert to pyarrow Table → parquet bytes (all columns as STRING)
        columns: dict[str, list] = {}
        for key in rows[0].keys():
            col_values = []
            for row in rows:
                v = row[key]
                col_values.append(str(v) if v is not None else None)
            columns[key] = col_values

        arrow_table = pa.table(columns)
        buf = io.BytesIO()
        pq.write_table(arrow_table, buf)
        return buf.getvalue()

    except Exception as e:
        logger.warning("Failed to fetch sample for %s.%s: %s", database, table_name, e)
        return None


async def _upload_sample_parquet(
    catalog_url: str, platform_id: str, dataset_name: str, parquet_bytes: bytes,
) -> bool:
    """Upload parquet sample to catalog server via HTTP."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{catalog_url}/api/v1/catalog/samples/upload",
                content=parquet_bytes,
                headers={
                    "Content-Type": "application/octet-stream",
                    "X-Platform-Id": platform_id,
                    "X-Dataset-Name": dataset_name,
                },
                timeout=30.0,
            )
            if resp.status_code == 200:
                return True
            logger.warning("Sample upload failed (%d): %s", resp.status_code, resp.text)
    except Exception as e:
        logger.warning("Sample upload error for %s/%s: %s", platform_id, dataset_name, e)
    return False


# ---------------------------------------------------------------------------
# Sync logic
# ---------------------------------------------------------------------------

def _generate_urn(platform_id: str, path: str, env: str, entity_type: str = "dataset") -> str:
    return f"{platform_id}.{path}.{env}.{entity_type}"


SUPPORTED_TYPES = {"mysql", "postgresql"}


async def sync_platform_metadata(
    session: AsyncSession,
    platform_id_str: str,
    database: str | None = None,
    catalog_url: str = "http://127.0.0.1:4600",
) -> SyncResult:
    """Sync metadata from an external platform into the catalog.

    Supports: mysql (MySQL/MariaDB), postgresql (PostgreSQL).

    Args:
        session: DB session
        platform_id_str: The platform_id string (e.g. "mysql-19d0bfe954e2cfdaa")
        database: For MySQL: database name. For PostgreSQL: schema name. Optional.
        catalog_url: Base URL of the catalog server for sample upload.

    Returns:
        SyncResult with summary statistics.
    """
    result = SyncResult(platform_id=platform_id_str)

    # 1. Resolve platform
    row = await session.execute(
        select(Platform).where(Platform.platform_id == platform_id_str)
    )
    platform = row.scalars().first()
    if not platform:
        result.errors.append(f"Platform not found: {platform_id_str}")
        return result

    if platform.type not in SUPPORTED_TYPES:
        result.errors.append(f"Sync not supported for platform type: {platform.type}")
        return result

    # 2. Load connection config
    cfg_row = await session.execute(
        select(PlatformConfiguration).where(
            PlatformConfiguration.platform_id == platform.id
        )
    )
    cfg = cfg_row.scalars().first()
    if not cfg:
        result.errors.append(f"No configuration found for platform: {platform_id_str}")
        return result

    config = json.loads(cfg.config_json)
    host = config.get("host", "localhost")
    user = config.get("username", "root")
    password = config.get("password", "")

    # 3. Read metadata from the remote DB
    is_pg = platform.type == "postgresql"
    default_port = 5432 if is_pg else 3306
    port = int(config.get("port", default_port))
    logger.info("Syncing metadata from %s:%d (platform=%s, type=%s)",
                host, port, platform_id_str, platform.type)
    try:
        if is_pg:
            pg_database = config.get("database", "postgres")
            tables = await _read_pg_metadata(host, port, user, password, pg_database, database)
        else:
            tables = await _read_mysql_metadata(host, port, user, password, database)
    except Exception as e:
        result.errors.append(f"Connection failed: {e}")
        return result

    result.databases_scanned = sorted({t.database for t in tables})
    result.tables_total = len(tables)
    logger.info("Found %d table(s) across database(s): %s",
                len(tables), result.databases_scanned)

    # 4. Upsert datasets + schema fields
    for table in tables:
        path = f"{table.database}.{table.name}"
        urn = _generate_urn(platform_id_str, path, "PROD")
        qualified_name = f"{platform_id_str}.{path}"

        # Check if dataset already exists (by new URN or by platform + name)
        ds_row = await session.execute(
            select(Dataset).where(Dataset.urn == urn)
        )
        dataset = ds_row.scalars().first()
        if not dataset:
            # Fallback: find by platform_id + name (for migrating old URN format)
            ds_row = await session.execute(
                select(Dataset).where(
                    Dataset.platform_id == platform.id,
                    Dataset.name == f"{table.database}.{table.name}",
                )
            )
            dataset = ds_row.scalars().first()

        table_type = "VIEW" if "VIEW" in table.table_type.upper() else "TABLE"

        if dataset:
            # Update existing (also restore if previously removed)
            dataset.urn = urn
            dataset.name = f"{table.database}.{table.name}"
            dataset.qualified_name = qualified_name
            dataset.description = table.table_comment or dataset.description
            dataset.table_type = table_type
            dataset.status = "active"
            result.tables_updated += 1
        else:
            # Create new
            dataset = Dataset(
                urn=urn,
                name=f"{table.database}.{table.name}",
                platform_id=platform.id,
                description=table.table_comment or None,
                origin="PROD",
                qualified_name=qualified_name,
                table_type=table_type,
                status="active",
            )
            session.add(dataset)
            await session.flush()
            result.tables_created += 1

        # Sync schema fields: delete existing and re-insert
        existing_fields = await session.execute(
            select(DatasetSchema).where(DatasetSchema.dataset_id == dataset.id)
        )
        for f in existing_fields.scalars().all():
            await session.delete(f)

        for col in table.columns:
            session.add(DatasetSchema(
                dataset_id=dataset.id,
                field_path=col.name,
                field_type=col.data_type,
                native_type=col.native_type,
                description=col.comment or None,
                nullable="true" if col.nullable else "false",
                ordinal=col.ordinal,
            ))

    # 4b. Mark datasets as removed if they no longer exist in the source
    #     Only compare within the scanned database(s), not all datasets of this platform
    synced_urns = {
        _generate_urn(platform_id_str, f"{t.database}.{t.name}", "PROD")
        for t in tables
    }
    scanned_db_prefixes = [
        f"{platform_id_str}.{db}." for db in result.databases_scanned
    ]
    existing_rows = await session.execute(
        select(Dataset).where(
            Dataset.platform_id == platform.id,
            Dataset.status != "removed",
        )
    )
    for ds in existing_rows.scalars().all():
        # Only check datasets that belong to the scanned database(s)
        belongs_to_scanned_db = any(
            ds.urn.startswith(prefix) for prefix in scanned_db_prefixes
        )
        if belongs_to_scanned_db and ds.urn not in synced_urns:
            ds.status = "removed"
            result.tables_removed += 1
            logger.info("Marked as removed: %s", ds.urn)

    await session.commit()
    logger.info("Sync complete: created=%d, updated=%d, removed=%d, total=%d",
                result.tables_created, result.tables_updated,
                result.tables_removed, result.tables_total)

    # 5. Fetch sample data and upload as parquet
    logger.info("Collecting sample data for %d table(s)...", len(tables))
    for table in tables:
        # Skip views — sample data from base tables only
        if "VIEW" in table.table_type.upper():
            continue

        dataset_name = f"{table.database}.{table.name}"
        if is_pg:
            pg_database = config.get("database", "postgres")
            parquet_bytes = await _fetch_pg_sample_rows(
                host, port, user, password, pg_database, table.database, table.name,
            )
        else:
            parquet_bytes = await _fetch_sample_rows(
                host, port, user, password, table.database, table.name,
            )
        if parquet_bytes:
            ok = await _upload_sample_parquet(
                catalog_url, platform_id_str, dataset_name, parquet_bytes,
            )
            if ok:
                result.samples_uploaded += 1

    logger.info("Sample upload complete: %d file(s)", result.samples_uploaded)
    return result
