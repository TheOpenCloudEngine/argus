"""SQLAlchemy ORM models for ML Model Registry.

Modeled after Unity Catalog OSS:
- RegisteredModel: ML model metadata with version tracking
- ModelVersion: Immutable model version with status lifecycle
"""

from sqlalchemy import (
    Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func,
)

from app.core.database import Base


class RegisteredModel(Base):
    """Registered ML model."""

    __tablename__ = "models_registered_models"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, unique=True)
    urn = Column(String(500), nullable=False, unique=True)
    platform_id = Column(Integer, ForeignKey("catalog_platforms.id", ondelete="SET NULL"),
                         nullable=True)
    description = Column(Text)
    owner = Column(String(200))
    storage_location = Column(String(1000))
    max_version_number = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(String(200))
    updated_by = Column(String(200))


class ModelVersion(Base):
    """Model version with status lifecycle."""

    __tablename__ = "models_model_versions"
    __table_args__ = (UniqueConstraint("model_id", "version"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_id = Column(Integer, ForeignKey("models_registered_models.id", ondelete="CASCADE"),
                      nullable=False)
    version = Column(Integer, nullable=False)
    source = Column(String(1000))
    run_id = Column(String(255))
    run_link = Column(String(1000))
    description = Column(Text)
    status = Column(String(30), nullable=False, default="PENDING_REGISTRATION")
    storage_location = Column(String(1000))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(String(200))
    updated_by = Column(String(200))
