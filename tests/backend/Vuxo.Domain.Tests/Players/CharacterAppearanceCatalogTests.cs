using Vuxo.Domain.Players;

namespace Vuxo.Domain.Tests.Players;

public sealed class CharacterAppearanceCatalogTests
{
    [Fact]
    public void FindInvalidField_WithCatalogValues_ReturnsNull()
    {
        var appearance = ValidAppearance();

        Assert.Null(CharacterAppearanceCatalog.FindInvalidField(appearance));
    }

    [Theory]
    [InlineData("hairStyle")]
    [InlineData("hairColor")]
    [InlineData("face")]
    [InlineData("bodyType")]
    [InlineData("skinTone")]
    [InlineData("topColor")]
    [InlineData("bottomStyle")]
    [InlineData("bottomColor")]
    [InlineData("shoeStyle")]
    [InlineData("shoeColor")]
    public void FindInvalidField_WhenOneIdIsUnknown_ReturnsStableField(string field)
    {
        var valid = ValidAppearance();
        var appearance = field switch
        {
            "hairStyle" => valid with { HairStyle = "unknown" },
            "hairColor" => valid with { HairColor = "unknown" },
            "face" => valid with { Face = "unknown" },
            "bodyType" => valid with { BodyType = "unknown" },
            "skinTone" => valid with { SkinTone = "unknown" },
            "topColor" => valid with { TopColor = "unknown" },
            "bottomStyle" => valid with { BottomStyle = "unknown" },
            "bottomColor" => valid with { BottomColor = "unknown" },
            "shoeStyle" => valid with { ShoeStyle = "unknown" },
            "shoeColor" => valid with { ShoeColor = "unknown" },
            _ => throw new ArgumentOutOfRangeException(nameof(field))
        };

        Assert.Equal(field, CharacterAppearanceCatalog.FindInvalidField(appearance));
    }

    private static CharacterAppearance ValidAppearance() => new(
        "hair-1",
        "black",
        "face-1",
        "body-1",
        "skin-1",
        "blue",
        "shorts",
        "black",
        "shoe-1",
        "white");
}
