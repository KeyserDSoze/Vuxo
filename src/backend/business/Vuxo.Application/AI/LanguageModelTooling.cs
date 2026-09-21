using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Vuxo.Application.Events;
using Vuxo.Application.Worlds;
using Vuxo.Domain.Common;
using Vuxo.Domain.Events;

namespace Vuxo.Application.AI;

public static class LanguageModelToolErrorCodes
{
    public const string NotAllowed = "llm_tool_not_allowed";
    public const string ArgumentsInvalid = "llm_tool_arguments_invalid";
    public const string Forbidden = "llm_tool_forbidden";
    public const string MaxRoundsExceeded = "llm_tool_max_rounds_exceeded";
}

public sealed class LanguageModelToolException(string code)
    : Exception(code)
{
    public string Code { get; } = code;
}

public sealed record LanguageModelToolExecutionContext(
    string ActorId,
    bool IsAdministrator,
    Guid CorrelationId,
    Guid? CausationId = null);

public sealed record LanguageModelToolExecutionResult(
    JsonElement ValidatedArguments,
    JsonElement Output,
    string ResultReference);

public interface ILanguageModelToolHandler
{
    string Name { get; }
    LanguageModelTool Definition { get; }

    Task<LanguageModelToolExecutionResult> ExecuteAsync(
        JsonElement arguments,
        LanguageModelToolExecutionContext context,
        CancellationToken cancellationToken = default);
}

public sealed class LanguageModelToolRegistry(IEnumerable<ILanguageModelToolHandler> handlers)
{
    private readonly IReadOnlyDictionary<string, ILanguageModelToolHandler> handlersByName =
        handlers.ToDictionary(handler => handler.Name, StringComparer.Ordinal);

    public IReadOnlyList<LanguageModelTool> Definitions =>
        handlersByName.Values.Select(handler => handler.Definition).ToArray();

    public Task<LanguageModelToolExecutionResult> ExecuteAsync(
        string name,
        JsonElement arguments,
        LanguageModelToolExecutionContext context,
        CancellationToken cancellationToken = default)
    {
        if (!handlersByName.TryGetValue(name, out var handler))
        {
            throw new LanguageModelToolException(LanguageModelToolErrorCodes.NotAllowed);
        }

        return handler.ExecuteAsync(arguments, context, cancellationToken);
    }
}

public sealed class GetWorldContextTool(WorldBootstrapSpec bootstrap) : ILanguageModelToolHandler
{
    public const string ToolName = "get_world_context";

    public string Name => ToolName;

    public LanguageModelTool Definition { get; } = new(
        ToolName,
        "Returns minimal authoritative metadata for the configured Vuxo world.",
        JsonSerializer.SerializeToElement(new
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
        }));

    public Task<LanguageModelToolExecutionResult> ExecuteAsync(
        JsonElement arguments,
        LanguageModelToolExecutionContext context,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (!context.IsAdministrator)
        {
            throw new LanguageModelToolException(LanguageModelToolErrorCodes.Forbidden);
        }

        if (arguments.ValueKind != JsonValueKind.Object)
        {
            throw new LanguageModelToolException(LanguageModelToolErrorCodes.ArgumentsInvalid);
        }

        var properties = arguments.EnumerateObject().ToArray();
        if (properties.Length != 1
            || properties[0].Name != "worldId"
            || properties[0].Value.ValueKind != JsonValueKind.String)
        {
            throw new LanguageModelToolException(LanguageModelToolErrorCodes.ArgumentsInvalid);
        }

        var requestedWorldId = properties[0].Value.GetString();
        if (string.IsNullOrWhiteSpace(requestedWorldId))
        {
            throw new LanguageModelToolException(LanguageModelToolErrorCodes.ArgumentsInvalid);
        }

        if (!string.Equals(requestedWorldId, bootstrap.WorldId, StringComparison.Ordinal))
        {
            throw new LanguageModelToolException(LanguageModelToolErrorCodes.Forbidden);
        }

        var validatedArguments = JsonSerializer.SerializeToElement(new { worldId = bootstrap.WorldId });
        var output = JsonSerializer.SerializeToElement(new
        {
            worldId = bootstrap.WorldId,
            generatorVersion = bootstrap.GeneratorVersion,
            authoritative = true
        });

        return Task.FromResult(new LanguageModelToolExecutionResult(
            validatedArguments,
            output,
            $"world:{bootstrap.WorldId}:generator:{bootstrap.GeneratorVersion}"));
    }
}

public sealed record LanguageModelOrchestrationOptions(int MaxToolRounds)
{
    public static LanguageModelOrchestrationOptions Create(int configuredMaxRounds) =>
        new(Math.Clamp(configuredMaxRounds, 1, 4));
}

public sealed record LanguageModelToolReceipt(
    string ToolName,
    JsonElement ValidatedArguments,
    string ResultReference,
    int Round);

public sealed record LanguageModelOrchestrationResult(
    string? Model,
    string? Content,
    int ToolRounds,
    IReadOnlyList<LanguageModelToolReceipt> ExecutedTools);

public sealed class LanguageModelOrchestrator(
    ILanguageModelGateway gateway,
    LanguageModelToolRegistry registry,
    IGameEventStore eventStore,
    IUnitOfWork unitOfWork,
    TimeProvider timeProvider,
    LanguageModelOrchestrationOptions options)
{
    public async Task<LanguageModelOrchestrationResult> RunAsync(
        IReadOnlyList<LanguageModelMessage> initialMessages,
        LanguageModelToolExecutionContext context,
        CancellationToken cancellationToken = default)
    {
        if (!gateway.IsEnabled)
        {
            throw new InvalidOperationException("The local language model is disabled.");
        }

        if (context.CorrelationId == Guid.Empty)
        {
            throw new ArgumentException("Correlation id is required.", nameof(context));
        }

        var messages = initialMessages.ToList();
        var receipts = new List<LanguageModelToolReceipt>();
        var toolRounds = 0;
        var contextHash = HashContext(initialMessages);

        while (true)
        {
            var response = await gateway.ChatAsync(
                new LanguageModelRequest(messages, registry.Definitions),
                cancellationToken);

            if (response.ToolCalls.Count == 0)
            {
                return new LanguageModelOrchestrationResult(
                    response.Model,
                    response.Content,
                    toolRounds,
                    receipts);
            }

            if (toolRounds >= options.MaxToolRounds)
            {
                throw new LanguageModelToolException(LanguageModelToolErrorCodes.MaxRoundsExceeded);
            }

            toolRounds++;
            messages.Add(new LanguageModelMessage(
                "assistant",
                response.Content,
                response.ToolCalls));

            foreach (var call in response.ToolCalls)
            {
                var startedAt = Stopwatch.GetTimestamp();
                try
                {
                    var execution = await registry.ExecuteAsync(
                        call.Name,
                        call.Arguments,
                        context,
                        cancellationToken);

                    receipts.Add(new LanguageModelToolReceipt(
                        call.Name,
                        execution.ValidatedArguments,
                        execution.ResultReference,
                        toolRounds));

                    messages.Add(new LanguageModelMessage(
                        "tool",
                        execution.Output.GetRawText(),
                        ToolCallId: call.Id,
                        Name: call.Name));

                    await AuditAsync(
                        "llm.tool.executed",
                        context,
                        new
                        {
                            contextHash,
                            model = response.Model,
                            toolName = call.Name,
                            validatedArguments = execution.ValidatedArguments,
                            resultReference = execution.ResultReference,
                            round = toolRounds,
                            durationMs = Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds
                        },
                        cancellationToken);
                }
                catch (LanguageModelToolException exception)
                {
                    await AuditAsync(
                        "llm.tool.rejected",
                        context,
                        new
                        {
                            contextHash,
                            model = response.Model,
                            toolName = call.Name,
                            errorCode = exception.Code,
                            round = toolRounds,
                            durationMs = Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds
                        },
                        cancellationToken);
                    throw;
                }
            }
        }
    }

    private async Task AuditAsync<T>(
        string eventType,
        LanguageModelToolExecutionContext context,
        T data,
        CancellationToken cancellationToken)
    {
        await eventStore.AppendAsync(
            new GameEventEnvelope(
                Guid.NewGuid(),
                eventType,
                GameEventVisibilityScope.Administration,
                string.IsNullOrWhiteSpace(context.ActorId) ? null : context.ActorId,
                context.CorrelationId,
                context.CausationId,
                "llm-tooling-v1",
                timeProvider.GetUtcNow()),
            GameEventPayloadSerializer.Serialize(eventType, data),
            cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private static string HashContext(IEnumerable<LanguageModelMessage> messages)
    {
        var canonical = string.Join(
            "\n",
            messages.Select(message => $"{message.Role}\0{message.Content ?? string.Empty}"));
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(canonical));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
