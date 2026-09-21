using System.Text.Json;

namespace Vuxo.Application.AI;

public sealed record LanguageModelMessage(
    string Role,
    string? Content,
    IReadOnlyList<LanguageModelToolCall>? ToolCalls = null,
    string? ToolCallId = null,
    string? Name = null);

public sealed record LanguageModelTool(
    string Name,
    string Description,
    JsonElement Parameters);

public sealed record LanguageModelToolCall(
    string Name,
    JsonElement Arguments,
    string? Id = null);

public sealed record LanguageModelRequest(
    IReadOnlyList<LanguageModelMessage> Messages,
    IReadOnlyList<LanguageModelTool> Tools);

public sealed record LanguageModelResponse(
    string? Model,
    string? Content,
    IReadOnlyList<LanguageModelToolCall> ToolCalls);

public sealed record LanguageModelHealthStatus(
    bool Enabled,
    bool Healthy,
    string? Model,
    string? ErrorCode);

public interface ILanguageModelGateway
{
    bool IsEnabled { get; }

    Task<LanguageModelResponse> ChatAsync(
        LanguageModelRequest request,
        CancellationToken cancellationToken = default);
}

public interface ILanguageModelHealthProbe
{
    Task<LanguageModelHealthStatus> ProbeAsync(
        CancellationToken cancellationToken = default);
}

public sealed class LanguageModelCircuitOpenException()
    : HttpRequestException("The language model circuit breaker is open.");

public sealed class LanguageModelProtocolException(string code, Exception? innerException = null)
    : Exception(code, innerException)
{
    public string Code { get; } = code;
}
