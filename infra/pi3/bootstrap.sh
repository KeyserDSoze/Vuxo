#!/usr/bin/env bash
# One-time Raspberry Pi OS Lite / Debian ARM64 bootstrap.
# Run as root: sudo bash infra/pi3/bootstrap.sh <dedicated-runner-user>
set -Eeuo pipefail

if [[ $EUID -ne 0 || $# -ne 1 ]]; then
  echo "Usage: sudo bash $0 <existing-non-root-runner-user>" >&2
  exit 2
fi
runner_user="$1"
if [[ "$(uname -m)" != "aarch64" ]]; then
  echo "A 64-bit ARM OS is required (aarch64); use Raspberry Pi OS Lite 64-bit." >&2
  exit 2
fi
id "$runner_user" >/dev/null || { echo "Runner user does not exist." >&2; exit 2; }
if [[ "$(id -u "$runner_user")" == "0" ]]; then
  echo "Runner must not be root." >&2
  exit 2
fi
source /etc/os-release
if [[ "$ID" != "debian" && "${ID_LIKE:-}" != *debian* ]]; then
  echo "Only Debian-compatible systems are supported by this bootstrap." >&2
  exit 2
fi
if [[ ! "$VERSION_CODENAME" =~ ^(bookworm|trixie)$ ]]; then
  echo "Please review the Docker apt repository for this Debian release first." >&2
  exit 2
fi

apt-get update
apt-get install -y --no-install-recommends ca-certificates curl git python3 jq
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl --fail --silent --show-error --location https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $VERSION_CODENAME
Components: stable
Architectures: arm64
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version >/dev/null || { echo "Install Docker Compose v2 plugin." >&2; exit 2; }
systemctl enable --now docker

# Membership grants root-equivalent Docker daemon access. Use a dedicated,
# trusted account with no untrusted workflow jobs, not an Internet-facing user.
usermod -aG docker "$runner_user"
install -d -o "$runner_user" -g "$runner_user" -m 0700 "/home/$runner_user/vuxo-backups"
echo "Host ready. Re-login as $runner_user to refresh docker-group membership."
echo "Next: register the repository-level GitHub ARM64 runner and install it with svc.sh."
echo "No application containers or live data were modified."
