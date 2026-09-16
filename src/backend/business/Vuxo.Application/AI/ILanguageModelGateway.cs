using System.Text.Json;

namespace Vuxo.Application.AI;

public sealed record LanguageModelMessage(string Role, string Content);

public sealed record LanguageModelTool(
    string Name,
    string Description,
    JsonElement Parameters);

public sealed record LanguageModelToolCall(
    string Name,
    JsonElement Arguments);

public sealed record LanguageModelRequest(
    IReadOnlyList<LanguageModelMessage> Messages,
    IReadOnlyList<LanguageModelTool> Tools);

public sealed record LanguageModelResponse(
    string? Model,
    string? Content,
    IReadOnlyList<LanguageModelToolCall> ToolCalls);

public interface ILanguageModelGateway
{
    bool IsEnabled { get; }

    Task<LanguageModelResponse> ChatAsync(
        LanguageModelRequest request,
        CancellationToken cancellationToken = default);
}
