namespace Vuxo.Application.Worlds.Realtime;

public sealed record WorldSimulationDelta(long Tick, IReadOnlyList<WorldPlayerSnapshot> Players);
