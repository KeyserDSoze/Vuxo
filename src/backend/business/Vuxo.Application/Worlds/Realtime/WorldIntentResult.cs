namespace Vuxo.Application.Worlds.Realtime;

public sealed record WorldIntentResult(bool Accepted, string? ErrorCode)
{
    public static WorldIntentResult Success { get; } = new(true, null);

    public static WorldIntentResult Rejected(string errorCode) => new(false, errorCode);
}
