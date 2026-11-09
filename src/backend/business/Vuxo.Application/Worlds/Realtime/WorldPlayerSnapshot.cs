namespace Vuxo.Application.Worlds.Realtime;

public sealed record WorldPlayerSnapshot(
    string PlayerId,
    Guid CharacterId,
    string CharacterName,
    double X,
    double Y,
    double SpeedMultiplier,
    long Revision,
    WorldCharacterAppearance? Appearance = null);
