using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Vuxo.Application.AI;

namespace Vuxo.Infrastructure.AI;

public sealed record OllamaResilienceOptions(
    int MaxRetries,
    int FailureThreshold,
    TimeSpan BreakDuration,
    TimeSpan RetryDelay)
{
    public static OllamaResilienceOptions Create(
        int maxRetries,
        int failureThreshold,
        int breakSeconds,
        int retryDelayMilliseconds) =>
        new(
            Math.Clamp(maxRetries, 0, 2),
            Math.Clamp(failureThreshold, 1, 10),
            TimeSpan.FromSeconds(Math.Clamp(breakSeconds, 1, 300)),
            TimeSpan.FromMilliseconds(Math.Clamp(retryDelayMilliseconds, 0, 2_000)));
}

public sealed class OllamaLanguageModelGateway : ILanguageModelGateway, ILanguageModelHealthProbe
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient httpClient;
    private readonly string model;
    private readonly OllamaResilienceOptions resilience;
    private readonly TimeProvider timeProvider;
    private readonly object circuitGate = new();
    private int consecutiveFailures;
    private DateTimeOffset? circuitOpenUntil;

    public OllamaLanguageModelGateway(
        HttpClient httpClient,
        string model,
        bool enabled,
        OllamaResilienceOptions? resilience = null,
        TimeProvider? timeProvider = null)
    {
        this.httpClient = httpClient;
        this.model = model;
        IsEnabled = enabled;
        this.resilience = resilience ?? OllamaResilienceOptions.Create(1, 3, 30, 100);
        this.timeProvider = timeProvider ?? TimeProvider.System;
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

        EnsureCircuitClosed();

        for (var attempt = 0; ; attempt++)
        {
            try
            {
                var result = await SendChatAsync(request, cancellationToken);
                RecordSuccess();
                return result;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception) when (IsTransient(exception))
            {
                if (attempt < resilience.MaxRetries)
                {
                    if (resilience.RetryDelay > TimeSpan.Zero)
                    {
                        await Task.Delay(resilience.RetryDelay, cancellationToken);
                    }

                    continue;
                }

                RecordFailure();
                throw;
            }
        }
    }

    public async Task<LanguageModelHealthStatus> ProbeAsync(
        CancellationToken cancellationToken = default)
    {
        if (!IsEnabled)
        {
            return new LanguageModelHealthStatus(false, false, model, "llm_disabled");
        }

        if (IsCircuitOpen())
        {
            return new LanguageModelHealthStatus(true, false, model, "llm_circuit_open");
        }

        try
        {
            using var response = await httpClient.GetAsync("models", cancellationToken);
            return response.IsSuccessStatusCode
                ? new LanguageModelHealthStatus(true, true, model, null)
                : new LanguageModelHealthStatus(true, false, model, "llm_unavailable");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception)
        {
            return new LanguageModelHealthStatus(true, false, model, "llm_unavailable");
        }
    }

    private async Task<LanguageModelResponse> SendChatAsync(
        LanguageModelRequest request,
        CancellationToken cancellationToken)
    {
        var payload = new
        {
            model,
            messages = request.Messages.Select(ToMessagePayload).ToArray(),
            tools = request.Tools.Select(tool => new
            {
                type = "function",
                function = new
                {
                    name = tool.Name,
                    description = tool.Description,
                    parameters = tool.Parameters
                }
            }).ToArray(),
            stream = false
        };

        using var content = JsonContent.Create(payload, options: SerializerOptions);
        using var response = await httpClient.PostAsync("chat/completions", content, cancellationToken);

        if (IsTransientStatus(response.StatusCode))
        {
            throw new HttpRequestException(
                $"Transient language model HTTP status {(int)response.StatusCode}.",
                inner: null,
                response.StatusCode);
        }

        response.EnsureSuccessStatusCode();

        try
        {
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            return ParseResponse(document.RootElement);
        }
        catch (JsonException exception)
        {
            throw new LanguageModelProtocolException("llm_response_invalid", exception);
        }
        catch (InvalidOperationException exception)
        {
            throw new LanguageModelProtocolException("llm_response_invalid", exception);
        }
    }

    private LanguageModelResponse ParseResponse(JsonElement root)
    {
        var returnedModel = root.TryGetProperty("model", out var modelElement)
            ? modelElement.GetString()
            : model;

        if (!root.TryGetProperty("choices", out var choices)
            || choices.ValueKind != JsonValueKind.Array
            || choices.GetArrayLength() == 0)
        {
            return new LanguageModelResponse(returnedModel, null, []);
        }

        var choice = choices[0];
        if (!choice.TryGetProperty("message", out var message)
            || message.ValueKind != JsonValueKind.Object)
        {
            throw new LanguageModelProtocolException("llm_response_invalid");
        }

        var responseContent = message.TryGetProperty("content", out var contentElement)
            && contentElement.ValueKind != JsonValueKind.Null
            ? contentElement.GetString()
            : null;

        var calls = new List<LanguageModelToolCall>();
        if (message.TryGetProperty("tool_calls", out var toolCallsElement))
        {
            if (toolCallsElement.ValueKind != JsonValueKind.Array)
            {
                throw new LanguageModelProtocolException("llm_response_invalid");
            }

            foreach (var toolCall in toolCallsElement.EnumerateArray())
            {
                if (!toolCall.TryGetProperty("function", out var function)
                    || function.ValueKind != JsonValueKind.Object
                    || !function.TryGetProperty("name", out var nameElement))
                {
                    throw new LanguageModelProtocolException("llm_response_invalid");
                }

                var name = nameElement.GetString();
                if (string.IsNullOrWhiteSpace(name)
                    || !function.TryGetProperty("arguments", out var argumentsElement))
                {
                    throw new LanguageModelProtocolException("llm_response_invalid");
                }

                JsonElement arguments;
                if (argumentsElement.ValueKind == JsonValueKind.String)
                {
                    var rawArguments = argumentsElement.GetString();
                    if (string.IsNullOrWhiteSpace(rawArguments))
                    {
                        throw new LanguageModelProtocolException("llm_response_invalid");
                    }

                    using var argumentsDocument = JsonDocument.Parse(rawArguments);
                    arguments = argumentsDocument.RootElement.Clone();
                }
                else if (argumentsElement.ValueKind == JsonValueKind.Object)
                {
                    arguments = argumentsElement.Clone();
                }
                else
                {
                    throw new LanguageModelProtocolException("llm_response_invalid");
                }

                var id = toolCall.TryGetProperty("id", out var idElement)
                    ? idElement.GetString()
                    : null;
                id = string.IsNullOrWhiteSpace(id) ? $"call-{calls.Count + 1}" : id;

                calls.Add(new LanguageModelToolCall(name, arguments, id));
            }
        }

        return new LanguageModelResponse(returnedModel, responseContent, calls);
    }

    private static Dictionary<string, object?> ToMessagePayload(LanguageModelMessage message)
    {
        var payload = new Dictionary<string, object?>
        {
            ["role"] = message.Role,
            ["content"] = message.Content
        };

        if (message.ToolCalls is { Count: > 0 })
        {
            payload["tool_calls"] = message.ToolCalls.Select((call, index) => new
            {
                id = call.Id ?? $"call-{index + 1}",
                type = "function",
                function = new
                {
                    name = call.Name,
                    arguments = call.Arguments.GetRawText()
                }
            }).ToArray();
        }

        if (!string.IsNullOrWhiteSpace(message.ToolCallId))
        {
            payload["tool_call_id"] = message.ToolCallId;
        }

        if (!string.IsNullOrWhiteSpace(message.Name))
        {
            payload["name"] = message.Name;
        }

        return payload;
    }

    private void EnsureCircuitClosed()
    {
        lock (circuitGate)
        {
            if (circuitOpenUntil is not { } openUntil)
            {
                return;
            }

            if (timeProvider.GetUtcNow() < openUntil)
            {
                throw new LanguageModelCircuitOpenException();
            }

            circuitOpenUntil = null;
            consecutiveFailures = 0;
        }
    }

    private bool IsCircuitOpen()
    {
        lock (circuitGate)
        {
            return circuitOpenUntil is { } openUntil
                && timeProvider.GetUtcNow() < openUntil;
        }
    }

    private void RecordSuccess()
    {
        lock (circuitGate)
        {
            consecutiveFailures = 0;
            circuitOpenUntil = null;
        }
    }

    private void RecordFailure()
    {
        lock (circuitGate)
        {
            consecutiveFailures++;
            if (consecutiveFailures >= resilience.FailureThreshold)
            {
                circuitOpenUntil = timeProvider.GetUtcNow().Add(resilience.BreakDuration);
            }
        }
    }

    private static bool IsTransient(Exception exception) =>
        exception switch
        {
            LanguageModelProtocolException => false,
            HttpRequestException httpException => httpException.StatusCode is null
                || IsTransientStatus(httpException.StatusCode.Value),
            OperationCanceledException => true,
            _ => false
        };

    private static bool IsTransientStatus(HttpStatusCode statusCode) =>
        statusCode is HttpStatusCode.RequestTimeout
            or HttpStatusCode.TooManyRequests
        || (int)statusCode >= 500;
}
