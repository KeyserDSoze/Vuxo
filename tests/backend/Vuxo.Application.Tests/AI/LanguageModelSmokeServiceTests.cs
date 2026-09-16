using System.Text.Json;
using Vuxo.Application.AI;

namespace Vuxo.Application.Tests.AI;

public sealed class LanguageModelSmokeServiceTests
{
    [Theory]
    [InlineData("get_world_context", true)]
    [InlineData("some_other_tool", false)]
    public async Task RunAsync_DetectsExpectedToolCall(string toolName, bool expected)
    {
        var arguments = JsonSerializer.SerializeToElement(new { worldId = "bootstrap" });
        var gateway = new FakeLanguageModelGateway(new LanguageModelResponse(
            "test-model",
            null,
            [new LanguageModelToolCall(toolName, arguments)]));
        var service = new LanguageModelSmokeService(gateway);

        var result = await service.RunAsync();

        Assert.Equal(expected, result.ToolCallObserved);
        Assert.NotNull(gateway.LastRequest);
        Assert.Single(gateway.LastRequest!.Tools);
        Assert.Equal("get_world_context", gateway.LastRequest.Tools[0].Name);
        Assert.Contains("bootstrap", gateway.LastRequest.Messages[1].Content, StringComparison.Ordinal);
    }

    private sealed class FakeLanguageModelGateway(LanguageModelResponse response) : ILanguageModelGateway
    {
        public bool IsEnabled => true;
        public LanguageModelRequest? LastRequest { get; private set; }

        public Task<LanguageModelResponse> ChatAsync(LanguageModelRequest request, CancellationToken cancellationToken = default)
        {
            LastRequest = request;
            return Task.FromResult(response);
        }
    }
}
