# VUXO on Raspberry Pi 3 (ARM64) — installation and operations

For the step-by-step controlled-English procedure, read **[INSTALL-STE100.md](INSTALL-STE100.md)**. The procedure follows ASD-STE100 writing principles. It is not certified.

Status: **proposal / hardware validation pending**.

Before enabling deployment on the Raspberry, run the read-only checks as user `vuxo`:

~~~bash
cd ~/vuxo
sudo bash infra/pi3/preflight.sh
~~~

Resolve all FAIL checks and review WARN results, especially undervoltage; the script does not modify running services, images or secrets. The deploy-pi3 workflow also runs this check as the unprivileged runner and stops the deployment if the check fails or returns warnings. Track issue #59 and the draft PR.
The Pi 3 1 GiB target is experimental: API + PostgreSQL + Redis + Cloudflare are the only default services. Do not assume that all optional services can fit in RAM.

## 0. Prepare the Pi

1. Install **Raspberry Pi OS Lite 64-bit** (or compatible Debian ARM64). Check uname -m returns aarch64 and hostnamectl shows the selected OS.
2. Use reliable power and ideally an external SSD (microSD-only databases wear and fail). Enable SSH with key authentication, choose a unique hostname and disable password SSH logins once a key is verified.
3. On the Pi install git and clone the **private** repo using a personal SSH key or a *read-only deploy key* authorized in GitHub. Never put a PAT into a clone URL or this repository.
4. Run: sudo bash infra/pi3/bootstrap.sh <existing-linux-user>. The installer sets up Docker Engine/Compose and enables Docker after reboot. Re-login to refresh Docker group membership.
5. Confirm: docker info, docker compose version, uname -m, free -h, df -h, systemctl is-enabled docker.
6. Use a dedicated OS account for the GitHub runner. Membership in the docker group provides effectively root-level host control. Do NOT run PR branches on this runner; do not expose the Docker socket over TCP.

## 1. Install GitHub self-hosted runner on the host (not in Docker Compose)

In **GitHub → KeyserDSoze/Vuxo → Settings → Actions → Runners → New self-hosted runner** choose Linux ARM64.
Run the **exact currently shown download/checksum/configure commands** as the dedicated non-root runner account. Use the repository URL, register with custom label **vuxo-pi3**, and check that Linux and ARM64 labels are present.

In the runner directory use the official service commands:

~~~bash
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
~~~

Runner installation must happen on the host: it needs to control Docker and persist independently of the game containers. Its short-lived registration token is copied from GitHub at install time and must not be committed.

## 2. GitHub settings

Under **Settings → Environments → production** add protected deployment secrets:
- VUXO_POSTGRES_PASSWORD (strong generated string)
- VUXO_JWT_SIGNING_KEY (at least 32 strong characters)
- VUXO_CLOUDFLARE_TUNNEL_TOKEN (Cloudflare remotely-managed tunnel)

Environment variables:
- VUXO_ALLOWED_ORIGIN = https://vuxo.quest
- VUXO_GOOGLE_CLIENT_ID, VUXO_MICROSOFT_CLIENT_ID, VUXO_MICROSOFT_TENANT_ID as required for social auth.

At repository **Settings → Secrets and variables → Actions → Variables** create
VUXO_PI3_DEPLOY_ENABLED = false until the runner is online, images pass ARM64 manifest checks, backups are configured and the migration has been approved. Enable only for the verified rollout.

The workflow deploy-pi3.yml is triggered by a successful **CI workflow from push to main**. It builds the API on GitHub's ARM64 hosted runner (not the Pi) and publishes the immutable GHCR tag **pi3-<commit-sha>** even when Raspberry deployment is disabled. Only the deployment job, which runs on [self-hosted, linux, ARM64, vuxo-pi3], requires `VUXO_PI3_DEPLOY_ENABLED=true`. A green pull-request CI is insufficient. There is no manual bypass in this workflow. This permits checking ARM64 image builds while low-voltage hardware is held out of production.

The older deploy-server.yml is an **x64** production deployment and is now disabled by default. It runs only if repository variable `VUXO_X64_DEPLOY_ENABLED=true` is set. Keep the x64 flag absent/false during Pi rollout; do not enable both production targets. Its images use separate tags.

GitHub's production environment protection rules and branch restrictions should be reviewed so only trusted main revisions receive secrets. Docker-group access grants root-equivalent power. Do not allow untrusted workflow changes or fork code onto a production runner.

## 3. Public endpoints

Final production frontend domain: **https://vuxo.quest** on GitHub Pages (see issue #130). This supersedes the earlier experimental `vuxo.app` setting. Production deploy workflows and CORS smoke checks use only the canonical `https://vuxo.quest` origin. Confirm GitHub Pages Settings → Pages → Custom domain, HTTPS, Google Authorized JavaScript origin and Microsoft SPA `https://vuxo.quest/redirect.html` in the provider consoles before declaring login complete.

The existing API host is **https://api.vuxoapi.xyz** until a new API domain is explicitly configured. The Cloudflare published service URL must be **http://api:8080** when cloudflared and the API share the Compose network. Do not point Cloudflare to localhost inside its container. Never open 5432, 6379, 11434, the Docker socket or admin dashboard to the public internet.

## Public post-deploy privacy contract (issue #145)

The GitHub-hosted `verify-public-auth` job runs after a successful Raspberry deploy and uses the canonical `https://api.vuxoapi.xyz` host. In addition to health, deployed commit SHA, the Google/Microsoft consumer configuration, CORS and the Microsoft redirect bridge, it now performs read-only probes against:

- `GET /api/personal-content/history/completed`
- `GET /api/personal-content/history/outcomes`

Each anonymous GET carries the production `Origin: https://vuxo.quest` header and **must return HTTP 401** (not 200, a redirect or a fallback page), with the canonical CORS origin and credentials policy. Preflight OPTIONS must permit GET and Authorization. **No JWT, user ID or game data is sent or logged.** The workflow fails if an endpoint is absent, accidentally public or blocked by Cloudflare/CORS. A failure does **not** undo an already applied EF migration or the database backup; investigate the production routing/API version and rerun the check after fixing it. Tests for this contract run offline in the frontend CI job (`node --test scripts/verify-public-auth.test.mjs`).

This smoke proves **anonymous isolation** and routing, not successful authenticated owner-only behavior, nor end-user Google/Microsoft OAuth. Those require the existing integration tests and final real-user acceptance (issues #119, #136, #139).

## 4. Production runtime and health

The regular automatic deploy uses these files:
- docker/compose.prod.yml (existing network and stable volumes)
- docker/compose.pi3.yml (Pi memory limits, logs rotation, local AI disabled, opt-in experimental model)

On the Pi, the equivalent read-only configuration check is:

~~~bash
docker compose -p vuxo --env-file /path/to/private.env \
  -f docker/compose.prod.yml -f docker/compose.pi3.yml \
  --profile edge config --quiet
~~~

Production deployment is executed from GitHub Actions via infra/pi3/deploy.sh. The script:
- verifies ARM64, secrets and immutable Pi image tag;
- starts PostgreSQL and Redis and creates a custom-format **pg_dump** before API replacement;
- pulls the ARM64 image and recreates only the API container, without destroying named volumes;
- checks http://127.0.0.1:8080/health; on failure attempts image-only rollback;
- starts the Cloudflare Tunnel after core health is green.

**Database migrations are NOT automatically reversed** by an image rollback. EF migrations can be incompatible with the previous API. Review schema changes and rehearse restore from a separate copy before enabling production. Backup files are stored under the runner's ~/vuxo-backups; transfer them regularly to an encrypted, off-device location. An on-microSD dump is not disaster recovery.

On reboot systemd brings up Docker and the runner; Docker restart: unless-stopped restarts containers that were running before reboot. Test a real reboot and restored PostgreSQL/Redis persistence before launch. The very first deployment needs Docker registry access using the GITHUB_TOKEN granted by the job.

## 5. Monitoring, logs, queues and storage

**Default Pi profile**: inspect via docker stats, docker compose logs and the VUXO admin UI (gameplay/domain audit). Log files rotate at 5 MiB x 3 copies per service in the Pi overlay.

**Host dashboard (optional)**: docker/compose.pi3.monitor.yml contains Beszel hub + agent; requires VUXO_BESZEL_KEY and VUXO_BESZEL_TOKEN supplied from the hub setup. Hub port 8090 binds only to 127.0.0.1. On a workstation, SSH tunnel:
~~~bash
ssh -L 8090:127.0.0.1:8090 <user>@<pi-host>
~~~
Then browse http://localhost:8090, create an admin account, and add a system with Unix socket path **/beszel_socket/beszel.sock**. Beszel provides CPU, RAM, disk and container status, not an enterprise log search engine. Hub and agent consume additional RAM: measure before keeping them on the Pi.

**Docker logs UI (optional)**: docker/compose.pi3.logs.yml uses authenticated Dozzle on host loopback port 8088. Create a private directory (such as $HOME/vuxo-dozzle-data) with permissions 0700, set VUXO_DOZZLE_DATA_DIR to that absolute path in your local configuration, and generate a bcrypt password using the official Dozzle 'generate' command to prepare its users.yml with restrictive permissions. Without users.yml the simple-auth startup must not be treated as configured. Use an SSH tunnel to 8088, and do not enable shell/actions or expose the Docker socket outside the host. Dozzle shows container logs, while Beszel shows resource/health charts; run either one only after checking free RAM.

**Queue (optional, separate capacity test)**: docker/compose.pi3.rabbitmq.yml contains RabbitMQ management; admin at loopback 15672 (SSH forward required). API message production/consumption is **not yet implemented**. Do not enable RabbitMQ just to display an empty broker, and avoid running it on the 1 GiB Pi concurrently with Beszel unless measured.

**Azure Storage emulator (development/test only)**: docker/compose.pi3.azurite.yml with Blob/Queue/Table loopback ports 10000/10001/10002. Azurite is *not* a production storage system. For production game files choose supported local object storage on adequate hardware, or managed Azure Blob Storage; implement an application adapter before considering that complete.

**Full observability stack**: docker/compose.observability.yml already supplies OTel Collector, Loki, Tempo, Prometheus, Grafana. This is a **larger-server profile**, not for Pi 3. Export sanitized traces/metrics/logs to a dedicated remote collector in future instead of deploying the entire stack on this Pi.

To observe a quick local snapshot:
~~~bash
docker stats --no-stream
docker compose -p vuxo --env-file /path/to/private.env \
  -f docker/compose.prod.yml -f docker/compose.pi3.yml ps
docker compose -p vuxo --env-file /path/to/private.env \
  -f docker/compose.prod.yml -f docker/compose.pi3.yml logs --tail=100 api
~~~

## 6. AI and rollback limitations

The local Ollama service is **disabled by default** on this memory-constrained target. The official Ollama qwen3.5:0.8b default download is about 1.2–1.3 GB; third-party 4-bit GGUF weights can be roughly 0.5–0.6 GB but require a vision projector, inference runtime and KV cache. Even these compressed variants are not a reliable concurrent 1 GiB Raspberry Pi 3 production workload. Configure a model endpoint hosted on a larger machine, only after establishing authentication, TLS and trusted image-tool message parsing in VUXO's gateway. The existing VUXO allow-listed tools remain authoritative server-side; AI cannot grant rewards or mutate the world directly.

The Pi's 1 GiB RAM, microSD I/O and CPU are a severe bottleneck for multiplayer concurrency and database workloads. Check peak resident memory, Docker OOM kills, IO latency, CPU throttling and SignalR responsiveness under concurrent gameplay. If health and load tests do not pass, move PostgreSQL/AI to a stronger host or upgrade the hardware.

## 7. Validation checklist

- Run scripts/test-pi3-compose.sh in CI and confirm CI success.
- Verify actual linux/arm64 registry manifests for API, PostgreSQL, Redis, cloudflared, and any optional images.
- Verify the real host runner service, GHCR access, Cloudflare tunnel, the API health endpoint, domain/CORS/OAuth, concurrent gameplay and reboot.
- Simulate a failed API image and validate image-only rollback; test database recovery from **off-device** PostgreSQL backup.
- Test 1 GiB RAM behavior with and without monitoring, ensure no OOM, then enable the repository deploy flag.
- Keep issue #59 open until Pi hardware, backup, security and deployment acceptance checks pass.
