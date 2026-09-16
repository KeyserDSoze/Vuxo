namespace Vuxo.Application.Worlds.Realtime;

public interface IWorldWalkabilityMap
{
    ValueTask<bool> IsWalkableAsync(double worldX, double worldY, CancellationToken cancellationToken = default);
}
