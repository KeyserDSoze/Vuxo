using System.Text.Json;

namespace Vuxo.Application.AI;

public sealed record LanguageModelSmokeResult(
    bool ToolCallObserved,
    string? Model,
    string? Content,
    IReadOnlyList<LanguageModelToolCall> ToolCalls);

public sealed class LanguageModelSmokeService(ILanguageModelGateway gateway)
{
    public async Task<LanguageModelSmokeResult> RunAsync(CancellationToken cancellationToken = default)
    {
        var parameters = JsonSerializer.SerializeToElement(new
        {
            type = "object",
            properties = new
            {
                worldId = new
                {
                    type = "string",
                    description = "World identifier to inspect."
                }
            },
            required = new[] { "worldId" },
            additionalProperties = false
        });

        var request = new LanguageModelRequest(
            [
                new LanguageModelMessage(
                    "system",
                    "You are the local Vuxo orchestration model. When a tool is appropriate, return a structured tool call instead of inventing data."),
                new LanguageModelMessage(
                    "user",
                    "Call get_world_context with worldId bootstrap. Do not answer from memory and do not invent world data.")
            ],
            [
                new LanguageModelTool(
                    "get_world_context",
                    "Returns the authoritative context for a Vuxo world.",
                    parameters)
            ]);

        var response = await gateway.ChatAsync(request, cancellationToken);
        var toolObserved = response.ToolCalls.Any(call => string.Equals(call.Name, "get_world_context", StringComparison.Ordinal));

        return new LanguageModelSmokeResult(
            toolObserved,
            response.Model,
            response.Content,
            response.ToolCalls);
    }
}
