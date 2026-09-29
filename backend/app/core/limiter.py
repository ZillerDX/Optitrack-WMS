"""
Shared slowapi rate limiter.

Importing `limiter` from this module gives both `main.py` (registration)
and route modules (decorators) access to the same Limiter instance.

Notes:
- Counters live in `settings.RATE_LIMIT_STORAGE_URI`. The default `memory://`
  is per process, so use a shared store (Redis) with more than one worker.
  If the shared store is unreachable, slowapi falls back to in-memory
  counters instead of failing requests.
- Client identity: behind a reverse proxy every request appears to come from the
  proxy's IP, which would put all users in one bucket. Set `TRUSTED_PROXY_COUNT`
  to the number of proxies you control and the client IP is taken from
  `X-Forwarded-For` (the entry appended by the nearest trusted proxy). It is
  never read when the count is 0, because clients can send that header freely.
"""

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings


def client_ip(request: Request) -> str:
    """Return the rate-limit key (client IP), honouring only trusted proxies."""
    proxies = settings.TRUSTED_PROXY_COUNT
    if proxies > 0:
        forwarded = request.headers.get("x-forwarded-for", "")
        hops = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
        # The last `proxies` entries were appended by our own proxies; the entry
        # just before them is the client. Anything to its left is client-supplied.
        if len(hops) >= proxies:
            return hops[-proxies]
    return get_remote_address(request)


# Single, app-wide limiter instance.
limiter = Limiter(
    key_func=client_ip,
    storage_uri=settings.RATE_LIMIT_STORAGE_URI,
    in_memory_fallback_enabled=True,
)
