using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Vuxo.Api.Tests.Infrastructure;
using Vuxo.Application.AI;
using Vuxo.Domain.Common;
using Vuxo.Domain.Events;

namespace Vuxo.Api.Tests.AI;

public sealed class LanguageModelEndpointsTests
{
    [Fact]
    public async Task CoreHealth_RemainsHealthy_WhenLlmIsUnavailable()
    {
        var gateway = new FakeGateway(
            health: new LanguageModelHealthStatus(
                Enabled: true,
                Healthy: false,
                Model: "test-model",
                ErrorCode: "llm_unavailable"));
        await using var factory = CreateFactory(gateway, new FakeEventStore());
        using var client = factory.CreateClient();

        var core = await client.GetAsync("/health");
        var llm = await client.GetAsync("/health/llm");

        Assert.Equal(HttpStatusCode.OK, core.StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, llm.StatusCode);
        var payload = await llm.Content.ReadFromJsonAsync<HealthResponse>();
        Assert.True(payload?.Enabled);
        Assert.False(payload?.Healthy);
        Assert.Equal("llm_unavailable", payload?.ErrorCode);
    }

    [Fact]
    public async Task LlmHealth_Disabled_IsReportedSeparatelyWithoutFailingCoreHealth()
    {
        var gateway = new FakeGateway(
            enabled: false,
            health: new LanguageModelHealthStatus(
                Enabled: false,
                Healthy: false,
                Model: "test-model",
                ErrorCode: "llm_disabled"));
        await using var factory = CreateFactory(gateway, new FakeEventStore());
        using var client = factory.CreateClient();

        var core = await client.GetAsync("/health");
        var llm = await client.GetAsync("/health/llm");

        Assert.Equal(HttpStatusCode.OK, core.StatusCode);
        Assert.Equal(HttpStatusCode.OK, llm.StatusCode);
        var payload = await llm.Content.ReadFromJsonAsync<HealthResponse>();
        Assert.False(payload?.Enabled);
        Assert.False(payload?.Healthy);
        Assert.Equal("llm_disabled", payload?.ErrorCode);
    }

    [Fact]
    public async Task AdminToolSmoke_ExecutesServerSideTool_AndWritesRedactedAudit()
    {
        var arguments = JsonSerializer.SerializeToElement(new { worldId = "vuxo-test-world" });
        var gateway = new FakeGateway(
            responses:
            [
                new LanguageModelResponse(
                    "test-model",
                    null,
                    [new LanguageModelToolCall(GetWorldContextTool.ToolName, arguments, "call-1")]),
                new LanguageModelResponse(
                    "test-model",
                    "Authoritative world context received.",
                    [])
            ]);
        var events = new FakeEventStore();
        await using var factory = CreateFactory(gateway, events);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "llm-admin", "Administrator");

        var response = await client.GetAsync("/api/admin/llm/tool-smoke");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<SmokeResponse>();
        Assert.True(payload?.ToolExecuted);
        Assert.Equal(1, payload?.ToolRounds);
        Assert.Equal("Authoritative world context received.", payload?.Content);
        Assert.Single(payload?.ExecutedTools ?? []);

        var audit = Assert.Single(events.Appended);
        Assert.Equal("llm.tool.executed", audit.Envelope.EventType);
        Assert.Equal(GameEventVisibilityScope.Administration, audit.Envelope.VisibilityScope);
        Assert.Equal("llm-admin", audit.Envelope.PlayerId);
        Assert.Contains("contextHash", audit.PayloadJson, StringComparison.Ordinal);
        Assert.Contains("vuxo-test-world", audit.PayloadJson, StringComparison.Ordinal);
        Assert.DoesNotContain("Call get_world_context", audit.PayloadJson, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("User")]
    [InlineData("GameMaster")]
    public async Task ToolSmoke_RemainsAdministratorOnly(string role)
    {
        var gateway = new FakeGateway();
        await using var factory = CreateFactory(gateway, new FakeEventStore());
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, $"llm-{role}", role);

        var response = await client.GetAsync("/api/admin/llm/tool-smoke");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private static VuxoApiFactory CreateFactory(
        FakeGateway gateway,
        FakeEventStore events) =>
        new(
            configureServices: services =>
            {
                services.RemoveAll<ILanguageModelGateway>();
                services.RemoveAll<ILanguageModelHealthProbe>();
                services.RemoveAll<IGameEventStore>();
                services.RemoveAll<IUnitOfWork>();

                services.AddSingleton<ILanguageModelGateway>(gateway);
                services.AddSingleton<ILanguageModelHealthProbe>(gateway);
                services.AddSingleton<IGameEventStore>(events);
                services.AddSingleton<IUnitOfWork, FakeUnitOfWork>();
            });

    private static async Task AuthenticateAsync(
        HttpClient client,
        string subject,
        string role)
    {
        var loginResponse = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject,
            displayName = subject,
            role
        });
        loginResponse.EnsureSuccessStatusCode();
        var login = await loginResponse.Content.ReadFromJsonAsync<MockLoginResponse>()
            ?? throw new InvalidOperationException("Mock login response was empty.");
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", login.AccessToken);
    }

    private sealed class FakeGateway : ILanguageModelGateway, ILanguageModelHealthProbe
    {
        private readonly Queue<LanguageModelResponse> responses;
        private readonly LanguageModelHealthStatus health;

        public FakeGateway(
            bool enabled = true,
            LanguageModelHealthStatus? health = null,
            params LanguageModelResponse[] responses)
        {
            IsEnabled = enabled;
            this.health = health ?? new LanguageModelHealthStatus(
                enabled,
                enabled,
                "test-model",
                enabled ? null : "llm_disabled");
            this.responses = new Queue<LanguageModelResponse>(responses);
        }

        public bool IsEnabled { get; }

        public Task<LanguageModelResponse> ChatAsync(
            LanguageModelRequest request,
            CancellationToken cancellationToken = default)
        {
            if (responses.Count == 0)
            {
                return Task.FromResult(new LanguageModelResponse(
                    "test-model",
                    "No tool call.",
                    []));
            }

            return Task.FromResult(responses.Dequeue());
        }

        public Task<LanguageModelHealthStatus> ProbeAsync(
            CancellationToken cancellationToken = default) =>
            Task.FromResult(health);
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
    }

    private sealed class FakeUnitOfWork : IUnitOfWork
    {
        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(1);
    }

    private sealed record MockLoginResponse(string AccessToken, string TokenType);

    private sealed record HealthResponse(
        bool Enabled,
        bool Healthy,
        string? Model,
        string? ErrorCode);

    private sealed record SmokeResponse(
        bool ToolExecuted,
        string? Model,
        string? Content,
        int ToolRounds,
        Guid CorrelationId,
        IReadOnlyList<SmokeToolReceipt> ExecutedTools);

    private sealed record SmokeToolReceipt(
        string ToolName,
        JsonElement ValidatedArguments,
        string ResultReference,
        int Round);
}
