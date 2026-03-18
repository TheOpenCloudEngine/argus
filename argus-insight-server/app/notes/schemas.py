"""Notes module schemas.

Pydantic models for request validation and response serialization.
Organized by entity: Notebook, Section, Page, and PageVersion.
"""

from datetime import datetime

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Notebook schemas
# ---------------------------------------------------------------------------


class NotebookCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=500)
    color: str = Field("default", max_length=20)


class NotebookUpdateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=500)
    color: str | None = Field(None, max_length=20)
    is_pinned: bool | None = None


class NotebookResponse(BaseModel):
    id: int
    user_id: int
    title: str
    description: str | None = None
    color: str
    is_pinned: bool
    section_count: int = 0
    page_count: int = 0
    created_at: datetime
    updated_at: datetime


class NotebookListResponse(BaseModel):
    items: list[NotebookResponse]
    total: int


# ---------------------------------------------------------------------------
# Section schemas
# ---------------------------------------------------------------------------


class SectionCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    color: str = Field("default", max_length=20)


class SectionUpdateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    color: str | None = Field(None, max_length=20)


class SectionReorderRequest(BaseModel):
    section_ids: list[int] = Field(..., min_length=1)


class SectionResponse(BaseModel):
    id: int
    notebook_id: int
    title: str
    color: str
    display_order: int
    page_count: int = 0
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Page schemas
# ---------------------------------------------------------------------------


class PageCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    content: str = Field("", max_length=1_000_000)


class PageUpdateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    content: str | None = Field(None, max_length=1_000_000)
    is_pinned: bool | None = None
    change_summary: str | None = Field(None, max_length=255)


class PageReorderRequest(BaseModel):
    page_ids: list[int] = Field(..., min_length=1)


class PageResponse(BaseModel):
    id: int
    section_id: int
    title: str
    content: str
    display_order: int
    is_pinned: bool
    current_version: int = 0
    created_at: datetime
    updated_at: datetime


class PageListItem(BaseModel):
    id: int
    section_id: int
    title: str
    display_order: int
    is_pinned: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Version schemas
# ---------------------------------------------------------------------------


class VersionResponse(BaseModel):
    id: int
    page_id: int
    version: int
    title: str
    content: str
    change_summary: str | None = None
    created_at: datetime


class VersionListItem(BaseModel):
    id: int
    version: int
    title: str
    change_summary: str | None = None
    created_at: datetime
