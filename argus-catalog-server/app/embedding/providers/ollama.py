"""Ollama embedding provider.

Uses a locally running Ollama instance for embeddings.
Default endpoint: http://localhost:11434
Default model: all-minilm (384 dimensions)
"""

import logging

import httpx

from app.embedding.base import EmbeddingProvider

logger = logging.getLogger(__name__)


class OllamaEmbeddingProvider(EmbeddingProvider):
    """Ollama API based embedding provider."""

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        model_id: str = "all-minilm",
    ):
        self._base_url = base_url.rstrip("/")
        self._model_id = model_id
        self._client = httpx.AsyncClient(timeout=60.0)
        self._dim: int | None = None

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed texts via Ollama API (one request per text)."""
        results = []
        for text in texts:
            resp = await self._client.post(
                f"{self._base_url}/api/embeddings",
                json={"model": self._model_id, "prompt": text},
            )
            resp.raise_for_status()
            vec = resp.json()["embedding"]
            results.append(vec)
            if self._dim is None:
                self._dim = len(vec)
                logger.info("Ollama model %s dimension detected: %d", self._model_id, self._dim)
        return results

    def dimension(self) -> int:
        return self._dim or 384

    def model_name(self) -> str:
        return self._model_id

    def provider_name(self) -> str:
        return "ollama"

    async def close(self) -> None:
        await self._client.aclose()
        logger.info("Ollama embedding provider closed")
