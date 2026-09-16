namespace Vuxo.Domain.Worlds;

public readonly record struct WorldTile(
    int LocalX,
    int LocalY,
    long WorldX,
    long WorldY,
    TileKind Kind,
    bool IsWalkable);
