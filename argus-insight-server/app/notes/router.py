"""Notes API endpoints.

Defines the FastAPI router for notebook, section, page, and version operations.
All endpoints are prefixed with `/notes` and tagged for OpenAPI grouping.

Current user ID is hardcoded to 1 (same pattern as auth module).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.notes import service
from app.notes.schemas import (
    NotebookCreateRequest,
    NotebookListResponse,
    NotebookResponse,
    NotebookUpdateRequest,
    PageCreateRequest,
    PageListItem,
    PageReorderRequest,
    PageResponse,
    PageUpdateRequest,
    SectionCreateRequest,
    SectionReorderRequest,
    SectionResponse,
    SectionUpdateRequest,
    VersionListItem,
    VersionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["notes"])

# FIXME: Extract user_id from auth token. Currently hardcoded to 1.
CURRENT_USER_ID = 1


# ---------------------------------------------------------------------------
# Notebook endpoints
# ---------------------------------------------------------------------------


@router.get("/notebooks", response_model=NotebookListResponse)
async def list_notebooks(
    search: str | None = Query(None, description="Search notebook titles"),
    session: AsyncSession = Depends(get_session),
):
    """List all notebooks for the current user."""
    return await service.list_notebooks(session, CURRENT_USER_ID, search=search)


@router.post("/notebooks", response_model=NotebookResponse)
async def create_notebook(req: NotebookCreateRequest, session: AsyncSession = Depends(get_session)):
    """Create a new notebook with a default 'General' section."""
    return await service.create_notebook(session, CURRENT_USER_ID, req)


@router.get("/notebooks/{notebook_id}", response_model=NotebookResponse)
async def get_notebook(notebook_id: int, session: AsyncSession = Depends(get_session)):
    """Get notebook details."""
    notebook = await service.get_notebook(session, notebook_id, CURRENT_USER_ID)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return notebook


@router.put("/notebooks/{notebook_id}", response_model=NotebookResponse)
async def update_notebook(
    notebook_id: int,
    req: NotebookUpdateRequest,
    session: AsyncSession = Depends(get_session),
):
    """Update notebook properties."""
    notebook = await service.update_notebook(session, notebook_id, CURRENT_USER_ID, req)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return notebook


@router.delete("/notebooks/{notebook_id}")
async def delete_notebook(notebook_id: int, session: AsyncSession = Depends(get_session)):
    """Delete a notebook and all its sections, pages, and versions."""
    if not await service.delete_notebook(session, notebook_id, CURRENT_USER_ID):
        raise HTTPException(status_code=404, detail="Notebook not found")
    return {"status": "ok", "message": "Notebook deleted"}


# ---------------------------------------------------------------------------
# Section endpoints
# ---------------------------------------------------------------------------


@router.get("/notebooks/{notebook_id}/sections", response_model=list[SectionResponse])
async def list_sections(notebook_id: int, session: AsyncSession = Depends(get_session)):
    """List all sections in a notebook."""
    return await service.list_sections(session, notebook_id, CURRENT_USER_ID)


@router.post("/notebooks/{notebook_id}/sections", response_model=SectionResponse)
async def create_section(
    notebook_id: int,
    req: SectionCreateRequest,
    session: AsyncSession = Depends(get_session),
):
    """Create a new section in a notebook."""
    section = await service.create_section(session, notebook_id, CURRENT_USER_ID, req)
    if not section:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return section


@router.put("/sections/{section_id}", response_model=SectionResponse)
async def update_section(
    section_id: int,
    req: SectionUpdateRequest,
    session: AsyncSession = Depends(get_session),
):
    """Update section properties."""
    section = await service.update_section(session, section_id, CURRENT_USER_ID, req)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    return section


@router.delete("/sections/{section_id}")
async def delete_section(section_id: int, session: AsyncSession = Depends(get_session)):
    """Delete a section and all its pages and versions."""
    if not await service.delete_section(session, section_id, CURRENT_USER_ID):
        raise HTTPException(status_code=404, detail="Section not found")
    return {"status": "ok", "message": "Section deleted"}


@router.put("/sections/reorder")
async def reorder_sections(
    req: SectionReorderRequest, session: AsyncSession = Depends(get_session)
):
    """Reorder sections by providing ordered section IDs."""
    await service.reorder_sections(session, req.section_ids, CURRENT_USER_ID)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Page endpoints
# ---------------------------------------------------------------------------


@router.get("/sections/{section_id}/pages", response_model=list[PageListItem])
async def list_pages(section_id: int, session: AsyncSession = Depends(get_session)):
    """List all pages in a section (without content)."""
    return await service.list_pages(session, section_id, CURRENT_USER_ID)


@router.post("/sections/{section_id}/pages", response_model=PageResponse)
async def create_page(
    section_id: int,
    req: PageCreateRequest,
    session: AsyncSession = Depends(get_session),
):
    """Create a new page in a section."""
    page = await service.create_page(session, section_id, CURRENT_USER_ID, req)
    if not page:
        raise HTTPException(status_code=404, detail="Section not found")
    return page


@router.get("/pages/{page_id}", response_model=PageResponse)
async def get_page(page_id: int, session: AsyncSession = Depends(get_session)):
    """Get page with content."""
    page = await service.get_page(session, page_id, CURRENT_USER_ID)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.put("/pages/{page_id}", response_model=PageResponse)
async def update_page(
    page_id: int,
    req: PageUpdateRequest,
    session: AsyncSession = Depends(get_session),
):
    """Update page content. Automatically creates a version snapshot."""
    page = await service.update_page(session, page_id, CURRENT_USER_ID, req)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.delete("/pages/{page_id}")
async def delete_page(page_id: int, session: AsyncSession = Depends(get_session)):
    """Delete a page and all its versions."""
    if not await service.delete_page(session, page_id, CURRENT_USER_ID):
        raise HTTPException(status_code=404, detail="Page not found")
    return {"status": "ok", "message": "Page deleted"}


@router.put("/pages/reorder")
async def reorder_pages(req: PageReorderRequest, session: AsyncSession = Depends(get_session)):
    """Reorder pages by providing ordered page IDs."""
    await service.reorder_pages(session, req.page_ids, CURRENT_USER_ID)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Version endpoints
# ---------------------------------------------------------------------------


@router.get("/pages/{page_id}/versions", response_model=list[VersionListItem])
async def list_versions(page_id: int, session: AsyncSession = Depends(get_session)):
    """List version history for a page."""
    return await service.list_versions(session, page_id, CURRENT_USER_ID)


@router.get("/pages/{page_id}/versions/{version}", response_model=VersionResponse)
async def get_version(page_id: int, version: int, session: AsyncSession = Depends(get_session)):
    """Get a specific version of a page."""
    ver = await service.get_version(session, page_id, version, CURRENT_USER_ID)
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")
    return ver


@router.post("/pages/{page_id}/versions/{version}/restore", response_model=PageResponse)
async def restore_version(page_id: int, version: int, session: AsyncSession = Depends(get_session)):
    """Restore a page to a specific version. Creates a new version entry."""
    page = await service.restore_version(session, page_id, version, CURRENT_USER_ID)
    if not page:
        raise HTTPException(status_code=404, detail="Version not found")
    return page
