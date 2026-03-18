"""SQLAlchemy ORM models for the notes module.

Defines the database schema for the notes feature:
- ArgusNotebook: Top-level notebook container owned by a user.
- ArgusNotebookSection: Sections (tabs) within a notebook.
- ArgusNotebookPage: Pages containing markdown content within a section.
- ArgusNotebookPageVersion: Version history snapshots for pages.

Cascade delete is configured so that deleting a notebook removes all
child sections, pages, and page versions.
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func

from app.core.database import Base


class ArgusNotebook(Base):
    """Notebook table. Top-level container for notes, owned by a user."""

    __tablename__ = "argus_notebooks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("argus_users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(String(500))
    color = Column(String(20), nullable=False, default="default")
    is_pinned = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ArgusNotebookSection(Base):
    """Section table. Tab-like grouping within a notebook."""

    __tablename__ = "argus_notebook_sections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    notebook_id = Column(
        Integer, ForeignKey("argus_notebooks.id", ondelete="CASCADE"), nullable=False
    )
    title = Column(String(255), nullable=False)
    color = Column(String(20), nullable=False, default="default")
    display_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ArgusNotebookPage(Base):
    """Page table. Contains markdown content within a section."""

    __tablename__ = "argus_notebook_pages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    section_id = Column(
        Integer, ForeignKey("argus_notebook_sections.id", ondelete="CASCADE"), nullable=False
    )
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False, default="")
    display_order = Column(Integer, nullable=False, default=0)
    is_pinned = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ArgusNotebookPageVersion(Base):
    """Page version table. Stores full content snapshots for version history."""

    __tablename__ = "argus_notebook_page_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    page_id = Column(
        Integer, ForeignKey("argus_notebook_pages.id", ondelete="CASCADE"), nullable=False
    )
    version = Column(Integer, nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    change_summary = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
