# Vuxo observability stack

Vuxo 0.0.1 keeps **technical telemetry** separate from the functional/domain audit exposed by the admin event store.

The API uses OpenTelemetry for traces, metrics and structured logs. The self-hosted stack is optional and is enabled only by adding the Compose overlay `docker/compose.observability.yml`; the normal production Compose file remains sufficient to run the game without Grafana, Prometheus, Loki or Tempo.

## Components

- OpenTelemetry Collector Contrib `0.161.0`: OTLP ingestion, secret-prone attribute removal and routing;
- Prometheus `3.14.0`: metrics storage;
- Loki `3.7.6`: structured logs;
- Tempo `3.0.3`: traces;
- Grafana `13.2.1`: technical dashboards and exploration.

Grafana is bound to `127.0.0.1` by default. Do not expose it publicly without an authenticated reverse proxy or an authenticated Cloudflare policy.

## Production startup

Set the normal production variables plus:

- `VUXO_GRAFANA_ADMIN_PASSWORD` — required strong Grafana administrator password;
- `VUXO_OTEL_SAMPLING_RATIO` — trace sampling ratio from `0.0` to `1.0`, default `0.25` in the observability overlay;
- `VUXO_PROMETHEUS_RETENTION` — default `15d`;
- `VUXO_LOKI_RETENTION` — default `168h`;
- `VUXO_TEMPO_RETENTION` — default `48h`;
- `VUXO_GRAFANA_PORT` — loopback port, default `3000`;
- `VUXO_GRAFANA_URL` — optional externally reachable **authenticated** URL shown to Administrators inside `/admin`.

Start the base runtime plus observability:

```bash
docker compose \
  -f docker/compose.prod.yml \
  -f docker/compose.observability.yml \
  up -d
```

Without the second `-f` file, the API runs normally and `Observability:OtlpEndpoint` remains empty, so no OTLP exporter connection is attempted.

## Telemetry emitted by the API

The API registers OpenTelemetry tracing for ASP.NET Core and outbound HTTP, runtime/API meters, and the custom `Vuxo.Api` source/meter. The world host also emits:

- `world.join` and `world.leave` activities;
- `vuxo.world.tick.duration`;
- `vuxo.world.tick.players_changed`;
- `vuxo.world.players.online`;
- `vuxo.world.tick.failures`;
- `vuxo.world.input.rejected`.

Requests receive an `X-Correlation-ID`. A safe incoming correlation ID is preserved; otherwise Vuxo derives one from the active trace. Authenticated requests add the player ID to the telemetry scope/activity.

## Sensitive data rules

Never add authentication tokens, passwords, cookies, secrets or database connection strings to telemetry.

Vuxo applies two layers of protection:

1. application-side query sanitization redacts sensitive query parameters before adding any custom query tag;
2. the production collector removes generic `url.query`, authorization/cookie headers and `db.connection_string` before exporting.

Do not weaken these processors when adding a new backend.

## Verification

CI validates the merged production + observability Compose model, starts an isolated Collector with `otel-collector.smoke.yml`, runs the backend tests with a real OTLP exporter pointed at that Collector and finally verifies that telemetry containing the `vuxo-api` service identity reached the Collector.

Unit/integration coverage also verifies correlation enrichment, sensitive query redaction, custom activity tags, custom metric emission and Administrator-only observability metadata.
