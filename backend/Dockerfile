# syntax=docker/dockerfile:1.6
# OptiTrack WMS — Production image
#
# Runs FastAPI under Gunicorn with UvicornWorker.
# DB schema bootstrap is NOT performed here; run `python -m scripts.init_db`
# as a separate one-shot job before rolling out new replicas.

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps for asyncpg / bcrypt / Pillow-style image handling.
# `--no-install-recommends` keeps the image small.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run as non-root for defense in depth.
RUN useradd --system --create-home --uid 1001 optitrack \
 && mkdir -p /app/uploads/profiles \
 && chmod +x /app/docker-entrypoint.sh \
 && chown -R optitrack:optitrack /app
USER optitrack

EXPOSE 8000

# Built-in container healthcheck. /livez does not touch external deps,
# so it's safe to call from the engine. Use /readyz at the LB layer.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/livez || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]

# Worker count rationale (2-core VPS, async FastAPI workload):
# - Each UvicornWorker runs its own asyncio event loop, so a single worker
#   already handles thousands of concurrent connections.
# - Extra workers exist primarily to absorb CPU-bound spikes (bcrypt hashing,
#   JSON serialization, Pydantic validation) and to survive a single worker
#   crash without dropping all in-flight traffic.
# - For 2 cores: 4 workers (2 * cores) is the sweet spot.
#   * Gunicorn's classic `(2 * cores) + 1 = 5` is tuned for SYNC workers
#     blocking on I/O. UvicornWorker is async, so 5 over-subscribes the CPU
#     and increases context-switch overhead under load.
#   * 2 workers (`cores`) is the safer minimum when memory is tight.
#   * 4 workers gives ~2x CPU headroom for password hashing without saturation.
# Tune via the WEB_CONCURRENCY env var if your hardware changes.
CMD ["gunicorn", "main:app", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "30", \
     "--graceful-timeout", "30", \
     "--keep-alive", "5", \
     "--max-requests", "1000", \
     "--max-requests-jitter", "100", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "--log-level", "info"]
