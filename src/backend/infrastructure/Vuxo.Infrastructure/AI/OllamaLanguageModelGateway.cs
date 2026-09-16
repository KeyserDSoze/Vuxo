using System.Net.Http.Json;
using System.Text.Json;
using Vuxo.Application.AI;

namespace Vuxo.Infrastructure.AI;

public sealed class OllamaLanguageModelGateway : ILanguageModelGateway
{
    private readonly HttpClient _httpClient;
    private readonly string _model;

    public OllamaLanguageModelGateway(HttpClient httpClient, string model, bool enabled)
    {
        _httpClient = httpClient;
        _model = model;
        IsEnabled = enabled;
    }

    public bool IsEnabled { get; }

    public async Task<LanguageModelResponse> ChatAsync(
        LanguageModelRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!IsEnabled)
        {
            throw new InvalidOperationException("The local language model is disabled.");
        }

        var payload = new
        {
            model = _model,
            messages = request.Messages.Select(message => new
            {
                role = message.Role,
                content = message.Content
            }),
            tools = request.Tools.Select(tool => new
            {
                type = "function",
                function = new
                {
                    name = tool.Name,
                    description = tool.Description,
                    parameters = tool.Parameters
                }
            }),
            stream = false
        };

        using var response = await _httpClient.PostAsJsonAsync("chat/completions", payload, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

        var root = document.RootElement;
        var model = root.TryGetProperty("model", out var modelElement) ? modelElement.GetString() : _model;
        var choices = root.GetProperty("choices");
        if (choices.GetArrayLength() == 0)
        {
            return new LanguageModelResponse(model, null, []);
        }

        var message = choices[0].GetProperty("message");
        var content = message.TryGetProperty("content", out var contentElement) && contentElement.ValueKind != JsonValueKind.Null
            ? contentElement.GetString()
            : null;

        var calls = new List<LanguageModelToolCall>();
        if (message.TryGetProperty("tool_calls", out var toolCallsElement) && toolCallsElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var toolCall in toolCallsElement.EnumerateArray())
            {
                if (!toolCall.TryGetProperty("function", out var function))
                {
                    continue;
                }

                var name = function.GetProperty("name").GetString();
                if (string.IsNullOrWhiteSpace(name))
                {
                    continue;
                }

                var argumentsElement = function.GetProperty("arguments");
                JsonElement arguments;
                if (argumentsElement.ValueKind == JsonValueKind.String)
                {
                    using var argumentsDocument = JsonDocument.Parse(argumentsElement.GetString() ?? "{}");
                    arguments = argumentsDocument.RootElement.Clone();
                }
                else
                {
                    arguments = argumentsElement.Clone();
                }

                calls.Add(new LanguageModelToolCall(name, arguments));
            }
        }

        return new LanguageModelResponse(model, content, calls);
    }
}
