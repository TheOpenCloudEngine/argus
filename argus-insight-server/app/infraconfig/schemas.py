"""Pydantic schemas for infrastructure configuration API."""

from pydantic import BaseModel, Field


class InfraConfigItem(BaseModel):
    """A single infrastructure configuration entry."""

    config_key: str
    config_value: str
    description: str | None = None


class InfraCategoryResponse(BaseModel):
    """Configuration items grouped by category."""

    category: str
    items: dict[str, str] = Field(
        description="Key-value pairs for this category",
    )


class InfraConfigResponse(BaseModel):
    """Full infrastructure configuration returned to the UI."""

    categories: list[InfraCategoryResponse] = Field(
        description="Configuration grouped by category",
    )


class UpdateInfraCategoryRequest(BaseModel):
    """Request to update settings within a single category."""

    category: str = Field(description="Category identifier (e.g. network)")
    items: dict[str, str] = Field(
        description="Key-value pairs to update",
    )
