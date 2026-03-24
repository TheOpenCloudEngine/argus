"""Thread-safe LRU cache with TTL expiration for external metadata API.

Features:
- Configurable max size (LRU eviction when full)
- Per-entry TTL expiration (monotonic clock)
- Async-safe via asyncio.Lock
- Hit/miss statistics for monitoring
"""

import asyncio
import logging
import time
from collections import OrderedDict
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    """A single cached item with creation timestamp and hit counter."""

    data: dict
    created_at: float  # time.monotonic()
    hit_count: int = 0


class MetadataCache:
    """Async-safe LRU cache with TTL for dataset metadata.

    Thread safety is provided by asyncio.Lock which serializes
    concurrent access within the async event loop.
    """

    def __init__(self, max_size: int = 1000, ttl_seconds: int = 300) -> None:
        self._max_size = max_size
        self._ttl_seconds = ttl_seconds
        self._cache: OrderedDict[int, CacheEntry] = OrderedDict()
        self._lock = asyncio.Lock()
        self._hits = 0
        self._misses = 0

    @property
    def max_size(self) -> int:
        return self._max_size

    @property
    def ttl_seconds(self) -> int:
        return self._ttl_seconds

    async def get(self, dataset_id: int) -> dict | None:
        """Get cached metadata. Returns None on miss or expiration."""
        async with self._lock:
            entry = self._cache.get(dataset_id)
            if entry is None:
                self._misses += 1
                return None

            # Check TTL
            elapsed = time.monotonic() - entry.created_at
            if elapsed > self._ttl_seconds:
                del self._cache[dataset_id]
                self._misses += 1
                logger.debug("Cache expired: dataset_id=%d (%.1fs)", dataset_id, elapsed)
                return None

            # LRU: move to end (most recently used)
            self._cache.move_to_end(dataset_id)
            entry.hit_count += 1
            self._hits += 1
            return entry.data

    async def put(self, dataset_id: int, data: dict) -> None:
        """Store metadata in cache. Evicts LRU entry if at capacity."""
        async with self._lock:
            # Update existing
            if dataset_id in self._cache:
                self._cache[dataset_id] = CacheEntry(data=data, created_at=time.monotonic())
                self._cache.move_to_end(dataset_id)
                return

            # Evict LRU if full
            while len(self._cache) >= self._max_size:
                evicted_key, _ = self._cache.popitem(last=False)
                logger.debug("Cache LRU eviction: dataset_id=%d", evicted_key)

            self._cache[dataset_id] = CacheEntry(data=data, created_at=time.monotonic())

    async def invalidate(self, dataset_id: int) -> bool:
        """Remove a specific entry. Returns True if found and removed."""
        async with self._lock:
            if dataset_id in self._cache:
                del self._cache[dataset_id]
                logger.debug("Cache invalidated: dataset_id=%d", dataset_id)
                return True
            return False

    async def clear(self) -> int:
        """Clear all entries. Returns count of removed entries."""
        async with self._lock:
            count = len(self._cache)
            self._cache.clear()
            self._hits = 0
            self._misses = 0
            logger.info("Cache cleared: %d entries removed", count)
            return count

    async def stats(self) -> dict:
        """Return cache statistics."""
        async with self._lock:
            total = self._hits + self._misses
            return {
                "size": len(self._cache),
                "max_size": self._max_size,
                "ttl_seconds": self._ttl_seconds,
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": round(self._hits / total * 100, 1) if total > 0 else 0,
                "total_requests": total,
            }

    async def reconfigure(
        self,
        max_size: int | None = None,
        ttl_seconds: int | None = None,
    ) -> dict:
        """Update cache configuration. Evicts entries if new max_size is smaller."""
        async with self._lock:
            if max_size is not None:
                self._max_size = max_size
                # Evict excess entries
                while len(self._cache) > self._max_size:
                    self._cache.popitem(last=False)

            if ttl_seconds is not None:
                self._ttl_seconds = ttl_seconds

            return {
                "max_size": self._max_size,
                "ttl_seconds": self._ttl_seconds,
                "current_size": len(self._cache),
            }


# ---------------------------------------------------------------------------
# Singleton instance
# ---------------------------------------------------------------------------

_cache: MetadataCache | None = None


def get_cache() -> MetadataCache:
    """Return the global cache instance."""
    global _cache
    if _cache is None:
        from app.core.config import settings

        _cache = MetadataCache(
            max_size=settings.cache_max_size,
            ttl_seconds=settings.cache_ttl_seconds,
        )
        logger.info(
            "MetadataCache initialized: max_size=%d, ttl=%ds",
            settings.cache_max_size,
            settings.cache_ttl_seconds,
        )
    return _cache


def reset_cache() -> None:
    """Reset the singleton (for reconfiguration)."""
    global _cache
    _cache = None
