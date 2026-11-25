"""Small dependency-free rate limiter for authentication endpoints.

A single-process in-memory limiter is enough for the controlled demo. A hosted
multi-instance deployment should also enable the platform's edge rate limiting.
"""

from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from fastapi import HTTPException, Request

from app.config import settings

_buckets: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_lock = Lock()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


def enforce_auth_rate_limit(request: Request) -> None:
    """Reject excessive auth attempts in production; no-op in local development."""
    if not settings.is_production:
        return

    limit = max(1, settings.auth_rate_limit_per_minute)
    key = (_client_ip(request), request.url.path)
    now = monotonic()
    with _lock:
        bucket = _buckets[key]
        while bucket and now - bucket[0] > 60:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(status_code=429, detail="Too many attempts. Wait a minute and try again.")
        bucket.append(now)
