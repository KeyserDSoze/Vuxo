#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_NAME="$(basename "$0")"

REPO_URL="${VUXO_REPO_URL:-https://github.com/KeyserDSoze/Vuxo}"
RUNNER_TOKEN="${VUXO_RUNNER_TOKEN:-}"
RUNNER_USER="${VUXO_RUNNER_USER:-vuxo-runner}"
RUNNER_NAME="${VUXO_RUNNER_NAME:-vuxo-prod-$(hostname -s 2>/dev/null || hostname)}"
RUNNER_LABELS="${VUXO_RUNNER_LABELS:-vuxo-prod}"
RUNNER_DIR="${VUXO_RUNNER_DIR:-/opt/actions-runner}"
DEPLOY_DIR="${VUXO_DEPLOY_DIR:-/opt/vuxo}"
NON_INTERACTIVE="${VUXO_NON_INTERACTIVE:-0}"

log()  { printf '\n\033[1;34m[VUXO]\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m[VUXO WARNING]\033[0m %s\n' "$*" >&2; }
die()  { printf '\n\033[1;31m[VUXO ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<USAGE
VUXO production host bootstrap

Usage:
  sudo bash ${SCRIPT_NAME} [options]

Options:
  --repo URL            GitHub repository URL (default: ${REPO_URL})
  --token TOKEN         Temporary GitHub Actions runner registration token
  --runner-name NAME    Runner name (default: ${RUNNER_NAME})
  --runner-user USER    Linux service user (default: ${RUNNER_USER})
  --labels LABELS       Custom runner labels (default: ${RUNNER_LABELS})
  --runner-dir PATH     Runner installation directory (default: ${RUNNER_DIR})
  --deploy-dir PATH     Persistent VUXO host directory (default: ${DEPLOY_DIR})
  --non-interactive     Never prompt; fail if required values are missing
  -h, --help            Show this help

The runner token is only required on first registration. It is not stored by this script.
You can also pass values using VUXO_RUNNER_TOKEN, VUXO_REPO_URL and related
VUXO_* environment variables.
USAGE
}

while (($#)); do
  case "$1" in
    --repo) REPO_URL="${2:?missing value for --repo}"; shift 2 ;;
    --token) RUNNER_TOKEN="${2:?missing value for --token}"; shift 2 ;;
    --runner-name) RUNNER_NAME="${2:?missing value for --runner-name}"; shift 2 ;;
    --runner-user) RUNNER_USER="${2:?missing value for --runner-user}"; shift 2 ;;
    --labels) RUNNER_LABELS="${2:?missing value for --labels}"; shift 2 ;;
    --runner-dir) RUNNER_DIR="${2:?missing value for --runner-dir}"; shift 2 ;;
    --deploy-dir) DEPLOY_DIR="${2:?missing value for --deploy-dir}"; shift 2 ;;
    --non-interactive) NON_INTERACTIVE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ ${EUID} -eq 0 ]] || die "Run this script as root (for example: sudo bash ${SCRIPT_NAME})."
command -v systemctl >/dev/null 2>&1 || die "systemd is required for an unattended production runner service."
[[ -d /run/systemd/system ]] || die "systemd is not running as the init system. This bootstrap intentionally requires a systemd-based Linux host."

if ldd --version 2>&1 | grep -qi musl; then
  die "This host uses musl libc. GitHub's standard self-hosted runner is designed for supported glibc Linux distributions. Use a glibc/systemd host for VUXO production."
fi

ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  x86_64|amd64)
    RUNNER_ARCH="x64"
    COMPOSE_ARCH="x86_64"
    ;;
  aarch64|arm64)
    die "This VUXO production workflow currently targets the x64 runner label and builds an amd64 API image. ARM64 host support requires a multi-arch image/workflow first."
    ;;
  *) die "Unsupported CPU architecture for this VUXO production workflow: ${ARCH_RAW}." ;;
esac

if command -v apt-get >/dev/null 2>&1; then
  PM="apt"
elif command -v dnf >/dev/null 2>&1; then
  PM="dnf"
elif command -v yum >/dev/null 2>&1; then
  PM="yum"
elif command -v zypper >/dev/null 2>&1; then
  PM="zypper"
else
  die "Unsupported Linux distribution/package manager. This bootstrap supports GitHub-runner-supported Debian/Ubuntu/Mint, RHEL/CentOS/Oracle/Fedora, and openSUSE/SLES families."
fi

install_base_packages() {
  log "Installing base packages with ${PM}"
  case "$PM" in
    apt)
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -y
      apt-get install -y ca-certificates curl git gzip tar sudo
      ;;
    dnf)
      dnf install -y ca-certificates curl git gzip tar sudo shadow-utils
      ;;
    yum)
      yum install -y ca-certificates curl git gzip tar sudo shadow-utils
      ;;
    zypper)
      zypper --non-interactive refresh
      zypper --non-interactive install ca-certificates curl git gzip tar sudo shadow
      ;;
  esac
}

install_docker_engine() {
  if command -v docker >/dev/null 2>&1; then
    log "Docker already installed: $(docker --version 2>/dev/null || true)"
  else
    log "Installing Docker engine"
    case "$PM" in
      apt)
        apt-get install -y docker.io || true
        ;;
      dnf)
        dnf install -y docker || dnf install -y moby-engine || true
        ;;
      yum)
        yum install -y docker || yum install -y moby-engine || true
        ;;
      zypper)
        zypper --non-interactive install docker || true
        ;;
    esac

    if ! command -v docker >/dev/null 2>&1; then
      warn "Distribution Docker package was unavailable; falling back to Docker's official convenience installer."
      local docker_installer
      docker_installer="$(mktemp /tmp/get-docker.XXXXXX.sh)"
      curl --fail --location --retry 4 --retry-delay 2 -o "$docker_installer" https://get.docker.com
      sh "$docker_installer"
      rm -f "$docker_installer"
    fi
  fi

  systemctl enable --now docker
  docker info >/dev/null 2>&1 || die "Docker is installed but the daemon is not reachable."
}

install_compose_plugin() {
  if docker compose version >/dev/null 2>&1; then
    log "Docker Compose already available: $(docker compose version --short 2>/dev/null || docker compose version)"
    return
  fi

  log "Installing Docker Compose CLI plugin"
  local compose_version compose_url
  compose_version="$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/docker/compose/releases/latest | sed 's#.*/v##')"
  [[ -n "$compose_version" ]] || die "Unable to determine latest Docker Compose version."

  install -d -m 0755 /usr/local/lib/docker/cli-plugins
  compose_url="https://github.com/docker/compose/releases/download/v${compose_version}/docker-compose-linux-${COMPOSE_ARCH}"
  curl --fail --location --retry 4 --retry-delay 2 -o /usr/local/lib/docker/cli-plugins/docker-compose "$compose_url"
  chmod 0755 /usr/local/lib/docker/cli-plugins/docker-compose
  docker compose version >/dev/null 2>&1 || die "Docker Compose installation failed."
}

ensure_runner_user() {
  if id "$RUNNER_USER" >/dev/null 2>&1; then
    log "Runner user ${RUNNER_USER} already exists"
  else
    log "Creating runner user ${RUNNER_USER}"
    useradd --create-home --shell /bin/bash "$RUNNER_USER"
  fi

  getent group docker >/dev/null 2>&1 || groupadd docker
  usermod -aG docker "$RUNNER_USER"

  local runner_group
  runner_group="$(id -gn "$RUNNER_USER")"
  install -d -o "$RUNNER_USER" -g "$runner_group" -m 0750 "$RUNNER_DIR"
  install -d -o "$RUNNER_USER" -g "$runner_group" -m 0750 \
    "$DEPLOY_DIR" \
    "$DEPLOY_DIR/backups" \
    "$DEPLOY_DIR/deploy-state"
}

runner_is_configured() {
  [[ -f "$RUNNER_DIR/.runner" ]]
}

install_runner_files() {
  if [[ -x "$RUNNER_DIR/config.sh" ]]; then
    log "GitHub Actions runner files already installed"
    return
  fi

  log "Downloading latest GitHub Actions runner"
  local runner_version runner_url archive
  runner_version="$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/actions/runner/releases/latest | sed 's#.*/v##')"
  [[ -n "$runner_version" ]] || die "Unable to determine latest GitHub Actions runner version."

  runner_url="https://github.com/actions/runner/releases/download/v${runner_version}/actions-runner-linux-${RUNNER_ARCH}-${runner_version}.tar.gz"
  archive="$(mktemp /tmp/actions-runner.XXXXXX.tar.gz)"
  curl --fail --location --retry 4 --retry-delay 2 -o "$archive" "$runner_url"
  tar -xzf "$archive" -C "$RUNNER_DIR"
  chown -R "$RUNNER_USER:$(id -gn "$RUNNER_USER")" "$RUNNER_DIR"
  rm -f "$archive"

  if [[ -x "$RUNNER_DIR/bin/installdependencies.sh" ]]; then
    "$RUNNER_DIR/bin/installdependencies.sh"
  fi
}

read_runner_token_if_needed() {
  runner_is_configured && return
  [[ -n "$RUNNER_TOKEN" ]] && return

  if [[ "$NON_INTERACTIVE" == "1" || ! -t 0 ]]; then
    die "Runner is not registered. Provide a temporary GitHub runner token with --token TOKEN or VUXO_RUNNER_TOKEN."
  fi

  printf '\nGitHub Actions runner registration token (input hidden): ' >&2
  read -r -s RUNNER_TOKEN
  printf '\n' >&2
  [[ -n "$RUNNER_TOKEN" ]] || die "Runner token cannot be empty."
}

configure_runner() {
  if runner_is_configured; then
    log "Runner already registered; keeping the existing registration"
    return
  fi

  read_runner_token_if_needed
  log "Registering GitHub Actions runner ${RUNNER_NAME}"
  (
    cd "$RUNNER_DIR"
    sudo -u "$RUNNER_USER" ./config.sh \
      --unattended \
      --url "$REPO_URL" \
      --token "$RUNNER_TOKEN" \
      --name "$RUNNER_NAME" \
      --labels "$RUNNER_LABELS" \
      --work _work \
      --replace
  )
  RUNNER_TOKEN=""
  unset VUXO_RUNNER_TOKEN || true
}

install_runner_service() {
  log "Installing/enabling GitHub Actions runner service"
  (
    cd "$RUNNER_DIR"
    if [[ ! -f .service ]]; then
      ./svc.sh install "$RUNNER_USER"
    fi
    ./svc.sh start || true
    ./svc.sh status
  )
}

configure_needrestart() {
  if [[ "$PM" == "apt" && -d /etc/needrestart/conf.d ]]; then
    log "Protecting the runner service from needrestart during deployments"
    cat > /etc/needrestart/conf.d/actions_runner_services.conf <<'EOF_NEEDRESTART'
$nrconf{override_rc}{qr(^actions\.runner\..+\.service$)} = 0;
EOF_NEEDRESTART
  fi
}

verify_host() {
  log "Verifying production host"
  docker --version
  docker compose version
  systemctl is-active --quiet docker || die "Docker service is not active."
  sudo -u "$RUNNER_USER" docker info >/dev/null 2>&1 || die "Runner user ${RUNNER_USER} cannot access the Docker daemon."

  if [[ -f "$RUNNER_DIR/.service" ]]; then
    local runner_service
    runner_service="$(cat "$RUNNER_DIR/.service")"
    systemctl is-active --quiet "$runner_service" || die "GitHub Actions runner service ${runner_service} is not active."
  else
    die "GitHub Actions runner service marker is missing."
  fi

  curl --fail --silent --show-error --location --max-time 15 https://github.com/ >/dev/null \
    || die "Outbound HTTPS connectivity to github.com failed."

  # GHCR correctly returns 401 when reachable without credentials.
  local ghcr_status
  ghcr_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://ghcr.io/v2/ || true)"
  [[ "$ghcr_status" == "200" || "$ghcr_status" == "401" ]] \
    || die "Outbound connectivity to ghcr.io failed (HTTP ${ghcr_status:-none})."
}

print_summary() {
  cat <<SUMMARY

============================================================
 VUXO production host is ready
============================================================
 Repository:       ${REPO_URL}
 Runner name:      ${RUNNER_NAME}
 Runner labels:    self-hosted, linux, ${RUNNER_ARCH}, ${RUNNER_LABELS}
 Runner user:      ${RUNNER_USER}
 Runner directory: ${RUNNER_DIR}
 Deploy state:     ${DEPLOY_DIR}

Docker and Docker Compose are running and the GitHub Actions runner is
installed as a systemd service. The existing VUXO workflow can now select
this machine with:

  runs-on: [self-hosted, linux, x64, vuxo-prod]

Before the first production deployment, the GitHub Environment named
"production" must contain these repository environment secrets:

  VUXO_POSTGRES_PASSWORD
  VUXO_JWT_SIGNING_KEY
  VUXO_CLOUDFLARE_TUNNEL_TOKEN

After that, a backend change merged/pushed to main triggers the normal
build -> test -> GHCR -> self-hosted deploy pipeline automatically.

No VUXO application port needs to be exposed publicly on this host.
Cloudflare Tunnel remains the public ingress path.
============================================================
SUMMARY
}

log "Bootstrapping VUXO production host"
log "Detected architecture: ${ARCH_RAW}; package manager: ${PM}"
install_base_packages
install_docker_engine
install_compose_plugin
ensure_runner_user
install_runner_files
configure_runner
install_runner_service
configure_needrestart
verify_host
print_summary
