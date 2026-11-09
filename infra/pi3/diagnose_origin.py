#!/usr/bin/env python3
"""Non-destructive Pi3 connector->API origin probe; never log Docker output."""
import json
import re
import subprocess

CONTAINER_ID = re.compile(r"^[a-f0-9]{12,64}$")
IMAGE_ID = re.compile(r"^sha256:[a-f0-9]{64}$")
NETWORKS = "{{json .NetworkSettings.Networks}}"
HEALTH = "{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}"


def run_command(argv):
    """Ignore stderr, which can include infrastructure identifiers or secrets."""
    try:
        proc = subprocess.run(
            argv, capture_output=True, text=True, check=False, timeout=15
        )
        return proc.returncode, proc.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return -1, ""


def container_id(service, run):
    result, output = run([
        "docker", "ps", "-q",
        "--filter", "label=com.docker.compose.project=vuxo",
        "--filter", f"label=com.docker.compose.service={service}",
        "--filter", "status=running",
    ])
    ids = output.splitlines()
    if result != 0 or len(ids) != 1 or not CONTAINER_ID.fullmatch(ids[0]):
        return None
    return ids[0]


def inspect_text(container, template, run):
    result, output = run(["docker", "inspect", "--format", template, container])
    return output if result == 0 else None


def network_names(container, run):
    raw = inspect_text(container, NETWORKS, run)
    if raw is None:
        return None
    try:
        networks = json.loads(raw)
    except (ValueError, TypeError):
        return None
    if not isinstance(networks, dict) or not networks:
        return None
    return {name for name in networks if isinstance(name, str) and name}


def diagnose(run=run_command, emit=print):
    """Fixed PASS/FAIL strings only; a success does NOT verify the public tunnel."""
    api = container_id("api", run)
    connector = container_id("cloudflared", run)
    if not api or not connector:
        emit("FAIL: expected one running API and Cloudflare connector")
        return 1
    emit("PASS: API and Cloudflare connector running")

    if inspect_text(api, HEALTH, run) != "healthy":
        emit("FAIL: API container health is not healthy")
        return 1
    emit("PASS: API container healthy")

    api_nets = network_names(api, run)
    connector_nets = network_names(connector, run)
    if not api_nets or not connector_nets or not api_nets.intersection(connector_nets):
        emit("FAIL: no verified shared Docker network between API and connector")
        return 1
    emit("PASS: API and connector share a Docker network")

    image_id = inspect_text(api, "{{.Image}}", run)
    if not image_id or not IMAGE_ID.fullmatch(image_id):
        emit("FAIL: local API image digest unavailable")
        return 1

    # Reuse the locally present, non-root API image's curl binary. Share only
    # cloudflared's network namespace; no mounts, secrets, ports or image pulls.
    code, http = run([
        "docker", "run", "--rm", "--pull=never",
        "--network", f"container:{connector}",
        "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
        "--pids-limit", "32", "--entrypoint", "curl", image_id,
        "--silent", "--output", "/dev/null", "--connect-timeout", "3",
        "--max-time", "6", "--write-out", "%{http_code}",
        "http://api:8080/health",
    ])
    if code != 0 or http != "200":
        emit("FAIL: connector network namespace cannot confirm API origin HTTP 200")
        emit("NOTE: check Docker DNS/network; public Cloudflare route remains unverified")
        return 1
    emit("PASS: connector network namespace reaches API origin HTTP 200")
    emit("NOTE: Cloudflare hostname and real OAuth require independent external verification")
    return 0


if __name__ == "__main__":
    raise SystemExit(diagnose())
