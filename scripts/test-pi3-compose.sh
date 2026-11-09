#!/usr/bin/env bash
# Static / Compose contract smoke. Requires Docker Compose plugin but no running containers.
set -Eeuo pipefail
cd "$(dirname "$0")/.."

bash -n infra/pi3/deploy.sh
bash -n infra/pi3/bootstrap.sh
bash -n infra/pi3/preflight.sh
python3 -m unittest discover -s scripts -p 'test_pi3_auth_verification.py' -v
python3 -m unittest discover -s scripts -p 'test_pi3_origin_diagnostics.py' -v
python3 -m unittest discover -s scripts -p 'test_pi3_cloudflare_failure.py' -v

# Build the ARM64 image on trusted green main CI without triggering the Pi.
# Production deployment still requires a separate explicit repository flag.
python3 - <<'PY'
from pathlib import Path
workflow = Path('.github/workflows/deploy-pi3.yml').read_text()
assert "  build-arm64:" in workflow and "  deploy-pi3:" in workflow
build = workflow.split('  build-arm64:', 1)[1].split('  deploy-pi3:', 1)[0]
deploy = workflow.split('  deploy-pi3:', 1)[1]
assert "VUXO_PI3_DEPLOY_ENABLED" not in build, 'ARM64 build must not depend on hardware deploy flag'
assert "if: vars.VUXO_PI3_DEPLOY_ENABLED == 'true'" in deploy, 'Production deploy must be opt-in'
legacy = Path('.github/workflows/deploy-server.yml').read_text()
assert "if: vars.VUXO_X64_DEPLOY_ENABLED == 'true'" in legacy, 'Old x64 deploy must be opt-in'
PY

export VUXO_API_IMAGE=ghcr.io/keyserdsoze/vuxo-api:pi3-0123456789abcdef0123456789abcdef01234567
export VUXO_POSTGRES_PASSWORD=ci-only-random-value
export VUXO_JWT_SIGNING_KEY=ci-only-0123456789abcdef0123456789abcdef
export VUXO_CLOUDFLARE_TUNNEL_TOKEN=ci-only-token
export VUXO_ALLOWED_ORIGIN=https://vuxo.quest
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
# Reconnect the Cloudflare origin only after the replacement API passes local
# health. A long-running unchanged connector can retain stale upstream routes.
deploy_script = Path("infra/pi3/deploy.sh").read_text()
# A non-empty pg_dump does not prove an archive is parseable. Both the read-only
# TOC verification and protected checksum must finish before API replacement.
dump = "if ! \"${COMPOSE[@]}\" exec -T postgres sh -c 'exec pg_dump"
toc = '"${COMPOSE[@]}" exec -T postgres pg_restore --list < "$backup" >/dev/null 2>&1'
checksum = 'sha256sum --check --status "$checksum_tmp"'
pull_api = '"${COMPOSE[@]}" pull api'
assert deploy_script.index(dump) < deploy_script.index(toc) < deploy_script.index(checksum) < deploy_script.index(pull_api), "Validate archive/checksum before replacing API"
assert 'rm -f "$backup"' in deploy_script and 'rm -f "$checksum_tmp"' in deploy_script, "Failed backup/checksum must be rejected"
assert 'chmod 600 "$checksum_tmp"' in deploy_script, "Checksum needs private permissions"
assert 'BACKUP_DIR="$(realpath "$BACKUP_DIR")"' in deploy_script, "Checksum must be location-independent"
assert 'for exe in docker curl date mktemp realpath python3 sha256sum' in deploy_script

up = '"${COMPOSE[@]}" up -d cloudflared'
restart = '"${COMPOSE[@]}" restart cloudflared'
assert deploy_script.count(restart) == 1, "Cloudflare connector must restart once per deploy"
assert deploy_script.index("if ! health_check; then") < deploy_script.index(up) < deploy_script.index(restart), "Connector restart must follow a healthy API"
assert deploy_script.index(restart) < deploy_script.rindex('python3 "$ROOT/infra/pi3/verify-auth.py" "$ENV_FILE"'), "Refresh connector before final local/provider checks"
assert deploy_script.index(restart) < deploy_script.index('python3 "$ROOT/infra/pi3/diagnose_origin.py"'), "Origin probe requires restarted connector"
assert deploy_script.index('python3 "$ROOT/infra/pi3/verify-auth.py" "$ENV_FILE"') < deploy_script.index('python3 "$ROOT/infra/pi3/diagnose_origin.py"'), "Probe follows local provider verification"
manual = Path(".github/workflows/diagnose-pi3-origin.yml").read_text()
for clause in ["workflow_dispatch:", "github.ref == 'refs/heads/main'", "github.repository == 'KeyserDSoze/Vuxo'",
               "vars.VUXO_PI3_DEPLOY_ENABLED == 'true'", "runs-on: [self-hosted, linux, ARM64, vuxo-pi3]",
               "group: vuxo-pi3-production", "persist-credentials: false"]:
    assert clause in manual, f"Missing main-only manual workflow safeguard: {clause}"
assert "${{ secrets." not in manual, "Manual probe cannot use GitHub secrets"
assert "python3 infra/pi3/diagnose_origin.py" in manual
assert "verify-public-auth:" in Path(".github/workflows/deploy-pi3.yml").read_text(), "Do not weaken the strict public smoke"
# On a red public gate, both GitHub-hosted and Pi vantage points must collect
# only safe read-only evidence; never turn the public gate green.
release = Path(".github/workflows/deploy-pi3.yml").read_text()
assert "if: ${{ failure() }}" in release, "Public failure must trigger diagnostics"
assert "VUXO_PUBLIC_AUTH_DIAGNOSTICS: 'true'" in release, "Independent public status probe required"
assert "triage-pi3-after-public-failure:" in release, "Missing Pi-side failure triage"
tail = release.split("  triage-pi3-after-public-failure:", 1)[1]
for required in ["always() &&", "needs.deploy-pi3.result == 'success'",
                 "needs.verify-public-auth.result == 'failure'", "vars.VUXO_PI3_DEPLOY_ENABLED == 'true'",
                 "github.event.workflow_run.head_branch == 'main'",
                 "runs-on: [self-hosted, linux, ARM64, vuxo-pi3]",
                 "persist-credentials: false", "python3 infra/pi3/diagnose_cloudflare_failure.py"]:
    assert required in tail, f"Missing safe Pi triage guard: {required}"
assert "${{ secrets." not in tail, "Diagnostic must not load production secrets"
strict = release.split("  verify-public-auth:", 1)[1].split("  triage-pi3-after-public-failure:", 1)[0]
assert strict.index("run: node scripts/verify-public-auth.mjs") < strict.index("if: ${{ failure() }}"), "Strict gate must run before diagnostics"
assert "continue-on-error: true" in strict, "Diagnostic itself must be informational"

PY
echo "Pi 3 Compose and deploy contract passed."
