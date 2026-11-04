#!/usr/bin/env bash
# Static / Compose contract smoke. Requires Docker Compose plugin but no running containers.
set -Eeuo pipefail
cd "$(dirname "$0")/.."

bash -n infra/pi3/deploy.sh
bash -n infra/pi3/bootstrap.sh
bash -n infra/pi3/preflight.sh

export VUXO_API_IMAGE=ghcr.io/keyserdsoze/vuxo-api:pi3-0123456789abcdef0123456789abcdef01234567
export VUXO_POSTGRES_PASSWORD=ci-only-random-value
export VUXO_JWT_SIGNING_KEY=ci-only-0123456789abcdef0123456789abcdef
export VUXO_CLOUDFLARE_TUNNEL_TOKEN=ci-only-token
export VUXO_ALLOWED_ORIGIN=https://vuxo.app
export VUXO_BESZEL_KEY=ci-only-key
export VUXO_BESZEL_TOKEN=ci-only-token
export VUXO_DOZZLE_DATA_DIR=/tmp/vuxo-dozzle-ci
export VUXO_RABBITMQ_PASSWORD=ci-only-random-rabbitmq-password

base=(docker compose -p vuxo -f docker/compose.prod.yml -f docker/compose.pi3.yml)
"${base[@]}" config --quiet
services="$("${base[@]}" --profile edge config --services)"
if grep -qE '^(ollama|ollama-model-init)$' <<< "$services"; then
  echo "Ollama must be inactive on the Pi 3 by default." >&2
  exit 1
fi
for name in api postgres redis cloudflared; do
  if ! grep -qx "$name" <<< "$services"; then
    echo "Missing Pi 3 default runtime service: $name" >&2
    exit 1
  fi
done

# Compose renders every opt-in overlay without starting or exposing it.
"${base[@]}" -f docker/compose.pi3.monitor.yml config --quiet
"${base[@]}" -f docker/compose.pi3.logs.yml config --quiet
"${base[@]}" -f docker/compose.pi3.rabbitmq.yml config --quiet
"${base[@]}" -f docker/compose.pi3.azurite.yml config --quiet

# Fail the contract if the resource-limit / storage declarations disappear.
python3 - <<'PY'
from pathlib import Path
text = Path("docker/compose.pi3.yml").read_text()
required = [
    "mem_limit: 320m",
    "mem_limit: 192m",
    "mem_limit: 80m",
    "mem_limit: 64m",
    "profiles: [local-ai]",
    "Llm__Enabled:",
]
for value in required:
    assert value in text, f"Missing resource or optional-AI contract: {value}"
for path in ["docker/compose.pi3.monitor.yml", "docker/compose.pi3.rabbitmq.yml", "docker/compose.pi3.azurite.yml", "docker/compose.pi3.logs.yml"]:
    body = Path(path).read_text()
    assert "127.0.0.1:" in body, f"Admin ports must bind loopback: {path}"
assert "down -v" not in Path("infra/pi3/deploy.sh").read_text().replace("Never run down -v", "")
PY
echo "Pi 3 Compose and deploy contract passed."
