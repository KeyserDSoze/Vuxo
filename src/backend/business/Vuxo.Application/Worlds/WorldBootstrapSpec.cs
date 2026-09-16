namespace Vuxo.Application.Worlds;

public sealed record WorldBootstrapSpec(string WorldId, long Seed, int GeneratorVersion);
