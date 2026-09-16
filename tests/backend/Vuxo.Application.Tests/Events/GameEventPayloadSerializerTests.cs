using System.Text.Json;
using Vuxo.Application.Events;
using Xunit;

namespace Vuxo.Application.Tests.Events;

public sealed class GameEventPayloadSerializerTests
{
    [Fact]
    public void Serialize_ProducesStableVersionedEnvelope()
    {
        var json = GameEventPayloadSerializer.Serialize(
            " exclusive_content.granted ",
            new { grantId = "grant-1", seed = 42 });

        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        Assert.Equal(GameEventPayloadSerializer.CurrentSchemaVersion, root.GetProperty("schemaVersion").GetInt32());
        Assert.Equal("exclusive_content.granted", root.GetProperty("kind").GetString());
        Assert.Equal("grant-1", root.GetProperty("data").GetProperty("grantId").GetString());
        Assert.Equal(42, root.GetProperty("data").GetProperty("seed").GetInt32());
    }

    [Fact]
    public void Serialize_RejectsBlankKind()
    {
        Assert.Throws<ArgumentException>(() => GameEventPayloadSerializer.Serialize(" ", new { }));
    }
}
