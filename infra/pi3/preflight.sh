#!/usr/bin/env bash
# Read-only readiness checks for the Raspberry Pi 3 VUXO deployment.
# Usage (on the Pi): sudo bash infra/pi3/preflight.sh
set -uo pipefail
runner_user="${VUXO_RUNNER_USER:-vuxorunner}"
runner_service="${VUXO_RUNNER_SERVICE:-actions.runner.KeyserDSoze-Vuxo.vuxo.service}"
failed=0
warned=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; failed=$((failed + 1)); }
warn() { printf 'WARN  %s\n' "$*"; warned=$((warned + 1)); }

echo "VUXO Pi 3: read-only preflight checks"
echo "No containers, files, or secrets are changed."
echo
if [[ "$(uname -m)" == "aarch64" ]]; then
  pass "64-bit ARM host detected"
else
  fail "Expected ARM64/aarch64; found $(uname -m)"
fi
if [[ "$EUID" -eq 0 ]]; then
  pass "Administrator access available for host checks"
else
  pass "Unprivileged mode; Docker is checked with the current runner user"
fi
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  pass "Docker daemon is accessible"
else
  fail "Docker daemon is not accessible"
fi
if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  pass "Docker Compose v2 is installed"
else
  fail "Docker Compose v2 is not available"
fi
if id "$runner_user" >/dev/null 2>&1; then
  pass "Runner user $runner_user exists"
  if id -nG "$runner_user" | tr ' ' '\n' | grep -qx docker; then
    pass "Runner user is in the docker group"
  else
    fail "Runner user has no Docker group membership"
  fi
  if [[ "$EUID" -eq 0 ]] && command -v runuser >/dev/null; then
    if runuser -u "$runner_user" -- docker info >/dev/null 2>&1; then
      pass "Runner user can access Docker"
    else
      fail "Runner user cannot access Docker; check group membership and restart its service"
    fi
  fi
else
  fail "Runner user $runner_user does not exist"
fi
if command -v systemctl >/dev/null; then
  if systemctl is-enabled --quiet "$runner_service" 2>/dev/null; then
    pass "Runner starts automatically"
  else
    fail "Runner systemd service is not enabled: $runner_service"
  fi
  if systemctl is-active --quiet "$runner_service" 2>/dev/null; then
    pass "Runner systemd service is active"
  else
    fail "Runner systemd service is not active: $runner_service"
  fi
else
  fail "systemctl is not installed"
fi
if command -v vcgencmd >/dev/null; then
  power_status="$(vcgencmd get_throttled 2>/dev/null || true)"
  if [[ "$power_status" =~ ^throttled=0x([0-9A-Fa-f]+)$ ]]; then
    power_flags=$((16#${BASH_REMATCH[1]}))
    if (( (power_flags & 1) != 0 )); then
      fail "Power supply undervoltage is active: $power_status"
    elif (( (power_flags & 0x10000) != 0 )); then
      warn "Undervoltage occurred since boot: $power_status. Check power before release."
    else
      pass "No power undervoltage flag: $power_status"
    fi
    if (( (power_flags & 0x4) != 0 || (power_flags & 0x40000) != 0 )); then
      warn "CPU throttling detected: $power_status"
    fi
  else
    warn "Cannot interpret vcgencmd output: $power_status"
  fi
else
  warn "vcgencmd is not installed; power stability not tested"
fi
if command -v free >/dev/null; then
  free -h | head -n 2
fi
if command -v df >/dev/null; then
  echo "Disk space at /:"
  df -h / | tail -n 1
fi
if command -v curl >/dev/null; then
  if curl --fail --silent --show-error --max-time 12 --output /dev/null https://github.com/ 2>/dev/null; then
    pass "HTTPS connection to GitHub works"
  else
    fail "Cannot reach https://github.com/ via HTTPS"
  fi
  ghcr_code="$(curl --silent --output /dev/null --max-time 12 --write-out '%{http_code}' https://ghcr.io/v2/ 2>/dev/null || true)"
  if [[ "$ghcr_code" == "200" || "$ghcr_code" == "401" ]]; then
    pass "GHCR responds over HTTPS (authentication is expected)"
  else
    fail "GHCR not reachable over HTTPS (HTTP $ghcr_code)"
  fi
else
  fail "curl is not installed"
fi
echo
echo "Preflight summary: $failed failed, $warned warnings."
echo "Manual checks: runner label vuxo-pi3; GitHub production variables/secrets;"
echo "Cloudflare Add route; image ARM64 manifests; backups; actual API, login and reboot."
if (( failed > 0 )); then exit 1; fi
if (( warned > 0 )); then exit 2; fi
exit 0
