using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Vuxo.Api.Tests.Infrastructure;

namespace Vuxo.Api.Tests.Players;

public sealed class CharacterAppearanceTests
{
    [Fact]
    public async Task AppearanceCatalog_IsPublic_AndExposesStableIds()
    {
        using var factory = new VuxoApiFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/meta/character-appearance");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal("0.0.1", root.GetProperty("catalogVersion").GetString());
        Assert.Contains(root.GetProperty("hairStyles").EnumerateArray(), item => item.GetString() == "hair-1");
        Assert.Contains(root.GetProperty("bottomStyles").EnumerateArray(), item => item.GetString() == "skirt");
        Assert.Contains(root.GetProperty("shoeStyles").EnumerateArray(), item => item.GetString() == "shoe-3");
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
    public async Task CreateCharacter_WhenAppearanceIdIsUnknown_ReturnsStableBadRequest(string field)
    {
        using var factory = new VuxoApiFactory();
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, $"appearance-{field}");

        var appearance = ValidAppearance();
        appearance[field] = "unknown";

        var response = await client.PostAsJsonAsync("/api/characters", new
        {
            name = "Vuxian",
            strength = 2,
            dexterity = 3,
            intelligence = 1,
            constitution = 2,
            luck = 1,
            faith = 1,
            appearance
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("character_appearance_option_invalid", document.RootElement.GetProperty("code").GetString());
        Assert.Equal(field, document.RootElement.GetProperty("field").GetString());
    }

    private static async Task AuthenticateAsync(HttpClient client, string subject)
    {
        var loginResponse = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject,
            displayName = "Appearance Test",
            role = "User"
        });
        loginResponse.EnsureSuccessStatusCode();
        var login = await loginResponse.Content.ReadFromJsonAsync<MockLoginResponse>()
            ?? throw new InvalidOperationException("Mock login response was empty.");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.AccessToken);
    }

    private static Dictionary<string, string> ValidAppearance() => new()
    {
        ["hairStyle"] = "hair-1",
        ["hairColor"] = "black",
        ["face"] = "face-1",
        ["bodyType"] = "body-1",
        ["skinTone"] = "skin-1",
        ["topColor"] = "blue",
        ["bottomStyle"] = "shorts",
        ["bottomColor"] = "black",
        ["shoeStyle"] = "shoe-1",
        ["shoeColor"] = "white"
    };

    private sealed record MockLoginResponse(string AccessToken, string TokenType);
}
