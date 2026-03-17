"""Notes module service layer.

Business logic for notebooks, sections, pages, and page version management.
All public functions accept an AsyncSession as the first parameter.
"""

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.notes.models import (
    ArgusNotebook,
    ArgusNotebookPage,
    ArgusNotebookPageVersion,
    ArgusNotebookSection,
)
from app.notes.schemas import (
    NotebookCreateRequest,
    NotebookListResponse,
    NotebookResponse,
    NotebookUpdateRequest,
    PageCreateRequest,
    PageListItem,
    PageResponse,
    PageUpdateRequest,
    SectionCreateRequest,
    SectionResponse,
    SectionUpdateRequest,
    VersionListItem,
    VersionResponse,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Notebook operations
# ---------------------------------------------------------------------------


async def _build_notebook_response(
    session: AsyncSession, notebook: ArgusNotebook
) -> NotebookResponse:
    """Build NotebookResponse with section and page counts."""
    section_count_q = select(func.count()).where(ArgusNotebookSection.notebook_id == notebook.id)
    section_count = (await session.execute(section_count_q)).scalar() or 0

    page_count_q = (
        select(func.count())
        .select_from(ArgusNotebookPage)
        .join(ArgusNotebookSection, ArgusNotebookPage.section_id == ArgusNotebookSection.id)
        .where(ArgusNotebookSection.notebook_id == notebook.id)
    )
    page_count = (await session.execute(page_count_q)).scalar() or 0

    return NotebookResponse(
        id=notebook.id,
        user_id=notebook.user_id,
        title=notebook.title,
        description=notebook.description,
        color=notebook.color,
        is_pinned=notebook.is_pinned,
        section_count=section_count,
        page_count=page_count,
        created_at=notebook.created_at,
        updated_at=notebook.updated_at,
    )


async def list_notebooks(
    session: AsyncSession, user_id: int, search: str | None = None
) -> NotebookListResponse:
    """List all notebooks for a user."""
    base = select(ArgusNotebook).where(ArgusNotebook.user_id == user_id)
    if search:
        pattern = f"%{search}%"
        base = base.where(ArgusNotebook.title.ilike(pattern))

    count_q = select(func.count()).select_from(base.subquery())
    total = (await session.execute(count_q)).scalar() or 0

    query = base.order_by(ArgusNotebook.is_pinned.desc(), ArgusNotebook.updated_at.desc())
    result = await session.execute(query)
    notebooks = result.scalars().all()

    items = []
    for nb in notebooks:
        items.append(await _build_notebook_response(session, nb))

    return NotebookListResponse(items=items, total=total)


async def get_notebook(
    session: AsyncSession, notebook_id: int, user_id: int
) -> NotebookResponse | None:
    """Get a single notebook by ID."""
    result = await session.execute(
        select(ArgusNotebook).where(
            ArgusNotebook.id == notebook_id, ArgusNotebook.user_id == user_id
        )
    )
    notebook = result.scalars().first()
    if not notebook:
        return None
    return await _build_notebook_response(session, notebook)


async def create_notebook(
    session: AsyncSession, user_id: int, req: NotebookCreateRequest
) -> NotebookResponse:
    """Create a new notebook with a default section."""
    notebook = ArgusNotebook(
        user_id=user_id,
        title=req.title,
        description=req.description,
        color=req.color,
    )
    session.add(notebook)
    await session.flush()

    # Create a default section
    section = ArgusNotebookSection(
        notebook_id=notebook.id,
        title="General",
        display_order=0,
    )
    session.add(section)
    await session.commit()
    await session.refresh(notebook)
    logger.info("Notebook created: %s (id=%d)", notebook.title, notebook.id)
    return await _build_notebook_response(session, notebook)


async def update_notebook(
    session: AsyncSession, notebook_id: int, user_id: int, req: NotebookUpdateRequest
) -> NotebookResponse | None:
    """Update notebook fields."""
    result = await session.execute(
        select(ArgusNotebook).where(
            ArgusNotebook.id == notebook_id, ArgusNotebook.user_id == user_id
        )
    )
    notebook = result.scalars().first()
    if not notebook:
        return None

    if req.title is not None:
        notebook.title = req.title
    if req.description is not None:
        notebook.description = req.description
    if req.color is not None:
        notebook.color = req.color
    if req.is_pinned is not None:
        notebook.is_pinned = req.is_pinned

    await session.commit()
    await session.refresh(notebook)
    logger.info("Notebook updated: %s (id=%d)", notebook.title, notebook.id)
    return await _build_notebook_response(session, notebook)


async def delete_notebook(session: AsyncSession, notebook_id: int, user_id: int) -> bool:
    """Delete a notebook (cascade deletes sections, pages, versions)."""
    result = await session.execute(
        select(ArgusNotebook).where(
            ArgusNotebook.id == notebook_id, ArgusNotebook.user_id == user_id
        )
    )
    notebook = result.scalars().first()
    if not notebook:
        return False
    await session.delete(notebook)
    await session.commit()
    logger.info("Notebook deleted: %s (id=%d)", notebook.title, notebook.id)
    return True


# ---------------------------------------------------------------------------
# Section operations
# ---------------------------------------------------------------------------


async def _build_section_response(
    session: AsyncSession, section: ArgusNotebookSection
) -> SectionResponse:
    page_count_q = select(func.count()).where(ArgusNotebookPage.section_id == section.id)
    page_count = (await session.execute(page_count_q)).scalar() or 0
    return SectionResponse(
        id=section.id,
        notebook_id=section.notebook_id,
        title=section.title,
        color=section.color,
        display_order=section.display_order,
        page_count=page_count,
        created_at=section.created_at,
        updated_at=section.updated_at,
    )


async def list_sections(
    session: AsyncSession, notebook_id: int, user_id: int
) -> list[SectionResponse]:
    """List all sections for a notebook (verifies ownership)."""
    # Verify notebook ownership
    nb = await session.execute(
        select(ArgusNotebook).where(
            ArgusNotebook.id == notebook_id, ArgusNotebook.user_id == user_id
        )
    )
    if not nb.scalars().first():
        return []

    result = await session.execute(
        select(ArgusNotebookSection)
        .where(ArgusNotebookSection.notebook_id == notebook_id)
        .order_by(ArgusNotebookSection.display_order)
    )
    sections = result.scalars().all()
    return [await _build_section_response(session, s) for s in sections]


async def create_section(
    session: AsyncSession, notebook_id: int, user_id: int, req: SectionCreateRequest
) -> SectionResponse | None:
    """Create a new section in a notebook."""
    nb = await session.execute(
        select(ArgusNotebook).where(
            ArgusNotebook.id == notebook_id, ArgusNotebook.user_id == user_id
        )
    )
    if not nb.scalars().first():
        return None

    # Get next display_order
    max_order_q = select(func.coalesce(func.max(ArgusNotebookSection.display_order), -1)).where(
        ArgusNotebookSection.notebook_id == notebook_id
    )
    max_order = (await session.execute(max_order_q)).scalar()

    section = ArgusNotebookSection(
        notebook_id=notebook_id,
        title=req.title,
        color=req.color,
        display_order=max_order + 1,
    )
    session.add(section)
    await session.commit()
    await session.refresh(section)
    logger.info("Section created: %s (id=%d)", section.title, section.id)
    return await _build_section_response(session, section)


async def update_section(
    session: AsyncSession, section_id: int, user_id: int, req: SectionUpdateRequest
) -> SectionResponse | None:
    """Update section fields."""
    result = await session.execute(
        select(ArgusNotebookSection)
        .join(ArgusNotebook, ArgusNotebookSection.notebook_id == ArgusNotebook.id)
        .where(ArgusNotebookSection.id == section_id, ArgusNotebook.user_id == user_id)
    )
    section = result.scalars().first()
    if not section:
        return None

    if req.title is not None:
        section.title = req.title
    if req.color is not None:
        section.color = req.color

    await session.commit()
    await session.refresh(section)
    logger.info("Section updated: %s (id=%d)", section.title, section.id)
    return await _build_section_response(session, section)


async def delete_section(session: AsyncSession, section_id: int, user_id: int) -> bool:
    """Delete a section (cascade deletes pages and versions)."""
    result = await session.execute(
        select(ArgusNotebookSection)
        .join(ArgusNotebook, ArgusNotebookSection.notebook_id == ArgusNotebook.id)
        .where(ArgusNotebookSection.id == section_id, ArgusNotebook.user_id == user_id)
    )
    section = result.scalars().first()
    if not section:
        return False
    await session.delete(section)
    await session.commit()
    logger.info("Section deleted: id=%d", section_id)
    return True


async def reorder_sections(session: AsyncSession, section_ids: list[int], user_id: int) -> bool:
    """Reorder sections by updating display_order."""
    for i, sid in enumerate(section_ids):
        result = await session.execute(
            select(ArgusNotebookSection)
            .join(ArgusNotebook, ArgusNotebookSection.notebook_id == ArgusNotebook.id)
            .where(ArgusNotebookSection.id == sid, ArgusNotebook.user_id == user_id)
        )
        section = result.scalars().first()
        if section:
            section.display_order = i
    await session.commit()
    return True


# ---------------------------------------------------------------------------
# Page operations
# ---------------------------------------------------------------------------


async def _get_current_version(session: AsyncSession, page_id: int) -> int:
    """Get the current (highest) version number for a page."""
    q = select(func.coalesce(func.max(ArgusNotebookPageVersion.version), 0)).where(
        ArgusNotebookPageVersion.page_id == page_id
    )
    return (await session.execute(q)).scalar() or 0


async def list_pages(session: AsyncSession, section_id: int, user_id: int) -> list[PageListItem]:
    """List all pages for a section."""
    # Verify ownership
    result = await session.execute(
        select(ArgusNotebookSection)
        .join(ArgusNotebook, ArgusNotebookSection.notebook_id == ArgusNotebook.id)
        .where(ArgusNotebookSection.id == section_id, ArgusNotebook.user_id == user_id)
    )
    if not result.scalars().first():
        return []

    result = await session.execute(
        select(ArgusNotebookPage)
        .where(ArgusNotebookPage.section_id == section_id)
        .order_by(ArgusNotebookPage.is_pinned.desc(), ArgusNotebookPage.display_order)
    )
    pages = result.scalars().all()
    return [
        PageListItem(
            id=p.id,
            section_id=p.section_id,
            title=p.title,
            display_order=p.display_order,
            is_pinned=p.is_pinned,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in pages
    ]


async def get_page(session: AsyncSession, page_id: int, user_id: int) -> PageResponse | None:
    """Get a single page with content."""
    result = await session.execute(
        select(ArgusNotebookPage)
        .join(ArgusNotebookSection, ArgusNotebookPage.section_id == ArgusNotebookSection.id)
        .join(ArgusNotebook, ArgusNotebookSection.notebook_id == ArgusNotebook.id)
        .where(ArgusNotebookPage.id == page_id, ArgusNotebook.user_id == user_id)
    )
    page = result.scalars().first()
    if not page:
        return None

    current_version = await _get_current_version(session, page.id)
    return PageResponse(
        id=page.id,
        section_id=page.section_id,
        title=page.title,
        content=page.content,
        display_order=page.display_order,
        is_pinned=page.is_pinned,
        current_version=current_version,
        created_at=page.created_at,
        updated_at=page.updated_at,
    )


async def create_page(
    session: AsyncSession, section_id: int, user_id: int, req: PageCreateRequest
) -> PageResponse | None:
    """Create a new page in a section."""
    # Verify ownership
    sec_result = await session.execute(
        select(ArgusNotebookSection)
        .join(ArgusNotebook, ArgusNotebookSection.notebook_id == ArgusNotebook.id)
        .where(ArgusNotebookSection.id == section_id, ArgusNotebook.user_id == user_id)
    )
    if not sec_result.scalars().first():
        return None

    # Get next display_order
    max_order_q = select(func.coalesce(func.max(ArgusNotebookPage.display_order), -1)).where(
        ArgusNotebookPage.section_id == section_id
    )
    max_order = (await session.execute(max_order_q)).scalar()

    page = ArgusNotebookPage(
        section_id=section_id,
        title=req.title,
        content=req.content,
        display_order=max_order + 1,
    )
    session.add(page)
    await session.flush()

    # Create initial version (v1)
    version = ArgusNotebookPageVersion(
        page_id=page.id,
        version=1,
        title=page.title,
        content=page.content,
        change_summary="Initial version",
    )
    session.add(version)
    await session.commit()
    await session.refresh(page)
    logger.info("Page created: %s (id=%d)", page.title, page.id)

    return PageResponse(
        id=page.id,
        section_id=page.section_id,
        title=page.title,
        content=page.content,
        display_order=page.display_order,
        is_pinned=page.is_pinned,
        current_version=1,
        created_at=page.created_at,
        updated_at=page.updated_at,
    )


async def update_page(
    session: AsyncSession, page_id: int, user_id: int, req: PageUpdateRequest
) -> PageResponse | None:
    """Update a page. Creates a new version snapshot when content or title changes."""
    result = await session.execute(
        select(ArgusNotebookPage)
        .join(ArgusNotebookSection, ArgusNotebookPage.section_id == ArgusNotebookSection.id)
        .join(ArgusNotebook, ArgusNotebookSection.notebook_id == ArgusNotebook.id)
        .where(ArgusNotebookPage.id == page_id, ArgusNotebook.user_id == user_id)
    )
    page = result.scalars().first()
    if not page:
        return None

    content_changed = req.content is not None and req.content != page.content
    title_changed = req.title is not None and req.title != page.title

    if req.title is not None:
        page.title = req.title
    if req.content is not None:
        page.content = req.content
    if req.is_pinned is not None:
        page.is_pinned = req.is_pinned

    # Create version snapshot if content or title changed
    if content_changed or title_changed:
        current_ver = await _get_current_version(session, page.id)
        new_ver = ArgusNotebookPageVersion(
            page_id=page.id,
            version=current_ver + 1,
            title=page.title,
            content=page.content,
            change_summary=req.change_summary,
        )
        session.add(new_ver)

    await session.commit()
    await session.refresh(page)
    logger.info("Page updated: %s (id=%d)", page.title, page.id)

    current_version = await _get_current_version(session, page.id)
    return PageResponse(
        id=page.id,
        section_id=page.section_id,
        title=page.title,
        content=page.content,
        display_order=page.display_order,
        is_pinned=page.is_pinned,
        current_version=current_version,
        created_at=page.created_at,
        updated_at=page.updated_at,
    )


async def delete_page(session: AsyncSession, page_id: int, user_id: int) -> bool:
    """Delete a page (cascade deletes versions)."""
    result = await session.execute(
        select(ArgusNotebookPage)
        .join(ArgusNotebookSection, ArgusNotebookPage.section_id == ArgusNotebookSection.id)
        .join(ArgusNotebook, ArgusNotebookSection.notebook_id == ArgusNotebook.id)
        .where(ArgusNotebookPage.id == page_id, ArgusNotebook.user_id == user_id)
    )
    page = result.scalars().first()
    if not page:
        return False
    await session.delete(page)
    await session.commit()
    logger.info("Page deleted: id=%d", page_id)
    return True


async def reorder_pages(session: AsyncSession, page_ids: list[int], user_id: int) -> bool:
    """Reorder pages by updating display_order."""
    for i, pid in enumerate(page_ids):
        result = await session.execute(
            select(ArgusNotebookPage)
            .join(ArgusNotebookSection, ArgusNotebookPage.section_id == ArgusNotebookSection.id)
            .join(ArgusNotebook, ArgusNotebookSection.notebook_id == ArgusNotebook.id)
            .where(ArgusNotebookPage.id == pid, ArgusNotebook.user_id == user_id)
        )
        page = result.scalars().first()
        if page:
            page.display_order = i
    await session.commit()
    return True


# ---------------------------------------------------------------------------
# Version operations
# ---------------------------------------------------------------------------


async def list_versions(session: AsyncSession, page_id: int, user_id: int) -> list[VersionListItem]:
    """List version history for a page."""
    # Verify ownership
    page_result = await session.execute(
        select(ArgusNotebookPage)
        .join(ArgusNotebookSection, ArgusNotebookPage.section_id == ArgusNotebookSection.id)
        .join(ArgusNotebook, ArgusNotebookSection.notebook_id == ArgusNotebook.id)
        .where(ArgusNotebookPage.id == page_id, ArgusNotebook.user_id == user_id)
    )
    if not page_result.scalars().first():
        return []

    result = await session.execute(
        select(ArgusNotebookPageVersion)
        .where(ArgusNotebookPageVersion.page_id == page_id)
        .order_by(ArgusNotebookPageVersion.version.desc())
    )
    versions = result.scalars().all()
    return [
        VersionListItem(
            id=v.id,
            version=v.version,
            title=v.title,
            change_summary=v.change_summary,
            created_at=v.created_at,
        )
        for v in versions
    ]


async def get_version(
    session: AsyncSession, page_id: int, version: int, user_id: int
) -> VersionResponse | None:
    """Get a specific version of a page."""
    result = await session.execute(
        select(ArgusNotebookPageVersion)
        .join(ArgusNotebookPage, ArgusNotebookPageVersion.page_id == ArgusNotebookPage.id)
        .join(ArgusNotebookSection, ArgusNotebookPage.section_id == ArgusNotebookSection.id)
        .join(ArgusNotebook, ArgusNotebookSection.notebook_id == ArgusNotebook.id)
        .where(
            ArgusNotebookPageVersion.page_id == page_id,
            ArgusNotebookPageVersion.version == version,
            ArgusNotebook.user_id == user_id,
        )
    )
    ver = result.scalars().first()
    if not ver:
        return None
    return VersionResponse(
        id=ver.id,
        page_id=ver.page_id,
        version=ver.version,
        title=ver.title,
        content=ver.content,
        change_summary=ver.change_summary,
        created_at=ver.created_at,
    )


async def restore_version(
    session: AsyncSession, page_id: int, version: int, user_id: int
) -> PageResponse | None:
    """Restore a page to a specific version. Creates a new version entry."""
    ver_result = await session.execute(
        select(ArgusNotebookPageVersion)
        .join(ArgusNotebookPage, ArgusNotebookPageVersion.page_id == ArgusNotebookPage.id)
        .join(ArgusNotebookSection, ArgusNotebookPage.section_id == ArgusNotebookSection.id)
        .join(ArgusNotebook, ArgusNotebookSection.notebook_id == ArgusNotebook.id)
        .where(
            ArgusNotebookPageVersion.page_id == page_id,
            ArgusNotebookPageVersion.version == version,
            ArgusNotebook.user_id == user_id,
        )
    )
    old_ver = ver_result.scalars().first()
    if not old_ver:
        return None

    # Get the page
    page_result = await session.execute(
        select(ArgusNotebookPage).where(ArgusNotebookPage.id == page_id)
    )
    page = page_result.scalars().first()
    if not page:
        return None

    # Update page content
    page.title = old_ver.title
    page.content = old_ver.content

    # Create a new version for this restore
    current_ver = await _get_current_version(session, page_id)
    new_ver = ArgusNotebookPageVersion(
        page_id=page_id,
        version=current_ver + 1,
        title=old_ver.title,
        content=old_ver.content,
        change_summary=f"Restored from version {version}",
    )
    session.add(new_ver)
    await session.commit()
    await session.refresh(page)
    logger.info("Page restored to version %d (page_id=%d)", version, page_id)

    new_current = await _get_current_version(session, page_id)
    return PageResponse(
        id=page.id,
        section_id=page.section_id,
        title=page.title,
        content=page.content,
        display_order=page.display_order,
        is_pinned=page.is_pinned,
        current_version=new_current,
        created_at=page.created_at,
        updated_at=page.updated_at,
    )
