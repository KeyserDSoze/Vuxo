using Vuxo.Domain.Players;

namespace Vuxo.Application.Worlds.Realtime;

/// <summary>Public versioned cosmetics only; no owner identity, claims or stats.</summary>
public sealed record WorldCharacterAppearance(
    string CatalogVersion,
    string HairStyle,
    string HairColor,
    string Face,
    string BodyType,
    string SkinTone,
    string TopColor,
    string BottomStyle,
    string BottomColor,
    string ShoeStyle,
    string ShoeColor)
{
    public static WorldCharacterAppearance? FromPersisted(CharacterAppearance appearance)
    {
        ArgumentNullException.ThrowIfNull(appearance);
        // A stale or corrupt row is not a valid catalog entry.
        if (CharacterAppearanceCatalog.FindInvalidField(appearance) is not null) return null;
        return new WorldCharacterAppearance(
            CharacterAppearanceCatalog.Version,
            appearance.HairStyle, appearance.HairColor, appearance.Face,
            appearance.BodyType, appearance.SkinTone, appearance.TopColor,
            appearance.BottomStyle, appearance.BottomColor,
            appearance.ShoeStyle, appearance.ShoeColor);
    }
}
