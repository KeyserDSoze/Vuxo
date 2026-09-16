namespace Vuxo.Application.Worlds.Realtime;

public sealed record WorldJoinResult(
    WorldPlayerSnapshot Self,
    IReadOnlyList<WorldPlayerSnapshot> Players,
    bool IsReconnect,
    string? ReplacedConnectionId);
