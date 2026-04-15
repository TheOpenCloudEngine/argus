"""Local embedding provider using sentence-transformers.

Loads a sentence-transformers model locally and runs inference in a
thread pool to avoid blocking the async event loop.

Default model: all-MiniLM-L6-v2 (384 dimensions, ~80MB)
For Korean+English: paraphrase-multilingual-MiniLM-L12-v2 (384 dim, ~470MB)
"""

import asyncio
import logging

from app.embedding.base import EmbeddingProvider

logger = logging.getLogger(__name__)


class LocalEmbeddingProvider(EmbeddingProvider):
    """Sentence-transformers based local embedding provider."""

    def __init__(self, model_id: str = "all-MiniLM-L6-v2"):
        self._model_id = model_id
        self._model = None
        self._dim: int | None = None

    def _get_model(self):
        """Lazy-load the sentence-transformers model."""
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
            except ImportError:
                raise RuntimeError(
                    "sentence-transformers is required for local embedding. "
                    "Install with: pip install sentence-transformers"
                )
            logger.info("Loading sentence-transformers model: %s", self._model_id)
            self._model = SentenceTransformer(self._model_id)
            self._dim = self._model.get_sentence_embedding_dimension()
            logger.info("Model loaded: %s (dim=%d)", self._model_id, self._dim)
        return self._model

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed texts using sentence-transformers (runs in thread pool)."""
        model = self._get_model()
        loop = asyncio.get_event_loop()
        embeddings = await loop.run_in_executor(
            None,
            lambda: model.encode(texts, normalize_embeddings=True).tolist(),
        )
        return embeddings

    def dimension(self) -> int:
        """Return embedding dimension (loads model if needed)."""
        if self._dim is None:
            self._get_model()
        return self._dim

    def model_name(self) -> str:
        return self._model_id

    def provider_name(self) -> str:
        return "local"

    async def close(self) -> None:
        self._model = None
        self._dim = None
        logger.info("Local embedding provider closed")
