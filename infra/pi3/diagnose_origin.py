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
    except subprocess.TimeoutExpired:
        # Distinguish the 15-second Docker subprocess bound from curl's own
        # request timeout. Never return exception text or captured stderr.
        return -2, ""
    except OSError:
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


def classify_http_result(exit_code, output):
    """Allowlisted probe outcome. Never include raw subprocess output/errors."""
    if exit_code == 0:
        if isinstance(output, str) and re.fullmatch(r"[1-5][0-9]{2}", output):
            return "HTTP " + output
        return "invalid HTTP status"
    # docker run forwards curl's exit code. 125-127 are Docker/exec failures,
    # not HTTP responses. Unknown codes and raw stderr are deliberately hidden.
    errors = {
        -2: "Docker subprocess timeout",
        -1: "Docker subprocess unavailable",
        6: "DNS resolution failure",
        7: "TCP connection failure",
        28: "curl request timeout",
        35: "TLS handshake failure",
        60: "TLS certificate validation failure",
        52: "empty upstream reply",
        56: "connection reset or closed",
        125: "Docker container launch failure",
        126: "Docker container execution failure",
        127: "Docker probe executable unavailable",
    }
    return errors.get(exit_code, "probe execution failure") if isinstance(exit_code, int) else "probe execution failure"


def probe_http(run, connector, image, url, *, max_time=6):
    """Probe only two fixed health URLs from an existing connector namespace.

    Use the locally available API image as an ephemeral curl runner. Never
    mount a socket, inject credentials, pull an image or publish any port.
    """
    if (not isinstance(connector, str) or not CONTAINER_ID.fullmatch(connector)
        or not isinstance(image, str) or not IMAGE_ID.fullmatch(image)
        or url not in ("http://api:8080/health", "https://api.vuxoapi.xyz/health")
        or max_time not in (6, 8)):
        return "probe input rejected"
    exit_code, output = run([
        "docker", "run", "--rm", "--pull=never",
        "--network", f"container:{connector}",
        "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
        "--pids-limit", "32", "--entrypoint", "curl", image,
        "--silent", "--output", "/dev/null", "--connect-timeout", "3",
        "--max-time", str(max_time), "--write-out", "%{http_code}",
        url,
    ])
    return classify_http_result(exit_code, output)

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

    result = probe_http(run, connector, image_id, "http://api:8080/health")
    if result != "HTTP 200":
        emit("FAIL: connector network namespace cannot confirm API origin HTTP 200 (probe: " + result + ")")
        emit("NOTE: origin probe result is not a public Cloudflare route diagnosis")
        return 1
    emit("PASS: connector network namespace reaches API origin HTTP 200")
    emit("NOTE: Cloudflare hostname and real OAuth require independent external verification")
    return 0


if __name__ == "__main__":
    raise SystemExit(diagnose())
