namespace Vuxo.Api.Contracts.Players;

public sealed record CharacterAppearanceRequest(
    string HairStyle,
    string HairColor,
    string Face,
    string BodyType,
    string SkinTone,
    string TopColor,
    string BottomStyle,
    string BottomColor,
    string ShoeStyle,
    string ShoeColor);

public sealed record CreateCharacterRequest(
    string Name,
    int Strength,
    int Dexterity,
    int Intelligence,
    int Constitution,
    int Luck,
    int Faith,
    CharacterAppearanceRequest? Appearance);
