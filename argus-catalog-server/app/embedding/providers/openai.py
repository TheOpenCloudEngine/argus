"""OpenAI API embedding provider.

Supports OpenAI's embedding API and compatible endpoints (Azure OpenAI, etc.).
Requires an API key. Default model: text-embedding-3-small (1536 dimensions).
"""

import logging

import httpx

from app.embedding.base import EmbeddingProvider

logger = logging.getLogger(__name__)

# Known model dimensions
_DIM_MAP = {
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
}


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """OpenAI API based embedding provider."""

    def __init__(
        self,
        api_key: str,
        model_id: str = "text-embedding-3-small",
        base_url: str = "https://api.openai.com/v1",
    ):
        self._api_key = api_key
        self._model_id = model_id
        self._base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(timeout=30.0)
        self._dim = _DIM_MAP.get(model_id, 1536)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed texts via OpenAI API. Handles batching internally."""
        resp = await self._client.post(
            f"{self._base_url}/embeddings",
            headers={"Authorization": f"Bearer {self._api_key}"},
            json={"input": texts, "model": self._model_id},
        )
        resp.raise_for_status()
        data = resp.json()["data"]
        # Sort by index to maintain order
        return [item["embedding"] for item in sorted(data, key=lambda x: x["index"])]

    def dimension(self) -> int:
        return self._dim

    def model_name(self) -> str:
        return self._model_id

    def provider_name(self) -> str:
        return "openai"

    async def close(self) -> None:
        await self._client.aclose()
        logger.info("OpenAI embedding provider closed")
