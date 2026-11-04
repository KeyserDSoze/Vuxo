#!/usr/bin/env bash
# Deploy a prebuilt ARM64 API image. CI builds; the Pi never compiles code.
set -Eeuo pipefail
if [[ $# -ne 1 || ! -r "$1" ]]; then
  echo "Usage: $0 /path/to/private-runtime.env" >&2
  exit 2
fi
if [[ "$(uname -m)" != "aarch64" ]]; then
  echo "Only Linux ARM64 (aarch64) is supported." >&2
  exit 2
fi
for exe in docker curl date mktemp realpath; do
  command -v "$exe" >/dev/null || { echo "Missing: $exe" >&2; exit 2; }
done
docker compose version >/dev/null
docker info >/dev/null

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$(realpath "$1")"
COMPOSE=(docker compose -p vuxo --env-file "$ENV_FILE" -f "$ROOT/docker/compose.prod.yml" -f "$ROOT/docker/compose.pi3.yml" --profile edge)
API_IMAGE="$(sed -n 's/^VUXO_API_IMAGE=//p' "$ENV_FILE" | tail -1)"
if [[ ! "$API_IMAGE" =~ ^ghcr\.io/keyserdsoze/vuxo-api:pi3-[a-f0-9]{40}$ ]]; then
  echo "VUXO_API_IMAGE must be ghcr.io/keyserdsoze/vuxo-api:pi3-<40-char-commit-sha>." >&2
  exit 2
fi
for required in VUXO_POSTGRES_PASSWORD VUXO_JWT_SIGNING_KEY VUXO_CLOUDFLARE_TUNNEL_TOKEN; do
  if ! grep -q "^$required=." "$ENV_FILE"; then
    echo "Missing required environment key: $required" >&2
    exit 2
  fi
done
"${COMPOSE[@]}" config --quiet

old_container="$("${COMPOSE[@]}" ps -q api 2>/dev/null || true)"
previous_image=""
if [[ -n "$old_container" ]]; then
  previous_image="$(docker inspect --format '{{.Config.Image}}' "$old_container")"
fi

# Do not change volume namespace, remove volumes, or restart the Docker daemon.
"${COMPOSE[@]}" up -d --wait --wait-timeout 120 postgres redis

# PostgreSQL is backed up before EF migrations can run in the new API.
# Transfer backups to external storage; microSD-only copies are not disaster recovery.
BACKUP_DIR="${VUXO_BACKUP_DIR:-$HOME/vuxo-backups}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
backup="$(mktemp "$BACKUP_DIR/vuxo-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX.dump")"
chmod 600 "$backup"
if ! "${COMPOSE[@]}" exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$backup"; then
  rm -f "$backup"
  echo "Database backup failed; refusing deployment." >&2
  exit 1
fi
if [[ ! -s "$backup" ]]; then
  rm -f "$backup"
  echo "Database backup empty; refusing deployment." >&2
  exit 1
fi

"${COMPOSE[@]}" pull api
"${COMPOSE[@]}" up -d --no-deps api

health_check() {
  local attempt
  for ((attempt=0; attempt<45; attempt++)); do
    if curl --fail --silent --max-time 3 http://127.0.0.1:8080/health >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

if ! health_check; then
  echo "New API unhealthy; attempting image-only rollback." >&2
  "${COMPOSE[@]}" logs --tail=80 api >&2 || true
  if [[ -n "$previous_image" ]]; then
    export VUXO_API_IMAGE="$previous_image"
    "${COMPOSE[@]}" up -d --no-deps api
    if ! health_check; then
      echo "Previous image unhealthy too. Restore database manually if needed." >&2
    fi
  else
    echo "No previous API image available on first deploy." >&2
  fi
  echo "EF migrations are NOT automatically rolled back; see restore runbook." >&2
  exit 1
fi

"${COMPOSE[@]}" up -d cloudflared
"${COMPOSE[@]}" ps
echo "Deploy healthy. Pre-deploy backup: $backup"
