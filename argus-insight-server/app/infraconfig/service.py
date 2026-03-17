"""Infrastructure configuration service."""

import logging
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infraconfig.models import ArgusConfigurationInfra
from app.infraconfig.schemas import InfraCategoryResponse, InfraConfigResponse

logger = logging.getLogger(__name__)


async def get_infra_config(session: AsyncSession) -> InfraConfigResponse:
    """Load all infrastructure configuration from the database."""
    result = await session.execute(select(ArgusConfigurationInfra))
    rows = result.scalars().all()

    grouped: dict[str, dict[str, str]] = defaultdict(dict)
    for row in rows:
        grouped[row.category][row.config_key] = row.config_value

    categories = [
        InfraCategoryResponse(category=cat, items=items)
        for cat, items in sorted(grouped.items())
    ]

    logger.info("InfraConfig: categories=%d total_keys=%d", len(categories), len(rows))
    return InfraConfigResponse(categories=categories)


async def update_infra_category(
    session: AsyncSession,
    category: str,
    items: dict[str, str],
) -> None:
    """Update settings within a single infrastructure category."""
    for key, value in items.items():
        result = await session.execute(
            select(ArgusConfigurationInfra).where(
                ArgusConfigurationInfra.config_key == key,
                ArgusConfigurationInfra.category == category,
            )
        )
        row = result.scalar_one_or_none()
        if row:
            row.config_value = value
        else:
            session.add(ArgusConfigurationInfra(
                category=category, config_key=key, config_value=value,
            ))
    await session.commit()
    logger.info("UpdateInfraCategory: category=%s keys=%s", category, list(items.keys()))


async def seed_infra_config(session: AsyncSession) -> None:
    """Seed default infrastructure configuration if not present."""
    defaults = [
        ("network", "domain_name", "", "Domain name for this infrastructure"),
        ("network", "dns_server_1", "", "Primary DNS server"),
        ("network", "dns_server_2", "", "Secondary DNS server"),
        ("network", "dns_server_3", "", "Tertiary DNS server"),
    ]
    for category, key, value, description in defaults:
        result = await session.execute(
            select(ArgusConfigurationInfra).where(
                ArgusConfigurationInfra.config_key == key
            )
        )
        if result.scalar_one_or_none() is None:
            session.add(ArgusConfigurationInfra(
                category=category,
                config_key=key,
                config_value=value,
                description=description,
            ))
    await session.commit()
