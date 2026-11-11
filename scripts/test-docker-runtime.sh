#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }
docker compose version >/dev/null

generate_test_secret() {
  printf 'vuxo-ci-%s-%s-%s-%s-%s-%s' "$RANDOM" "$RANDOM" "$RANDOM" "$RANDOM" "$RANDOM" "$RANDOM"
}

export VUXO_API_IMAGE="${VUXO_API_IMAGE:-vuxo-api:runtime-ci}"
export VUXO_API_PORT="${VUXO_API_PORT:-18080}"
export VUXO_POSTGRES_DB="${VUXO_POSTGRES_DB:-vuxo_runtime_ci}"
export VUXO_POSTGRES_USER="${VUXO_POSTGRES_USER:-vuxo}"
export VUXO_POSTGRES_PASSWORD="${VUXO_POSTGRES_PASSWORD:-$(generate_test_secret)}"
export VUXO_JWT_SIGNING_KEY="${VUXO_JWT_SIGNING_KEY:-$(generate_test_secret)}"
export VUXO_ALLOWED_ORIGIN="${VUXO_ALLOWED_ORIGIN:-http://localhost}"
export VUXO_CLOUDFLARE_TUNNEL_TOKEN="${VUXO_CLOUDFLARE_TUNNEL_TOKEN:-$(generate_test_secret)}"
export VUXO_LLM_ENABLED="false"
export VUXO_LLM_MODEL="${VUXO_LLM_MODEL:-qwen3:ci-contract}"
export VUXO_POSTGRES_DEV_PORT="${VUXO_POSTGRES_DEV_PORT:-15432}"
export VUXO_REDIS_DEV_PORT="${VUXO_REDIS_DEV_PORT:-16379}"

DEV_PROJECT="vuxodevci"
PROD_PROJECT="vuxoruntimeci"
DEV=(docker compose -p "$DEV_PROJECT" -f docker/compose.dev.yml)
PROD=(docker compose -p "$PROD_PROJECT" -f docker/compose.prod.yml)
EDGE=(docker compose -p "$PROD_PROJECT" -f docker/compose.prod.yml --profile edge)

cleanup() {
  "${DEV[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  "${PROD[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for_api() {
  local attempts=0
  until curl --fail --silent "http://127.0.0.1:${VUXO_API_PORT}/health" >/dev/null; do
    attempts=$((attempts + 1))
    if (( attempts >= 30 )); then
      "${PROD[@]}" logs api --tail 200 || true
      echo "API did not become healthy" >&2
      return 1
    fi
    sleep 2
  done
}

echo "==> Validating Compose models"
"${DEV[@]}" config >/dev/null
"${PROD[@]}" config >/dev/null
"${EDGE[@]}" config >/dev/null

echo "==> Verifying Ollama stays backend-only in production"
prod_json="$("${PROD[@]}" config --format json)"
PROD_JSON="$prod_json" python3 - <<'PY'
import json
import os
config = json.loads(os.environ["PROD_JSON"])
ollama = config["services"]["ollama"]
ports = ollama.get("ports") or []
if ports:
    raise SystemExit(f"Ollama unexpectedly exposes production ports: {ports}")
networks = ollama.get("networks") or {}
if "vuxo" not in networks:
    raise SystemExit("Ollama must stay on the private vuxo Docker network")

volume_targets = {
    mount.get("target")
    for mount in (ollama.get("volumes") or [])
    if isinstance(mount, dict)
}
if "/root/.ollama" not in volume_targets:
    raise SystemExit("Ollama model storage must use a persistent /root/.ollama volume")

expected_model = os.environ["VUXO_LLM_MODEL"]
api_environment = config["services"]["api"].get("environment") or {}
if api_environment.get("Llm__Model") != expected_model:
    raise SystemExit("Configured LLM model is not propagated to the API")

model_init = config["services"]["ollama-model-init"]
command = " ".join(model_init.get("command") or [])
if expected_model not in command:
    raise SystemExit("Configured LLM model is not propagated to ollama-model-init")
PY

if grep -R -n -E 'ollama:11434|localhost:11434|127\.0\.0\.1:11434' src/frontend --exclude-dir=node_modules --exclude-dir=dist; then
  echo "Frontend must not reference Ollama directly" >&2
  exit 1
fi

echo "==> Building production API image"
docker build --pull --file docker/Dockerfile.api --tag "$VUXO_API_IMAGE" .

echo "==> Verifying final image contains runtime only"
docker run --rm --entrypoint sh "$VUXO_API_IMAGE" -c '
  test ! -d /usr/share/dotnet/sdk
  test -z "$(dotnet --list-sdks)"
  test -r /app/health/Vuxo.HealthProbe.dll
  dotnet --list-runtimes | grep -q "Microsoft.AspNetCore.App 10\."
'

echo "==> Starting local development database/cache"
"${DEV[@]}" up -d --wait --wait-timeout 120 postgres redis
"${DEV[@]}" exec -T postgres pg_isready -U "$VUXO_POSTGRES_USER" -d "$VUXO_POSTGRES_DB" >/dev/null
test "$("${DEV[@]}" exec -T redis redis-cli ping | tr -d '\r')" = "PONG"
"${DEV[@]}" down -v --remove-orphans >/dev/null

echo "==> Starting production-like API/database/cache"
"${PROD[@]}" up -d --wait --wait-timeout 180 postgres redis api
wait_for_api

postgres_id="$("${PROD[@]}" ps -q postgres)"
redis_id="$("${PROD[@]}" ps -q redis)"
api_id="$("${PROD[@]}" ps -q api)"
api_health="$(docker inspect "$api_id" --format '{{.State.Health.Status}}')"
if [[ "$api_health" != "healthy" ]]; then
  echo "API native .NET HTTP healthcheck did not pass: $api_health" >&2
  exit 1
fi

if [[ -n "$(docker port "$postgres_id" 2>/dev/null || true)" ]]; then
  echo "PostgreSQL unexpectedly exposes a host port" >&2
  exit 1
fi
if [[ -n "$(docker port "$redis_id" 2>/dev/null || true)" ]]; then
  echo "Redis unexpectedly exposes a host port" >&2
  exit 1
fi

api_binding="$(docker port "$api_id" 8080/tcp)"
if [[ "$api_binding" != "127.0.0.1:${VUXO_API_PORT}" ]]; then
  echo "API must bind only to loopback; got: $api_binding" >&2
  exit 1
fi

echo "==> Verifying sibling-container reachability of api:8080"
network_name="$(docker inspect "$api_id" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' | head -n 1)"
test -n "$network_name"
docker run --rm --network "$network_name" busybox:1.37 \
  wget -qO- http://api:8080/health >/dev/null

echo "==> Writing persistence markers"
"${PROD[@]}" exec -T postgres psql \
  -U "$VUXO_POSTGRES_USER" \
  -d "$VUXO_POSTGRES_DB" \
  -v ON_ERROR_STOP=1 \
  -c "CREATE TABLE IF NOT EXISTS runtime_smoke (name text PRIMARY KEY, value text NOT NULL);" \
  -c "INSERT INTO runtime_smoke(name, value) VALUES ('container-recreate', 'persisted') ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value;" \
  >/dev/null
"${PROD[@]}" exec -T redis redis-cli SET vuxo:runtime-smoke persisted >/dev/null

old_postgres_id="$postgres_id"
old_redis_id="$redis_id"

echo "==> Recreating stateful containers without deleting named volumes"
"${PROD[@]}" up -d --force-recreate --wait --wait-timeout 180 postgres redis

new_postgres_id="$("${PROD[@]}" ps -q postgres)"
new_redis_id="$("${PROD[@]}" ps -q redis)"
if [[ "$new_postgres_id" == "$old_postgres_id" || "$new_redis_id" == "$old_redis_id" ]]; then
  echo "Expected PostgreSQL and Redis containers to be recreated" >&2
  exit 1
fi

postgres_marker="$("${PROD[@]}" exec -T postgres psql -U "$VUXO_POSTGRES_USER" -d "$VUXO_POSTGRES_DB" -Atc "SELECT value FROM runtime_smoke WHERE name = 'container-recreate';" | tr -d '\r')"
redis_marker="$("${PROD[@]}" exec -T redis redis-cli GET vuxo:runtime-smoke | tr -d '\r')"
test "$postgres_marker" = "persisted"
test "$redis_marker" = "persisted"

wait_for_api

echo "Docker runtime smoke passed: dev services, runtime-only API image, private DB/cache, api:8080 network reachability, and volume persistence are verified."
