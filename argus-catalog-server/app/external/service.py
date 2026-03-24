"""External metadata service — builds JSON and manages cache."""

import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.models import (
    Dataset,
    DatasetSchema,
    DatasetTag,
    Owner,
    Platform,
    Tag,
)
from app.external.cache import get_cache

logger = logging.getLogger(__name__)


async def get_dataset_metadata(
    session: AsyncSession,
    dataset_id: int,
    no_cache: bool = False,
) -> dict | None:
    """Get dataset metadata JSON, using cache when available.

    Args:
        session: DB session.
        dataset_id: Dataset ID.
        no_cache: If True, bypass cache and fetch from DB.

    Returns:
        Metadata dict or None if dataset not found.
    """
    cache = get_cache()

    # 1) Check cache (unless no_cache)
    if not no_cache:
        cached = await cache.get(dataset_id)
        if cached is not None:
            cached["_cache"] = {
                "cached": True,
                "hit": True,
                "ttl_seconds": cache.ttl_seconds,
            }
            return cached

    # 2) Build from DB
    metadata = await _build_metadata(session, dataset_id)
    if metadata is None:
        return None

    # 3) Store in cache
    await cache.put(dataset_id, metadata)

    metadata["_cache"] = {
        "cached": False,
        "hit": False,
        "ttl_seconds": cache.ttl_seconds,
    }
    return metadata


async def _build_metadata(session: AsyncSession, dataset_id: int) -> dict | None:
    """Build metadata dict from DB queries."""
    # Dataset + Platform
    result = await session.execute(
        select(
            Dataset.id,
            Dataset.urn,
            Dataset.name,
            Dataset.description,
            Dataset.origin,
            Dataset.status,
            Dataset.qualified_name,
            Dataset.table_type,
            Dataset.storage_format,
            Dataset.is_synced,
            Dataset.platform_properties,
            Platform.id.label("platform_pk"),
            Platform.platform_id.label("platform_uid"),
            Platform.name.label("platform_name"),
            Platform.type.label("platform_type"),
        )
        .join(Platform, Dataset.platform_id == Platform.id)
        .where(Dataset.id == dataset_id)
    )
    row = result.first()
    if not row:
        return None

    # Schema fields
    schema_result = await session.execute(
        select(DatasetSchema)
        .where(DatasetSchema.dataset_id == dataset_id)
        .order_by(DatasetSchema.ordinal)
    )
    schema_rows = schema_result.scalars().all()

    # Tags
    tag_result = await session.execute(
        select(Tag.name)
        .join(DatasetTag, DatasetTag.tag_id == Tag.id)
        .where(DatasetTag.dataset_id == dataset_id)
    )
    tags = [t[0] for t in tag_result.all()]

    # Owners
    owner_result = await session.execute(
        select(Owner.owner_name, Owner.owner_type).where(Owner.dataset_id == dataset_id)
    )
    owners = [{"name": o[0], "type": o[1]} for o in owner_result.all()]

    # Platform properties
    properties = {}
    if row.platform_properties:
        try:
            properties = json.loads(row.platform_properties)
        except (json.JSONDecodeError, TypeError):
            properties = {}

    return {
        "dataset_id": row.id,
        "urn": row.urn,
        "name": row.name,
        "description": row.description,
        "origin": row.origin,
        "status": row.status,
        "qualified_name": row.qualified_name,
        "table_type": row.table_type,
        "storage_format": row.storage_format,
        "is_synced": row.is_synced,
        "platform": {
            "id": row.platform_pk,
            "platform_id": row.platform_uid,
            "name": row.platform_name,
            "type": row.platform_type,
        },
        "schema": [
            {
                "field_path": s.field_path,
                "field_type": s.field_type,
                "native_type": s.native_type,
                "description": s.description,
                "nullable": s.nullable,
                "is_primary_key": s.is_primary_key,
                "is_unique": s.is_unique,
                "is_indexed": s.is_indexed,
                "is_partition_key": s.is_partition_key,
                "is_distribution_key": s.is_distribution_key,
                "ordinal": s.ordinal,
                "pii_type": s.pii_type,
            }
            for s in schema_rows
        ],
        "tags": tags,
        "owners": owners,
        "properties": properties,
    }
