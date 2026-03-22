"""Embedding provider registry — singleton manager.

Manages the active embedding provider lifecycle. Loads configuration
from the catalog_configuration DB table and creates the appropriate
provider instance. Only one provider is active at a time.
"""

import logging

from app.embedding.base import EmbeddingProvider

logger = logging.getLogger(__name__)

_current_provider: EmbeddingProvider | None = None


async def get_provider() -> EmbeddingProvider | None:
    """Return the current embedding provider, or None if not initialized."""
    return _current_provider


async def initialize_provider(config: dict[str, str]) -> EmbeddingProvider:
    """Create and set the active embedding provider from DB configuration.

    Closes any existing provider before creating a new one.
    """
    global _current_provider

    if _current_provider is not None:
        await _current_provider.close()
        _current_provider = None

    provider_type = config.get("embedding_provider", "local")
    model_id = config.get("embedding_model", "all-MiniLM-L6-v2")

    if provider_type == "local":
        from app.embedding.providers.local import LocalEmbeddingProvider
        _current_provider = LocalEmbeddingProvider(model_id=model_id)

    elif provider_type == "openai":
        from app.embedding.providers.openai import OpenAIEmbeddingProvider
        _current_provider = OpenAIEmbeddingProvider(
            api_key=config.get("embedding_api_key", ""),
            model_id=model_id,
            base_url=config.get("embedding_api_url", "https://api.openai.com/v1"),
        )

    elif provider_type == "ollama":
        from app.embedding.providers.ollama import OllamaEmbeddingProvider
        _current_provider = OllamaEmbeddingProvider(
            base_url=config.get("embedding_api_url", "http://localhost:11434"),
            model_id=model_id,
        )

    else:
        raise ValueError(f"Unknown embedding provider: {provider_type}")

    logger.info(
        "Embedding provider initialized: %s (model=%s)",
        provider_type, _current_provider.model_name(),
    )
    return _current_provider


async def shutdown_provider() -> None:
    """Close and release the current provider."""
    global _current_provider
    if _current_provider:
        await _current_provider.close()
        _current_provider = None
        logger.info("Embedding provider shut down")
