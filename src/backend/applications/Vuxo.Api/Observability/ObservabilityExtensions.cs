using System.Reflection;
using Npgsql;
using OpenTelemetry.Exporter;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace Vuxo.Api.Observability;

public static class ObservabilityExtensions
{
    public static WebApplicationBuilder AddVuxoObservability(this WebApplicationBuilder builder)
    {
        if (!builder.Configuration.GetValue("Observability:Enabled", true))
        {
            return builder;
        }

        var serviceName = builder.Configuration["Observability:ServiceName"] ?? "vuxo-api";
        var serviceVersion = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.0.0";
        var samplingRatio = Math.Clamp(
            builder.Configuration.GetValue<double?>("Observability:SamplingRatio") ?? 1d,
            0d,
            1d);
        var otlpEndpoint = ParseEndpoint(builder.Configuration["Observability:OtlpEndpoint"]);

        var resource = ResourceBuilder.CreateDefault()
            .AddService(serviceName, serviceVersion: serviceVersion)
            .AddAttributes(new Dictionary<string, object>
            {
                ["deployment.environment.name"] = builder.Environment.EnvironmentName
            });

        var openTelemetry = builder.Services.AddOpenTelemetry()
            .ConfigureResource(resourceBuilder => resourceBuilder
                .AddService(serviceName, serviceVersion: serviceVersion)
                .AddAttributes(new Dictionary<string, object>
                {
                    ["deployment.environment.name"] = builder.Environment.EnvironmentName
                }))
            .WithTracing(tracing =>
            {
                tracing
                    .AddSource(VuxoTelemetry.ActivitySourceName)
                    .SetSampler(new ParentBasedSampler(new TraceIdRatioBasedSampler(samplingRatio)))
                    .AddAspNetCoreInstrumentation(options =>
                    {
                        options.RecordException = true;
                        options.Filter = context => !context.Request.Path.StartsWithSegments("/health");
                    })
                    .AddHttpClientInstrumentation(options => options.RecordException = true)
                    .AddNpgsql();

                if (otlpEndpoint is not null)
                {
                    tracing.AddOtlpExporter(options => ConfigureExporter(options, otlpEndpoint));
                }
            })
            .WithMetrics(metrics =>
            {
                metrics
                    .AddMeter(
                        VuxoTelemetry.MeterName,
                        "Microsoft.AspNetCore.Hosting",
                        "Microsoft.AspNetCore.Server.Kestrel",
                        "System.Net.Http",
                        "Npgsql")
                    .AddRuntimeInstrumentation();

                if (otlpEndpoint is not null)
                {
                    metrics.AddOtlpExporter(options => ConfigureExporter(options, otlpEndpoint));
                }
            });

        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
            logging.ParseStateValues = true;
            logging.SetResourceBuilder(resource);
            if (otlpEndpoint is not null)
            {
                logging.AddOtlpExporter(options => ConfigureExporter(options, otlpEndpoint));
            }
        });

        _ = openTelemetry;
        return builder;
    }

    private static Uri? ParseEndpoint(string? value)
        => Uri.TryCreate(value, UriKind.Absolute, out var endpoint) ? endpoint : null;

    private static void ConfigureExporter(OtlpExporterOptions options, Uri endpoint)
    {
        options.Endpoint = endpoint;
        options.Protocol = OtlpExportProtocol.Grpc;
    }
}
