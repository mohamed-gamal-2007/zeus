# ─────────────────────────────────────────────────────────────────────────────
#  ZEUS — Multi-stage Dockerfile
#  Stage 1 : Build React/Vite frontend  (node:20-alpine)
#  Stage 2 : Run FastAPI backend        (python:3.11-slim)
#            serves both /api/* and the built frontend on port 8000
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Frontend Build ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# Install dependencies (layer-cached when package files don't change)
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline

# Copy source and build
COPY . .
RUN npm run build
# → output: /build/dist/


# ── Stage 2: Backend Runtime ──────────────────────────────────────────────────
FROM python:3.11-slim AS backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/home/zeus/.local/bin:${PATH}"

# System deps required by psycopg2-binary and health-check curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Working directory inside the container = /app/server
# (matches the way uvicorn is called: python -m uvicorn app.main:app)
WORKDIR /app/server

# Install Python packages
COPY server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy FastAPI application
COPY server/ ./

# Copy the compiled frontend into the location FastAPI expects: /app/dist
# (main.py resolves: os.path.join(__file__, "../../dist") → /app/dist)
COPY --from=frontend-builder /build/dist/ /app/dist/

# Run the application without root.  The entrypoint adjusts ownership only on
# the named uploads volume at startup, then drops privileges before Uvicorn.
RUN groupadd --gid 10001 zeus \
    && useradd --uid 10001 --gid zeus --create-home --shell /usr/sbin/nologin zeus \
    && mkdir -p /app/uploads \
    && chown -R zeus:zeus /app/server /app/dist /app/uploads

COPY scripts/docker-entrypoint.sh /usr/local/bin/zeus-entrypoint
RUN chmod 755 /usr/local/bin/zeus-entrypoint

# Expose API / frontend port
EXPOSE 8000

# Health check (waits up to 20 s for startup)
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/zeus-entrypoint"]

# Start uvicorn
CMD ["python", "-m", "uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
