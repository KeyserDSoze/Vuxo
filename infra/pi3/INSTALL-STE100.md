# VUXO Raspberry Pi 3 — Installation Procedure

Document ID: VUXO-OPS-PI3-STE-001  
Target: Raspberry Pi 3, Raspberry Pi OS Lite 64-bit, Docker Engine, GitHub Actions  
Status: Installation procedure for an unverified hardware target  
Language: Controlled technical English, aligned with ASD-STE100 principles

> **NOTICE:** This document uses ASD-STE100 writing principles. It is not a certified ASD-STE100 document. A formal language review is necessary.

## 1. Scope

This procedure prepares the VUXO server on a Raspberry Pi 3. The server has 1 GB of RAM.

The normal installation contains these services:

| Service | Function |
| --- | --- |
| VUXO API | Run the .NET 10 game server. |
| PostgreSQL | Keep game data. |
| Redis | Keep cache and realtime state. |
| Cloudflare Tunnel | Connect the API to the public hostname. |
| GitHub runner | Get and install a tested API image. |

The frontend runs on GitHub Pages at https://vuxo.app. The API uses https://api.vuxoapi.xyz.

**Do not install RabbitMQ, Azurite, Grafana, or Ollama as part of the initial production installation.** Use the optional procedures after the normal server passes its tests.

## 2. Safety rules

**WARNING:** The Docker group gives a user high-level control of the host. Use only a trusted runner account. Do not run untrusted pull-request code on the runner.

**CAUTION:** Do not use the command "docker compose down -v" on a server with game data. The command can remove Docker volumes.

**CAUTION:** A rollback of the API image does not reverse database schema changes. Make a database backup before each deployment.

**CAUTION:** A backup on the same microSD card is not an external backup. Keep a second copy on a different device.

**NOTE:** Use an SSD when possible. Check the power supply. Low voltage can cause storage errors.

## 3. Prerequisites

You must have:

- Raspberry Pi 3 and a power supply.
- A microSD card with sufficient free space, or a suitable SSD.
- A PC with an SSH client.
- A GitHub account with access to KeyserDSoze/Vuxo.
- Access to Cloudflare for the API tunnel.
- Access to the GitHub Pages settings for vuxo.app.
- Permission to change GitHub Actions secrets and variables.

Do not continue if you cannot access GitHub or Cloudflare.

## 4. Install the operating system

**Work location: PC.**

1. Start Raspberry Pi Imager.
2. Select your Raspberry Pi 3.
3. Select **Raspberry Pi OS Lite (64-bit)**.
4. Select the storage device.
5. Set a host name, such as vuxo-pi3.
6. Create a normal user, such as piadmin.
7. Enable SSH.
8. Add your SSH public key.
9. Set the network connection.
10. Write the image.

**Expected result:** The installation media is ready.

1. Put the media into the Raspberry Pi.
2. Connect the Raspberry Pi to power.
3. Find the host name or IP address on your local network.

**Work location: PC terminal.**

~~~sh
ssh piadmin@vuxo-pi3.local
~~~

If the host name does not resolve, use the local IP address.

**Expected result:** You can open a shell on the Raspberry Pi.

## 5. Check the operating system

**Work location: Raspberry Pi.**

Run these commands:

~~~sh
uname -m
cat /etc/os-release
free -h
df -h
~~~

**Expected result:** The architecture is aarch64. The operating system is Debian-based. There is free disk space.

**STOP:** If the architecture is not aarch64, install a 64-bit operating system. Do not continue with the 32-bit image.

Update the operating system.

~~~sh
sudo apt update
sudo apt full-upgrade -y
sudo reboot
~~~

Connect to the Raspberry Pi again after the restart.

## 6. Get the private VUXO repository

**Work location: Raspberry Pi.**

Install Git.

~~~sh
sudo apt update
sudo apt install -y git
~~~

Make a new SSH key for read-only repository access.

~~~sh
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
ssh-keygen -t ed25519 -f "$HOME/.ssh/vuxo_readonly" -C "vuxo-pi3-readonly"
cat "$HOME/.ssh/vuxo_readonly.pub"
~~~

**Work location: GitHub website.**

1. Open KeyserDSoze/Vuxo.
2. Open **Settings > Deploy keys**.
3. Select **Add deploy key**.
4. Enter a name, such as vuxo-pi3-readonly.
5. Paste the public key.
6. Leave write access disabled.
7. Save the key.

**Work location: Raspberry Pi.**

Before you accept the GitHub SSH host key, compare its fingerprint with the fingerprint in the official GitHub documentation.

Clone the installation branch.

~~~sh
GIT_SSH_COMMAND="ssh -i $HOME/.ssh/vuxo_readonly -o IdentitiesOnly=yes" \
  git clone --branch infra/pi3-arm64-runtime \
  git@github.com:KeyserDSoze/Vuxo.git "$HOME/vuxo"

cd "$HOME/vuxo"
git status --short --branch
~~~

**Expected result:** The directory contains infra/pi3/bootstrap.sh.

**NOTE:** The branch is part of draft PR #61. The branch is not a production release.

## 7. Make the runner account

**Work location: Raspberry Pi.**

Make a separate user for GitHub Actions.

~~~sh
sudo adduser --disabled-password --gecos "" vuxorunner
id vuxorunner
~~~

**Expected result:** The user exists. The user is not root.

## 8. Install Docker

**Work location: Raspberry Pi.**

Run the installation script from the VUXO repository.

~~~sh
cd "$HOME/vuxo"
sudo bash infra/pi3/bootstrap.sh vuxorunner
~~~

The script installs Docker Engine and Docker Compose. It enables Docker at system startup. It gives the runner account access to Docker.

Check the installation.

~~~sh
sudo systemctl is-enabled docker
sudo systemctl is-active docker
sudo docker compose version
sudo docker info --format '{{.Architecture}}'
~~~

**Expected result:** Docker is enabled and active. The architecture is aarch64.

**STOP:** If a command fails, read its error output. Do not register the GitHub runner until Docker works.

## 9. Register the GitHub runner

**Work location: GitHub website.**

1. Open **KeyserDSoze/Vuxo > Settings > Actions > Runners**.
2. Select **New self-hosted runner**.
3. Select **Linux**.
4. Select **ARM64**.
5. Keep the page open.

**Work location: Raspberry Pi.**

Change to the runner account.

~~~sh
sudo -iu vuxorunner
mkdir -p "$HOME/actions-runner"
cd "$HOME/actions-runner"
~~~

Run the **exact download and checksum commands** that GitHub shows. Do not use an old runner URL or an old registration token.

Run the configuration command that GitHub shows. Add the custom label **vuxo-pi3** when GitHub asks for labels.

**Expected result:** GitHub shows a runner with these labels: self-hosted, Linux, ARM64, vuxo-pi3.

Leave the runner shell.

~~~sh
exit
~~~

**Work location: Raspberry Pi, normal administration account.**

Install the runner as a system service. The administrative account cannot normally enter the private home directory of `vuxorunner`. Run each service operation inside a root shell that changes to the runner directory first. Using an absolute path to `svc.sh` without changing directory causes the error `Must run from runner root`.

~~~sh
sudo bash -c 'cd /home/vuxorunner/actions-runner && ./svc.sh install vuxorunner && ./svc.sh start && ./svc.sh status'
~~~

**Expected result:** The runner service is `active (running)` and `enabled`.

**Work location: GitHub website.**

Refresh **Settings > Actions > Runners**.

**Expected result:** The vuxo-pi3 runner is online.

**STOP:** Do not enable the production deploy if the runner is offline.

## 10. Add GitHub secrets

**Work location: GitHub website.**

Open **KeyserDSoze/Vuxo > Settings > Environments > production**.

Make these environment secrets:

| Secret | Required value |
| --- | --- |
| VUXO_POSTGRES_PASSWORD | A strong, new PostgreSQL password. |
| VUXO_JWT_SIGNING_KEY | A random signing key with at least 32 characters. |
| VUXO_CLOUDFLARE_TUNNEL_TOKEN | The token from the Cloudflare tunnel. |

Do not put these values in Git, a screenshot, or a terminal history file.

Add these environment variables:

| Variable | Value |
| --- | --- |
| VUXO_ALLOWED_ORIGIN | https://vuxo.app |
| VUXO_GOOGLE_CLIENT_ID | Your Google client ID, if used. |
| VUXO_MICROSOFT_CLIENT_ID | Your Microsoft client ID, if used. |
| VUXO_MICROSOFT_TENANT_ID | Your tenant setting, if used. |

Open **Settings > Secrets and variables > Actions > Variables**.

Make this repository variable:

| Variable | Initial value |
| --- | --- |
| VUXO_PI3_DEPLOY_ENABLED | false |

**WARNING:** Keep this variable set to false until all preparation checks pass.

Review the production environment branch rules. Permit only trusted branches.

## 11. Configure Cloudflare

**Work location: Cloudflare website.**

1. Open the Cloudflare account.
2. Open **Networking > Tunnels**.
3. Make a remotely managed tunnel, or select the existing VUXO tunnel.
4. Add a published application route.
5. Set the public hostname to **api.vuxoapi.xyz**.
6. Set the service URL to **http://api:8080**.
7. Save the route.
8. Copy the tunnel token to the GitHub environment secret.

**NOTE:** The service URL uses the Docker service name api. Do not use localhost as the service URL in this configuration.

Do not publish PostgreSQL, Redis, the Docker socket, or the monitoring pages.

## 12. Check the frontend domain

**Work location: GitHub website.**

1. Open **KeyserDSoze/Vuxo > Settings > Pages**.
2. Check that the custom domain is **vuxo.app**.
3. Check the DNS configuration.
4. Check that HTTPS is active.

**Work location: PC browser.**

Open https://vuxo.app.

**Expected result:** The VUXO frontend loads through HTTPS.

If Google or Microsoft login is in use, open the provider configuration.

Check the approved frontend origin and redirect URL. Use https://vuxo.app where the application requires it.

**STOP:** Do not approve the production cutover until the domain and login tests pass.

## 13. Prepare the production release

**Work location: Raspberry Pi, administration account.**

Run the read-only host preflight:

~~~sh
cd "$HOME/vuxo"
sudo bash infra/pi3/preflight.sh
~~~

**Expected result:** No FAIL results. Investigate all WARN results, particularly power undervoltage. The preflight also checks Docker access for the runner user and GitHub/GHCR HTTPS.

The legacy x64 workflow is disabled unless repository variable `VUXO_X64_DEPLOY_ENABLED=true`. Keep this variable unset or false during the Pi migration.

**STOP:** Do not enable the Pi deployment if undervoltage continues, or if the runner cannot use Docker.



**Work location: GitHub website.**

1. Open draft pull request #61.
2. Review the changes.
3. Confirm that the CI checks have passed.
4. Confirm that all required container images have a linux/arm64 variant.
5. Confirm that the old x64 production workflow cannot deploy to the same production environment.
6. Confirm that the PostgreSQL backup procedure is approved.
7. Merge PR #61 into main when the review is complete.

**NOTE:** The installation branch is not a substitute for an approved main release.

The ARM64 build can run before Raspberry deployment is enabled. Keep the repository variable VUXO_PI3_DEPLOY_ENABLED set to false. A successful main CI run then publishes an ARM64 image to GHCR. The production deployment job does not start.

The ARM64 workflow uses this sequence:

1. GitHub CI tests main.
2. GitHub builds the ARM64 image.
3. GitHub sends the image to GHCR.
4. The Raspberry Pi runner gets the image.
5. The deploy script makes a PostgreSQL backup.
6. Docker replaces the API container.
7. The deploy script tests the API.

The deploy script attempts an image rollback if the API does not pass its health check.

## 14. Enable automatic deployment

**Work location: GitHub website.**

Verify that the runner is online.

Verify that the Cloudflare token and database secrets exist.

Verify that the old x64 deployment will not conflict with the new deployment.

Set **VUXO_PI3_DEPLOY_ENABLED** to **true**.

Merge a new, approved change into main. This starts a new CI run.

**IMPORTANT:** A CI run that ended before you enabled the variable does not automatically start a new Pi deploy.

### Retry a deployment

Before a retry, check the Raspberry power status:

~~~sh
vcgencmd get_throttled
~~~

A fresh boot with a stable power supply should report `throttled=0x0`.
**STOP:** If undervoltage or throttling is active, do not force the deployment.
The GitHub runner performs its own hardware preflight and stops before the database is changed.

To request a new attempt, push a reviewed change to `main`.
The `CI` workflow tests that commit. A successful CI starts the ARM64 workflow.
The workflow publishes an ARM64 image. It then tries to deploy only if
the repository variable `VUXO_PI3_DEPLOY_ENABLED` is `true`.

**NOTE:** A direct change of the GitHub variable does not start a new workflow.
Do not change scripts to bypass the preflight, and do not clear power warnings without fixing the cause.

Open **Actions > Deploy VUXO to Raspberry Pi 3 ARM64**.

**Expected result:** The build-arm64 job completes. Then the deploy-pi3 job completes.

**STOP:** If the job fails, read the Actions job logs. Do not repeat the deploy without finding the cause.

## 15. Check the API

**Work location: Raspberry Pi.**

Run:

~~~sh
curl --fail --silent --show-error http://127.0.0.1:8080/health
docker ps --filter label=com.docker.compose.project=vuxo
docker stats --no-stream
~~~

**Expected result:** The health request succeeds. The API, PostgreSQL, Redis, and Cloudflare containers are running.

Check API log output.

~~~sh
docker ps -q --filter label=com.docker.compose.service=api \
  | xargs -r docker logs --tail 100
~~~

**Work location: PC browser.**

Open https://api.vuxoapi.xyz/health.

**Expected result:** The public API health endpoint succeeds.

If the public endpoint fails but the local endpoint works, check the Cloudflare route and tunnel.

## 16. Test system restart

**Work location: Raspberry Pi.**

Check the services before restart.

~~~sh
sudo systemctl is-enabled docker
docker ps --filter label=com.docker.compose.project=vuxo
~~~

Restart the Raspberry Pi.

~~~sh
sudo reboot
~~~

Connect to the Raspberry Pi again.

~~~sh
ssh piadmin@vuxo-pi3.local
~~~

Run:

~~~sh
sudo systemctl is-active docker
docker ps --filter label=com.docker.compose.project=vuxo
curl --fail --silent --show-error http://127.0.0.1:8080/health
~~~

**Expected result:** Docker restarts and the VUXO API responds.

Open GitHub **Settings > Actions > Runners**.

**Expected result:** The vuxo-pi3 runner is online.

## 17. Check the backup

**Work location: Raspberry Pi, runner account.**

List the backup files.

~~~sh
sudo -iu vuxorunner
ls -lh "$HOME/vuxo-backups"
exit
~~~

**Expected result:** Each completed deploy has a PostgreSQL backup file.

Transfer the backup file to a different device. Protect that file against unauthorized access.

Test the restore process on a separate test database. Do not restore a test backup over the live game database.

**CAUTION:** The deploy script does not roll back EF migrations. A failed image update can still require database recovery.

## 18. Optional: Monitor the host with Beszel

Do this procedure only if the default services have sufficient free RAM.

**Work location: Raspberry Pi.**

Make a private settings directory.

~~~sh
mkdir -p "$HOME/.config/vuxo"
chmod 700 "$HOME/.config/vuxo"
nano "$HOME/.config/vuxo/monitor.env"
~~~

Enter these temporary values:

~~~dotenv
VUXO_BESZEL_KEY=pending
VUXO_BESZEL_TOKEN=pending
~~~

Save the file. Set its permissions.

~~~sh
chmod 600 "$HOME/.config/vuxo/monitor.env"
~~~

Start the Beszel hub first.

~~~sh
docker compose -p vuxo-monitor \
  --env-file "$HOME/.config/vuxo/monitor.env" \
  -f "$HOME/vuxo/docker/compose.pi3.monitor.yml" \
  up -d beszel
~~~

**Work location: PC.**

Open an SSH port tunnel to the Raspberry Pi.

~~~sh
ssh -L 8090:127.0.0.1:8090 piadmin@vuxo-pi3.local
~~~

Open http://localhost:8090.

1. Create the Beszel admin account.
2. Select **Add System**.
3. Get the public key and the agent token.
4. Use **/beszel_socket/beszel.sock** as the agent address.

**Work location: Raspberry Pi.**

Replace the pending values in monitor.env with the real values.

Start the agent.

~~~sh
docker compose -p vuxo-monitor \
  --env-file "$HOME/.config/vuxo/monitor.env" \
  -f "$HOME/vuxo/docker/compose.pi3.monitor.yml" \
  up -d beszel-agent
~~~

**Expected result:** Beszel shows CPU, RAM, disk, and container information.

**STOP:** If the Pi has memory problems, stop the optional monitoring services.

## 19. Optional: Read Docker logs with Dozzle

Do this procedure only if there is sufficient free RAM.

**Work location: Raspberry Pi.**

Make a private data directory.

~~~sh
mkdir -p "$HOME/vuxo-dozzle-data"
chmod 700 "$HOME/vuxo-dozzle-data"
~~~

Generate a user file. The tool asks for a password.

~~~sh
docker run -it --rm amir20/dozzle:latest \
  generate admin > "$HOME/vuxo-dozzle-data/users.yml"

chmod 600 "$HOME/vuxo-dozzle-data/users.yml"
~~~

Make a private settings file.

~~~sh
mkdir -p "$HOME/.config/vuxo"
printf 'VUXO_DOZZLE_DATA_DIR=%s\n' "$HOME/vuxo-dozzle-data" \
  > "$HOME/.config/vuxo/logs.env"
chmod 600 "$HOME/.config/vuxo/logs.env"
~~~

Start the log viewer.

~~~sh
docker compose -p vuxo-logs \
  --env-file "$HOME/.config/vuxo/logs.env" \
  -f "$HOME/vuxo/docker/compose.pi3.logs.yml" \
  up -d
~~~

**Work location: PC.**

Open an SSH port tunnel.

~~~sh
ssh -L 8088:127.0.0.1:8088 piadmin@vuxo-pi3.local
~~~

Open http://localhost:8088.

**Expected result:** The page asks for a login. You can read container logs.

**WARNING:** Dozzle can access the Docker socket. Never publish this page to the Internet.

## 20. Optional services that are not part of the normal Pi installation

**RabbitMQ:** The repository contains docker/compose.pi3.rabbitmq.yml. The service has a management page. VUXO does not yet have a completed queue producer and consumer integration. Do not start RabbitMQ on the Pi until you have verified available RAM and implemented the application integration.

**Azurite:** The repository contains docker/compose.pi3.azurite.yml. Use Azurite for development and tests only. Do not keep production game files in Azurite.

**Grafana, Loki, Tempo, Prometheus:** Use the existing observability stack on a larger server. The full stack is not part of the Raspberry Pi 3 installation.

**Local AI:** Keep Ollama disabled on this Raspberry Pi. Use an external AI service or a larger computer after the gateway supports the required vision inputs and allowed tools. The game must work when AI is unavailable.

## 21. If a test fails

| Symptom | Action |
| --- | --- |
| SSH connection fails | Check power, network, host name, and SSH setup. |
| Architecture is not aarch64 | Install Raspberry Pi OS Lite 64-bit. |
| Docker is not active | Read systemctl status docker. |
| GitHub runner is offline | Check the service with svc.sh status. |
| GHCR pull fails | Check the Actions job and package read permission. |
| Local API health fails | Read the API and PostgreSQL container logs. |
| Public API health fails | Check the Cloudflare Tunnel route. |
| Login fails | Check vuxo.app, provider settings, and API CORS. |
| Pi stops a container | Check free RAM and Docker OOM events. |
| API rollback fails | Keep the backup. Use the recovery procedure on a separate test system first. |

## 22. Release acceptance checklist

Mark a check only after you get the expected result.

- [ ] The operating system is aarch64.
- [ ] SSH access works with a public key.
- [ ] The repository is available with read-only access.
- [ ] Docker and Docker Compose work.
- [ ] The GitHub runner is online.
- [ ] The production environment has the required secrets.
- [ ] The old x64 deployment cannot conflict.
- [ ] The ARM64 image is available in GHCR.
- [ ] The API, PostgreSQL, and Redis containers are healthy.
- [ ] Cloudflare serves the API.
- [ ] The frontend and social login work on vuxo.app.
- [ ] The database backup is on a different device.
- [ ] The API and runner recover after a restart.
- [ ] The Pi passes a load test without memory errors.
- [ ] Issue #59 has the test results.

**Release condition:** Do not close issue #59 until the hardware checks and recovery tests pass.

## Reference documents

- ASD-STE100 Issue 9: https://asd-ste100.org/
- Docker installation for 64-bit Raspberry Pi OS: https://docs.docker.com/engine/install/debian/
- GitHub self-hosted runner: https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners
- GitHub runner service: https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application
- Cloudflare Tunnel: https://developers.cloudflare.com/tunnel/get-started/
- Beszel: https://beszel.dev/guide/agent-installation
- Dozzle: https://dozzle.dev/guide/authentication/simple
- VUXO PR #61: https://github.com/KeyserDSoze/Vuxo/pull/61
- VUXO issue #59: https://github.com/KeyserDSoze/Vuxo/issues/59
