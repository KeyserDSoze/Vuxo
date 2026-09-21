using Vuxo.Application.Worlds;

namespace Vuxo.Application.AI;

public sealed record LanguageModelSmokeResult(
    bool ToolExecuted,
    string? Model,
    string? Content,
    int ToolRounds,
    Guid CorrelationId,
    IReadOnlyList<LanguageModelToolReceipt> ExecutedTools);

public sealed class LanguageModelSmokeService(
    LanguageModelOrchestrator orchestrator,
    WorldBootstrapSpec bootstrap)
{
    public async Task<LanguageModelSmokeResult> RunAsync(
        string actorId,
        bool isAdministrator,
        CancellationToken cancellationToken = default)
    {
        var correlationId = Guid.NewGuid();
        var messages = new LanguageModelMessage[]
        {
            new(
                "system",
                "You are the local Vuxo orchestration model. Tools are proposals only. Use authoritative tool results instead of inventing game state."),
            new(
                "user",
                $"Call {GetWorldContextTool.ToolName} with worldId {bootstrap.WorldId}. Then summarize only the returned authoritative context.")
        };

        var result = await orchestrator.RunAsync(
            messages,
            new LanguageModelToolExecutionContext(
                actorId,
                isAdministrator,
                correlationId),
            cancellationToken);

        return new LanguageModelSmokeResult(
            result.ExecutedTools.Any(tool =>
                string.Equals(tool.ToolName, GetWorldContextTool.ToolName, StringComparison.Ordinal)),
            result.Model,
            result.Content,
            result.ToolRounds,
            correlationId,
            result.ExecutedTools);
    }
}
