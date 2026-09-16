using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Vuxo.Api.Tests.Infrastructure;
using Vuxo.Domain.Common;
using Vuxo.Domain.Players;

namespace Vuxo.Api.Tests.Players;

public sealed class CharacterCreationTests
{
    [Fact]
    public async Task CreateCharacter_RequiresAuthentication()
    {
        using var factory = CreateFactory(out _, out _);
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/characters", ValidRequest());

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CreateCharacter_UsesAuthenticatedOwner_AndReturnsDerivedStats()
    {
        using var factory = CreateFactory(out var repository, out var unitOfWork);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a");

        var response = await client.PostAsJsonAsync("/api/characters", ValidRequest());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(repository.Added);
        Assert.Equal("player-a", repository.Added.OwnerId);
        Assert.Equal(1, unitOfWork.SaveCalls);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(0, root.GetProperty("level").GetInt32());
        Assert.Equal(20, root.GetProperty("maxHealth").GetInt32());
        Assert.Equal(1.3d, root.GetProperty("movementSpeedMultiplier").GetDouble(), 10);
        Assert.Equal(3, root.GetProperty("attributes").GetProperty("dexterity").GetInt32());
        Assert.Equal(2, root.GetProperty("attributes").GetProperty("constitution").GetInt32());
    }

    [Fact]
    public async Task CreateCharacter_WhenOwnerAlreadyHasCharacter_ReturnsConflict()
    {
        var existing = PlayerCharacter.Create(
            "player-a",
            "Existing",
            PlayerAttributes.Create(2, 2, 2, 2, 1, 1),
            Appearance());
        using var factory = CreateFactory(out _, out _, existing);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a");

        var response = await client.PostAsJsonAsync("/api/characters", ValidRequest());

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("character_already_exists", await ReadCodeAsync(response));
    }

    [Theory]
    [InlineData("AB", 2, 3, 1, 2, 1, 1, "character_name_length_invalid")]
    [InlineData("Vuxian", 2, 2, 2, 2, 2, 2, "character_attribute_allocation_invalid")]
    [InlineData("Vuxian", -1, 2, 2, 2, 2, 3, "character_attributes_negative")]
    public async Task CreateCharacter_WhenRulesAreInvalid_ReturnsBadRequestWithStableCode(
        string name,
        int strength,
        int dexterity,
        int intelligence,
        int constitution,
        int luck,
        int faith,
        string expectedCode)
    {
        using var factory = CreateFactory(out _, out _);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a");

        var response = await client.PostAsJsonAsync("/api/characters", new
        {
            name,
            strength,
            dexterity,
            intelligence,
            constitution,
            luck,
            faith,
            appearance = AppearanceRequest()
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(expectedCode, await ReadCodeAsync(response));
    }

    [Fact]
    public async Task CreateCharacter_WhenAppearanceIsMissing_ReturnsBadRequest()
    {
        using var factory = CreateFactory(out _, out _);
        using var client = factory.CreateClient();
        await AuthenticateAsync(client, "player-a");

        var response = await client.PostAsJsonAsync("/api/characters", new
        {
            name = "Vuxian",
            strength = 2,
            dexterity = 3,
            intelligence = 1,
            constitution = 2,
            luck = 1,
            faith = 1
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("character_appearance_required", await ReadCodeAsync(response));
    }

    private static VuxoApiFactory CreateFactory(
        out FakeRepository repository,
        out FakeUnitOfWork unitOfWork,
        PlayerCharacter? existing = null)
    {
        repository = new FakeRepository(existing);
        unitOfWork = new FakeUnitOfWork();
        var repositoryInstance = repository;
        var unitOfWorkInstance = unitOfWork;

        return new VuxoApiFactory(configureServices: services =>
        {
            services.RemoveAll<IPlayerCharacterRepository>();
            services.RemoveAll<IUnitOfWork>();
            services.AddSingleton<IPlayerCharacterRepository>(repositoryInstance);
            services.AddSingleton<IUnitOfWork>(unitOfWorkInstance);
        });
    }

    private static async Task AuthenticateAsync(HttpClient client, string subject)
    {
        var response = await client.PostAsJsonAsync("/api/auth/mock", new
        {
            subject,
            displayName = "Test Player",
            role = "User"
        });
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<MockLoginResponse>()
            ?? throw new InvalidOperationException("Mock login response was empty.");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", payload.AccessToken);
    }

    private static async Task<string?> ReadCodeAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        return payload?.Code;
    }

    private static object ValidRequest() => new
    {
        name = "Vuxian",
        strength = 2,
        dexterity = 3,
        intelligence = 1,
        constitution = 2,
        luck = 1,
        faith = 1,
        appearance = AppearanceRequest()
    };

    private static object AppearanceRequest() => new
    {
        hairStyle = "hair-1",
        hairColor = "black",
        face = "face-1",
        bodyType = "body-1",
        skinTone = "skin-1",
        topColor = "blue",
        bottomStyle = "shorts",
        bottomColor = "black",
        shoeStyle = "shoe-1",
        shoeColor = "white"
    };

    private static CharacterAppearance Appearance() => new(
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

    private sealed record MockLoginResponse(string AccessToken, string TokenType);
    private sealed record ErrorResponse(string Code);

    private sealed class FakeRepository(PlayerCharacter? existing) : IPlayerCharacterRepository
    {
        public PlayerCharacter? Added { get; private set; }

        public Task<PlayerCharacter?> GetByOwnerIdAsync(string ownerId, CancellationToken cancellationToken = default)
            => Task.FromResult(existing?.OwnerId == ownerId ? existing : null);

        public Task AddAsync(PlayerCharacter character, CancellationToken cancellationToken = default)
        {
            Added = character;
            return Task.CompletedTask;
        }
    }

    private sealed class FakeUnitOfWork : IUnitOfWork
    {
        public int SaveCalls { get; private set; }

        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            SaveCalls++;
            return Task.FromResult(1);
        }
    }
}
