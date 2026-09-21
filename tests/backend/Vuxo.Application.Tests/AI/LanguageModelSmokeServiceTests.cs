using System.Text.Json;
using Vuxo.Application.AI;
using Vuxo.Application.Worlds;
using Vuxo.Domain.Common;
using Vuxo.Domain.Events;

namespace Vuxo.Application.Tests.AI;

public sealed class LanguageModelSmokeServiceTests
{
    private static readonly WorldBootstrapSpec Bootstrap = new("vuxo-prime", 42, 7);

    [Fact]
    public async Task RunAsync_ExecutesAllowedTool_AndReturnsFinalModelResponse()
    {
        var arguments = JsonSerializer.SerializeToElement(new { worldId = Bootstrap.WorldId });
        var gateway = new SequenceGateway(
            new LanguageModelResponse(
                "test-model",
                null,
                [new LanguageModelToolCall(GetWorldContextTool.ToolName, arguments, "call-1")]),
            new LanguageModelResponse("test-model", "World context received.", []));
        var events = new FakeEventStore();
        var unitOfWork = new FakeUnitOfWork();
        var orchestrator = CreateOrchestrator(gateway, events, unitOfWork, maxRounds: 2);
        var smoke = new LanguageModelSmokeService(orchestrator, Bootstrap);

        var result = await smoke.RunAsync("admin-a", isAdministrator: true);

        Assert.True(result.ToolExecuted);
        Assert.Equal("World context received.", result.Content);
        Assert.Equal(1, result.ToolRounds);
        var receipt = Assert.Single(result.ExecutedTools);
        Assert.Equal(GetWorldContextTool.ToolName, receipt.ToolName);
        Assert.Equal($"world:{Bootstrap.WorldId}:generator:{Bootstrap.GeneratorVersion}", receipt.ResultReference);
        Assert.Equal(2, gateway.Requests.Count);
        Assert.Contains(gateway.Requests[1].Messages, message =>
            message.Role == "tool"
            && message.ToolCallId == "call-1"
            && message.Content is not null
            && message.Content.Contains(Bootstrap.WorldId, StringComparison.Ordinal));

        var audit = Assert.Single(events.Appended);
        Assert.Equal("llm.tool.executed", audit.Envelope.EventType);
        Assert.Equal(GameEventVisibilityScope.Administration, audit.Envelope.VisibilityScope);
        Assert.Equal("admin-a", audit.Envelope.PlayerId);
        Assert.Contains("contextHash", audit.PayloadJson, StringComparison.Ordinal);
        Assert.Contains(GetWorldContextTool.ToolName, audit.PayloadJson, StringComparison.Ordinal);
        Assert.DoesNotContain("Call get_world_context", audit.PayloadJson, StringComparison.Ordinal);
        Assert.Equal(1, unitOfWork.SaveCalls);
    }

    [Fact]
    public async Task Orchestrator_RejectsToolOutsideAllowList_AndAuditsWithoutArguments()
    {
        var arguments = JsonSerializer.SerializeToElement(new { secret = "must-not-leak" });
        var gateway = new SequenceGateway(new LanguageModelResponse(
            "test-model",
            null,
            [new LanguageModelToolCall("read_filesystem", arguments, "call-bad")]));
        var events = new FakeEventStore();
        var orchestrator = CreateOrchestrator(gateway, events, new FakeUnitOfWork(), maxRounds: 1);

        var exception = await Assert.ThrowsAsync<LanguageModelToolException>(() =>
            orchestrator.RunAsync(
                [new LanguageModelMessage("user", "inspect")],
                Context(isAdministrator: true)));

        Assert.Equal(LanguageModelToolErrorCodes.NotAllowed, exception.Code);
        var audit = Assert.Single(events.Appended);
        Assert.Equal("llm.tool.rejected", audit.Envelope.EventType);
        Assert.Contains(LanguageModelToolErrorCodes.NotAllowed, audit.PayloadJson, StringComparison.Ordinal);
        Assert.DoesNotContain("must-not-leak", audit.PayloadJson, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Orchestrator_RejectsInvalidArguments()
    {
        var gateway = new SequenceGateway(new LanguageModelResponse(
            "test-model",
            null,
            [new LanguageModelToolCall(
                GetWorldContextTool.ToolName,
                JsonSerializer.SerializeToElement(new { worldId = Bootstrap.WorldId, extra = true }),
                "call-invalid")]));
        var events = new FakeEventStore();
        var orchestrator = CreateOrchestrator(gateway, events, new FakeUnitOfWork(), maxRounds: 1);

        var exception = await Assert.ThrowsAsync<LanguageModelToolException>(() =>
            orchestrator.RunAsync(
                [new LanguageModelMessage("user", "inspect")],
                Context(isAdministrator: true)));

        Assert.Equal(LanguageModelToolErrorCodes.ArgumentsInvalid, exception.Code);
        Assert.Equal("llm.tool.rejected", Assert.Single(events.Appended).Envelope.EventType);
    }

    [Fact]
    public async Task Orchestrator_RejectsUnauthorizedToolExecution()
    {
        var gateway = new SequenceGateway(new LanguageModelResponse(
            "test-model",
            null,
            [new LanguageModelToolCall(
                GetWorldContextTool.ToolName,
                JsonSerializer.SerializeToElement(new { worldId = Bootstrap.WorldId }),
                "call-forbidden")]));
        var orchestrator = CreateOrchestrator(
            gateway,
            new FakeEventStore(),
            new FakeUnitOfWork(),
            maxRounds: 1);

        var exception = await Assert.ThrowsAsync<LanguageModelToolException>(() =>
            orchestrator.RunAsync(
                [new LanguageModelMessage("user", "inspect")],
                Context(isAdministrator: false)));

        Assert.Equal(LanguageModelToolErrorCodes.Forbidden, exception.Code);
    }

    [Fact]
    public async Task Orchestrator_StopsWhenConfiguredToolRoundLimitIsExceeded()
    {
        var arguments = JsonSerializer.SerializeToElement(new { worldId = Bootstrap.WorldId });
        var gateway = new SequenceGateway(
            new LanguageModelResponse(
                "test-model",
                null,
                [new LanguageModelToolCall(GetWorldContextTool.ToolName, arguments, "call-1")]),
            new LanguageModelResponse(
                "test-model",
                null,
                [new LanguageModelToolCall(GetWorldContextTool.ToolName, arguments, "call-2")]));
        var orchestrator = CreateOrchestrator(
            gateway,
            new FakeEventStore(),
            new FakeUnitOfWork(),
            maxRounds: 1);

        var exception = await Assert.ThrowsAsync<LanguageModelToolException>(() =>
            orchestrator.RunAsync(
                [new LanguageModelMessage("user", "inspect")],
                Context(isAdministrator: true)));

        Assert.Equal(LanguageModelToolErrorCodes.MaxRoundsExceeded, exception.Code);
        Assert.Equal(2, gateway.Requests.Count);
    }

    private static LanguageModelOrchestrator CreateOrchestrator(
        ILanguageModelGateway gateway,
        IGameEventStore events,
        IUnitOfWork unitOfWork,
        int maxRounds)
    {
        var registry = new LanguageModelToolRegistry([new GetWorldContextTool(Bootstrap)]);
        return new LanguageModelOrchestrator(
            gateway,
            registry,
            events,
            unitOfWork,
            TimeProvider.System,
            LanguageModelOrchestrationOptions.Create(maxRounds));
    }

    private static LanguageModelToolExecutionContext Context(bool isAdministrator) =>
        new("admin-a", isAdministrator, Guid.NewGuid());

    private sealed class SequenceGateway(params LanguageModelResponse[] responses) : ILanguageModelGateway
    {
        private readonly Queue<LanguageModelResponse> responses = new(responses);

        public bool IsEnabled => true;
        public List<LanguageModelRequest> Requests { get; } = [];

        public Task<LanguageModelResponse> ChatAsync(
            LanguageModelRequest request,
            CancellationToken cancellationToken = default)
        {
            Requests.Add(request);
            if (responses.Count == 0)
            {
                throw new InvalidOperationException("No fake LLM response remains.");
            }

            return Task.FromResult(responses.Dequeue());
        }
    }

    private sealed class FakeEventStore : IGameEventStore
    {
        public List<(GameEventEnvelope Envelope, string PayloadJson)> Appended { get; } = [];

        public Task AppendAsync(
            GameEventEnvelope envelope,
            string payloadJson,
            CancellationToken cancellationToken = default)
        {
            Appended.Add((envelope, payloadJson));
            return Task.CompletedTask;
        }

        public Task<GameEventPage> QueryAsync(
            GameEventQuery query,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(new GameEventPage([], 0, query.Offset, query.Limit));

        public Task<GameEventRecord?> GetByIdAsync(
            Guid eventId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<GameEventRecord?>(null);
    }

    private sealed class FakeUnitOfWork : IUnitOfWork
    {
        public int SaveCalls { get; private set; }

        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            SaveCalls++;
            return Task.FromResult(1);
        }
    }
}
