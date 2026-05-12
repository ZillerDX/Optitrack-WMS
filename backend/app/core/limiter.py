"""
Shared slowapi rate limiter.

Importing `limiter` from this module gives both `main.py` (registration)
and route modules (decorators) access to the same Limiter instance.

Notes:
- `get_remote_address` reads the client IP from the request scope.
- Behind a reverse proxy (Nginx/Cloudflare/ALB), configure the proxy to set
  `X-Forwarded-For` / `X-Real-IP` and use a custom key_func that trusts those
  headers. Do NOT trust client-supplied headers without a known proxy in front.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Single, app-wide limiter instance.
limiter = Limiter(key_func=get_remote_address)
