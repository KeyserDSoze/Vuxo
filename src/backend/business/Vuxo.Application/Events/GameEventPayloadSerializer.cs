using System.Text.Json;

namespace Vuxo.Application.Events;

public static class GameEventPayloadSerializer
{
    public const int CurrentSchemaVersion = 1;

    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false
    };

    public static string Serialize<T>(string kind, T data)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(kind);
        return JsonSerializer.Serialize(
            new GameEventPayloadEnvelope<T>(CurrentSchemaVersion, kind.Trim(), data),
            Options);
    }
}

public sealed record GameEventPayloadEnvelope<T>(
    int SchemaVersion,
    string Kind,
    T Data);
