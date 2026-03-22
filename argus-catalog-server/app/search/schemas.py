"""Pydantic schemas for semantic/hybrid search API."""

from pydantic import BaseModel, Field

from app.catalog.schemas import DatasetSummary


class SemanticSearchResult(BaseModel):
    """Single search result with relevance score."""
    dataset: DatasetSummary
    score: float = Field(..., description="Relevance score (0.0 - 1.0)")
    match_type: str = Field(..., description="'semantic', 'keyword', or 'hybrid'")


class SemanticSearchResponse(BaseModel):
    """Search response with results and metadata."""
    items: list[SemanticSearchResult]
    total: int
    query: str
    provider: str | None = None
    model: str | None = None
