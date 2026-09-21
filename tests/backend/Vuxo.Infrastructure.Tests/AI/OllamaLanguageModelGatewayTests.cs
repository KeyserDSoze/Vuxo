using System.Net;
using System.Text;
using System.Text.Json;
using Vuxo.Application.AI;
using Vuxo.Infrastructure.AI;
using Xunit;

namespace Vuxo.Infrastructure.Tests.AI;

public sealed class OllamaLanguageModelGatewayTests
{
    [Fact]
    public async Task ChatAsync_ParsesOpenAiCompatibleToolCall()
    {
        var handler = new SequenceHandler(
            JsonResponse(HttpStatusCode.OK, """
            {
              "model": "qwen-test",
              "choices": [{
                "message": {
                  "content": null,
                  "tool_calls": [{
                    "id": "call-1",
                    "type": "function",
                    "function": {
                      "name": "get_world_context",
                      "arguments": "{\"worldId\":\"vuxo-prime\"}"
                    }
                  }]
                }
              }]
            }
            """));
        var gateway = CreateGateway(handler);

        var response = await gateway.ChatAsync(Request());

        Assert.Equal("qwen-test", response.Model);
        var call = Assert.Single(response.ToolCalls);
        Assert.Equal("call-1", call.Id);
        Assert.Equal("get_world_context", call.Name);
        Assert.Equal("vuxo-prime", call.Arguments.GetProperty("worldId").GetString());

        var body = Assert.Single(handler.Bodies);
        Assert.Contains("\"tools\"", body, StringComparison.Ordinal);
        Assert.Contains("\"get_world_context\"", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ChatAsync_RetriesTransientFailureOnce_ThenSucceeds()
    {
        var handler = new SequenceHandler(
            JsonResponse(HttpStatusCode.ServiceUnavailable, "{}"),
            JsonResponse(HttpStatusCode.OK, """
            {
              "model": "qwen-test",
              "choices": [{ "message": { "content": "ok" } }]
            }
            """));
        var gateway = CreateGateway(
            handler,
            OllamaResilienceOptions.Create(
                maxRetries: 1,
                failureThreshold: 3,
                breakSeconds: 30,
                retryDelayMilliseconds: 0));

        var response = await gateway.ChatAsync(Request());

        Assert.Equal("ok", response.Content);
        Assert.Equal(2, handler.RequestCount);
    }

    [Fact]
    public async Task ChatAsync_MalformedToolArguments_ThrowsStableProtocolError()
    {
        var handler = new SequenceHandler(
            JsonResponse(HttpStatusCode.OK, """
            {
              "model": "qwen-test",
              "choices": [{
                "message": {
                  "content": null,
                  "tool_calls": [{
                    "id": "call-1",
                    "type": "function",
                    "function": {
                      "name": "get_world_context",
                      "arguments": "{not-json"
                    }
                  }]
                }
              }]
            }
            """));
        var gateway = CreateGateway(handler);

        var exception = await Assert.ThrowsAsync<LanguageModelProtocolException>(
            () => gateway.ChatAsync(Request()));

        Assert.Equal("llm_response_invalid", exception.Code);
    }

    [Fact]
    public async Task ChatAsync_OpensCircuitAfterConfiguredConsecutiveFailures()
    {
        var handler = new SequenceHandler(
            JsonResponse(HttpStatusCode.ServiceUnavailable, "{}"),
            JsonResponse(HttpStatusCode.ServiceUnavailable, "{}"));
        var gateway = CreateGateway(
            handler,
            OllamaResilienceOptions.Create(
                maxRetries: 0,
                failureThreshold: 2,
                breakSeconds: 30,
                retryDelayMilliseconds: 0));

        await Assert.ThrowsAsync<HttpRequestException>(() => gateway.ChatAsync(Request()));
        await Assert.ThrowsAsync<HttpRequestException>(() => gateway.ChatAsync(Request()));
        await Assert.ThrowsAsync<LanguageModelCircuitOpenException>(() => gateway.ChatAsync(Request()));

        Assert.Equal(2, handler.RequestCount);

        var health = await gateway.ProbeAsync();
        Assert.True(health.Enabled);
        Assert.False(health.Healthy);
        Assert.Equal("llm_circuit_open", health.ErrorCode);
    }

    [Fact]
    public async Task ChatAsync_CallerCancellation_IsNotRetried()
    {
        var handler = new CancellingHandler();
        var gateway = CreateGateway(
            handler,
            OllamaResilienceOptions.Create(
                maxRetries: 2,
                failureThreshold: 3,
                breakSeconds: 30,
                retryDelayMilliseconds: 0));
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => gateway.ChatAsync(Request(), cancellation.Token));

        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task ProbeAsync_DisabledGateway_DoesNotCallProvider()
    {
        var handler = new SequenceHandler();
        using var client = new HttpClient(handler) { BaseAddress = new Uri("http://ollama.test/v1/") };
        var gateway = new OllamaLanguageModelGateway(client, "qwen-test", enabled: false);

        var health = await gateway.ProbeAsync();

        Assert.False(health.Enabled);
        Assert.False(health.Healthy);
        Assert.Equal("llm_disabled", health.ErrorCode);
        Assert.Equal(0, handler.RequestCount);
    }

    private static OllamaLanguageModelGateway CreateGateway(
        HttpMessageHandler handler,
        OllamaResilienceOptions? resilience = null)
    {
        var client = new HttpClient(handler)
        {
            BaseAddress = new Uri("http://ollama.test/v1/"),
            Timeout = TimeSpan.FromSeconds(5)
        };

        return new OllamaLanguageModelGateway(
            client,
            "qwen-test",
            enabled: true,
            resilience ?? OllamaResilienceOptions.Create(0, 3, 30, 0));
    }

    private static LanguageModelRequest Request() =>
        new(
            [new LanguageModelMessage("user", "inspect world")],
            [
                new LanguageModelTool(
                    "get_world_context",
                    "context",
                    JsonSerializer.SerializeToElement(new
                    {
                        type = "object",
                        properties = new { worldId = new { type = "string" } }
                    }))
            ]);

    private static HttpResponseMessage JsonResponse(HttpStatusCode statusCode, string json) =>
        new(statusCode)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };

    private sealed class CancellingHandler : HttpMessageHandler
    {
        public int RequestCount { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            RequestCount++;
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromException<HttpResponseMessage>(new OperationCanceledException(cancellationToken));
        }
    }

    private sealed class SequenceHandler(params HttpResponseMessage[] responses) : HttpMessageHandler
    {
        private readonly Queue<HttpResponseMessage> responses = new(responses);

        public int RequestCount { get; private set; }
        public List<string> Bodies { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            RequestCount++;
            if (request.Content is not null)
            {
                Bodies.Add(await request.Content.ReadAsStringAsync(cancellationToken));
            }

            if (responses.Count == 0)
            {
                throw new HttpRequestException("No fake response configured.");
            }

            return responses.Dequeue();
        }
    }
}
