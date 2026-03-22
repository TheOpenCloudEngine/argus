"""Table format and file format detection from Hive Metastore metadata.

Detects table format (Iceberg/Hudi/Delta/Hive) from TABLE_PARAMS,
file format (ORC/Parquet/...) from SDS.INPUT_FORMAT or TABLE_PARAMS,
and storage location from SDS.LOCATION or TABLE_PARAMS.
"""

# Hive storage format: Java input class → human-readable name
INPUT_FORMAT_MAP = {
    "org.apache.hadoop.hive.ql.io.orc.OrcInputFormat": "ORC",
    "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat": "PARQUET",
    "org.apache.hadoop.mapred.TextInputFormat": "TEXTFILE",
    "org.apache.hadoop.mapred.SequenceFileInputFormat": "SEQUENCEFILE",
    "org.apache.hadoop.hive.ql.io.avro.AvroContainerInputFormat": "AVRO",
    "org.apache.hadoop.hive.ql.io.RCFileInputFormat": "RCFILE",
    "org.apache.hive.hcatalog.data.JsonSerDe": "JSONFILE",
}

# Hive table type → normalized table type
TABLE_TYPE_MAP = {
    "MANAGED_TABLE": "MANAGED_TABLE",
    "EXTERNAL_TABLE": "EXTERNAL_TABLE",
    "VIRTUAL_VIEW": "VIRTUAL_VIEW",
    "MATERIALIZED_VIEW": "MATERIALIZED_VIEW",
    "INDEX_TABLE": "MANAGED_TABLE",
}


def detect_table_format(parameters: dict[str, str]) -> str:
    """Detect table format from TABLE_PARAMS.

    Returns: "ICEBERG", "HUDI", "DELTA", or "HIVE"
    """
    # Iceberg: table_type=ICEBERG
    if parameters.get("table_type", "").upper() == "ICEBERG":
        return "ICEBERG"

    # Hudi / Delta: spark.sql.sources.provider
    provider = parameters.get("spark.sql.sources.provider", "").lower()
    if provider == "hudi":
        return "HUDI"
    if provider == "delta":
        return "DELTA"

    # Storage handler check (alternative Iceberg detection)
    handler = parameters.get("storage_handler", "")
    if "iceberg" in handler.lower():
        return "ICEBERG"

    return "HIVE"


def detect_file_format(
    input_format: str | None,
    parameters: dict[str, str],
    table_format: str,
) -> str | None:
    """Detect physical file format.

    For Iceberg: uses write.format.default param (default: PARQUET).
    For others: maps SDS.INPUT_FORMAT Java class to format name.
    """
    if table_format == "ICEBERG":
        return parameters.get("write.format.default", "PARQUET").upper()

    if input_format:
        return INPUT_FORMAT_MAP.get(input_format)

    return None


def detect_storage_location(
    sd_location: str | None,
    parameters: dict[str, str],
    table_format: str,
) -> str | None:
    """Detect storage location.

    For Iceberg: prefers metadata_location from TABLE_PARAMS.
    For others: uses SDS.LOCATION.
    """
    if table_format == "ICEBERG":
        return parameters.get("metadata_location") or sd_location
    return sd_location


def detect_table_type(raw_type: str) -> str:
    """Map Hive tableType to normalized table type."""
    return TABLE_TYPE_MAP.get(raw_type, "MANAGED_TABLE")
