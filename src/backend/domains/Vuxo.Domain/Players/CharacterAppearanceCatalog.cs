namespace Vuxo.Domain.Players;

public static class CharacterAppearanceCatalog
{
    public const string Version = "0.0.1";

    public static IReadOnlyList<string> HairStyles { get; } = Array.AsReadOnly(["hair-1", "hair-2", "hair-3", "hair-4"]);
    public static IReadOnlyList<string> HairColors { get; } = Array.AsReadOnly(["black", "brown", "blonde", "red", "blue"]);
    public static IReadOnlyList<string> Faces { get; } = Array.AsReadOnly(["face-1", "face-2", "face-3"]);
    public static IReadOnlyList<string> BodyTypes { get; } = Array.AsReadOnly(["body-1", "body-2", "body-3"]);
    public static IReadOnlyList<string> SkinTones { get; } = Array.AsReadOnly(["skin-1", "skin-2", "skin-3", "skin-4", "skin-5"]);
    public static IReadOnlyList<string> TopColors { get; } = Array.AsReadOnly(["blue", "red", "green", "black", "white"]);
    public static IReadOnlyList<string> BottomStyles { get; } = Array.AsReadOnly(["shorts", "skirt"]);
    public static IReadOnlyList<string> BottomColors { get; } = Array.AsReadOnly(["black", "blue", "red", "green", "white"]);
    public static IReadOnlyList<string> ShoeStyles { get; } = Array.AsReadOnly(["shoe-1", "shoe-2", "shoe-3"]);
    public static IReadOnlyList<string> ShoeColors { get; } = Array.AsReadOnly(["white", "black", "brown", "red", "blue"]);

    public static string? FindInvalidField(CharacterAppearance appearance)
    {
        ArgumentNullException.ThrowIfNull(appearance);

        if (!Contains(HairStyles, appearance.HairStyle)) return "hairStyle";
        if (!Contains(HairColors, appearance.HairColor)) return "hairColor";
        if (!Contains(Faces, appearance.Face)) return "face";
        if (!Contains(BodyTypes, appearance.BodyType)) return "bodyType";
        if (!Contains(SkinTones, appearance.SkinTone)) return "skinTone";
        if (!Contains(TopColors, appearance.TopColor)) return "topColor";
        if (!Contains(BottomStyles, appearance.BottomStyle)) return "bottomStyle";
        if (!Contains(BottomColors, appearance.BottomColor)) return "bottomColor";
        if (!Contains(ShoeStyles, appearance.ShoeStyle)) return "shoeStyle";
        if (!Contains(ShoeColors, appearance.ShoeColor)) return "shoeColor";

        return null;
    }

    private static bool Contains(IReadOnlyList<string> values, string? value)
        => value is not null && values.Contains(value, StringComparer.Ordinal);
}
