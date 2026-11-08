#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  ZEUS — safe application deploy for a Linux VPS
#
#  One command does all of it, and is safe to re-run:
#    bash scripts/deploy.sh
#
#  Steps:
#    1. Optionally fast-forward the checked-out Git worktree
#    2. Validate configuration without printing secrets
#    3. Build and update only the Compose services (never `down -v`)
#    4. Wait for the application health check and report status
#
# TLS/nginx provisioning is intentionally separate: `scripts/setup-tls.sh`.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_PORT="${APP_PORT:-8000}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${PROJECT_DIR}"

if [[ ! -f .env ]]; then
    echo "error: ${PROJECT_DIR}/.env is missing (copy .env.example and fill it in)" >&2
    exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    echo "error: Docker Engine and the Docker Compose plugin are required" >&2
    exit 1
fi

if [[ ! -r /var/run/docker.sock ]]; then
    echo "error: current user cannot access Docker; run with a Docker-enabled user or sudo" >&2
    exit 1
fi

required_vars=(POSTGRES_PASSWORD POSTGRES_APP_PASSWORD SECRET_KEY ADMIN_PASSWORD)
for name in "${required_vars[@]}"; do
    if ! grep -Eq "^${name}=.+" .env; then
        echo "error: ${name} must be set in .env" >&2
        exit 1
    fi
done

if [[ "$(stat -c '%a' .env 2>/dev/null || true)" != "600" ]]; then
    echo "warning: .env should be readable only by its owner (recommended: chmod 600 .env)" >&2
fi

if [[ "${ZEUS_SKIP_GIT_PULL:-0}" != "1" ]] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if [[ -n "$(git status --porcelain)" ]]; then
        echo "error: worktree has uncommitted changes; commit/stash them or set ZEUS_SKIP_GIT_PULL=1" >&2
        exit 1
    fi
    echo "==> Updating source with git pull --ff-only"
    git pull --ff-only
fi

echo "==> Validating Compose configuration"
docker compose config --quiet

# Never use `down`, `down -v`, `volume rm`, `system prune`, or `rm -v` here.
# `up -d --build --remove-orphans` recreates only changed containers while
# retaining named PostgreSQL and uploads volumes.
echo "==> Building and updating ZEUS (persistent volumes are retained)"
docker compose up -d --build --remove-orphans

echo "==> Waiting for the app to become healthy"
ready=""
for _ in $(seq 1 60); do
    if curl -fsS -m 3 "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
        ready="yes"
        break
    fi
    sleep 3
done
docker compose ps

if [[ -z "${ready}" ]]; then
    echo "error: the app never became healthy — last 60 log lines:" >&2
    docker compose logs --tail=60 zeus >&2 || true
    exit 1
fi

echo "==> Verification"
fail=0

check() { # label, expected-regex, actual
    if [[ "$3" =~ $2 ]]; then printf '    ok   %-42s %s\n' "$1" "$3"
    else printf '    FAIL %-42s %s (expected %s)\n' "$1" "$3" "$2"; fail=1; fi
}

check "app  http://127.0.0.1:${APP_PORT}/api/health" \
      '^200$' "$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/api/health" || echo ERR)"

# nginx's port-80 block answers 127.0.0.1 with the 301 -> https redirect.
check "Compose service zeus" '^running$' "$(docker compose ps --status running --services | grep -x zeus || true)"
check "Compose service postgres" '^running$' "$(docker compose ps --status running --services | grep -x postgres || true)"

echo
if [[ "${fail}" -ne 0 ]]; then
    echo "Some checks failed. Useful next commands:" >&2
    echo "  docker compose logs -f zeus" >&2
    exit 1
fi

echo "Deployment complete. Named volumes and .env were retained."
