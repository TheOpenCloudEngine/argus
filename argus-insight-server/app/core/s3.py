"""S3-compatible object storage client.

Provides a shared aioboto3 session for async S3 operations,
compatible with both AWS S3 and MinIO.
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import aioboto3

from app.core.config import settings

logger = logging.getLogger(__name__)

_session: aioboto3.Session | None = None


def get_session() -> aioboto3.Session:
    """Get or create the shared aioboto3 session."""
    global _session
    if _session is None:
        _session = aioboto3.Session()
    return _session


@asynccontextmanager
async def get_s3_client() -> AsyncGenerator:
    """Yield an async S3 client configured from application settings.

    Usage::

        async with get_s3_client() as s3:
            await s3.list_objects_v2(Bucket="my-bucket")
    """
    session = get_session()
    async with session.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        use_ssl=settings.s3_use_ssl,
    ) as client:
        yield client


async def ensure_bucket(bucket: str) -> None:
    """Create the bucket if it does not exist."""
    async with get_s3_client() as s3:
        try:
            await s3.head_bucket(Bucket=bucket)
        except Exception:
            logger.info("Bucket '%s' not found, creating...", bucket)
            await s3.create_bucket(Bucket=bucket)
            logger.info("Bucket '%s' created", bucket)
