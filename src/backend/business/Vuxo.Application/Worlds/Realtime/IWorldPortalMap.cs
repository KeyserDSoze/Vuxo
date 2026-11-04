namespace Vuxo.Application.Worlds.Realtime;

/// <summary>Read-only world placement map. The API runtime implementation caches chunks.</summary>
public interface IWorldPortalMap : IWorldWalkabilityMap
{
    Task<WorldSpawnPoint> GetSpawnPointAsync(CancellationToken cancellationToken = default);
}
