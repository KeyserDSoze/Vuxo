using Vuxo.Domain.Players;

namespace Vuxo.Application.Players;

public sealed record CreateCharacterCommand(
    string OwnerId,
    string Name,
    int Strength,
    int Dexterity,
    int Intelligence,
    int Constitution,
    int Luck,
    int Faith,
    CharacterAppearance Appearance);
