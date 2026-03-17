"""SQLAlchemy ORM models for File Browser configuration."""

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, String, func

from app.core.database import Base


class ArgusConfigurationFilebrowser(Base):
    """File Browser global settings (key-value pairs)."""

    __tablename__ = "argus_configuration_filebrowser"

    id = Column(Integer, primary_key=True, autoincrement=True)
    config_key = Column(String(100), nullable=False, unique=True)
    config_value = Column(String(255), nullable=False)
    description = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ArgusConfigurationFilebrowserPreview(Base):
    """File Browser per-category preview limits."""

    __tablename__ = "argus_configuration_filebrowser_preview"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(String(50), nullable=False, unique=True)
    label = Column(String(100), nullable=False)
    max_file_size = Column(BigInteger, nullable=False)
    max_preview_rows = Column(Integer)
    description = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ArgusConfigurationFilebrowserExtension(Base):
    """File extension to preview category mapping."""

    __tablename__ = "argus_configuration_filebrowser_extension"

    id = Column(Integer, primary_key=True, autoincrement=True)
    preview_id = Column(
        Integer, ForeignKey("argus_configuration_filebrowser_preview.id"), nullable=False,
    )
    extension = Column(String(20), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
