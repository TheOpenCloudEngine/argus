"""Abstract base class for embedding providers.

All embedding providers (local, OpenAI, Ollama) implement this interface.
The registry module manages the active provider as a singleton.
"""

from abc import ABC, abstractmethod


class EmbeddingProvider(ABC):
    """Pluggable embedding provider interface."""

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of texts. Returns list of float vectors."""
        ...

    @abstractmethod
    def dimension(self) -> int:
        """Return the embedding vector dimension for this provider/model."""
        ...

    @abstractmethod
    def model_name(self) -> str:
        """Return the model identifier string (e.g. 'all-MiniLM-L6-v2')."""
        ...

    @abstractmethod
    def provider_name(self) -> str:
        """Return provider type: 'local', 'openai', 'ollama'."""
        ...

    async def close(self) -> None:
        """Release resources. Override if cleanup is needed."""
        pass
