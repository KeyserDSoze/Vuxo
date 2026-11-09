#!/usr/bin/env python3
"""Read-only, redacted Pi3 triage after a failed external Cloudflare smoke.

No raw Docker output, headers, IP addresses, runtime tokens or HTTP bodies.
This diagnostic reports facts; it never declares the public release healthy.
"""
if __package__:
    from . import diagnose_origin as origin
else:
    import diagnose_origin as origin

PUBLIC_HEALTH = "https://api.vuxoapi.xyz/health"
OOM = "{{.State.OOMKilled}}"
RESTARTS = "{{.RestartCount}}"


def restart_category(raw):
    if raw is None or not raw.isdecimal() or len(raw) > 12:
        return "unknown"
    return "seen" if int(raw) > 0 else "none"


def diagnose(run=origin.run_command, emit=print):
    """Always informational: release stays failed in the upstream public job."""
    # A fresh internal origin observation is crucial for distinguishing an
    # edge/ingress problem from a connector-local Docker networking failure.
    internal_status = origin.diagnose(run=run, emit=emit)
    if internal_status != 0:
        emit("NOTE: current connector-to-origin health is unverified")

    connector = origin.container_id("cloudflared", run)
    api = origin.container_id("api", run)
    if not connector or not api:
        emit("WARN: running connector or API unavailable for external cross-check")
        return 0

    oom = origin.inspect_text(connector, OOM, run)
    if oom == "true":
        emit("WARN: connector Docker state reports OOM killed")
    elif oom == "false":
        emit("INFO: connector Docker state does not report OOM killed")
    else:
        emit("INFO: connector OOM state unavailable")
    count = origin.inspect_text(connector, RESTARTS, run)
    emit("INFO: connector Docker restart count category: " + restart_category(count))

    image = origin.inspect_text(api, "{{.Image}}", run)
    if not image or not origin.IMAGE_ID.fullmatch(image):
        emit("WARN: local API image unavailable for public route cross-check")
        return 0

    # The API image is already present on the Pi and contains curl. Share only
    # cloudflared's network namespace. Never pull, mount, publish, inject env
    # or execute shell commands on the running connector.
    exit_code, value = run([
        "docker", "run", "--rm", "--pull=never",
        "--network", f"container:{connector}",
        "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
        "--pids-limit", "32", "--entrypoint", "curl", image,
        "--silent", "--output", "/dev/null", "--connect-timeout", "3",
        "--max-time", "8", "--write-out", "%{http_code}",
        PUBLIC_HEALTH,
    ])
    if exit_code == 0 and len(value) == 3 and value.isascii() and value.isdecimal() and value[0] in "12345":
        emit("INFO: public API from Pi connector network namespace: HTTP " + value)
    else:
        emit("INFO: public API from Pi connector network namespace: unavailable")
    emit("NOTE: this is a read-only comparison, not a successful release gate or OAuth test")
    return 0


if __name__ == "__main__":
    raise SystemExit(diagnose())
