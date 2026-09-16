using Vuxo.Application.Players;
using Vuxo.Domain.Common;
using Vuxo.Domain.Players;

namespace Vuxo.Application.Tests.Players;

public sealed class CharacterServiceTests
{
    [Fact]
    public async Task CreateAsync_WithValidCommand_PersistsCharacterAndDerivedStats()
    {
        var repository = new FakeRepository();
        var unitOfWork = new FakeUnitOfWork();
        var service = new CharacterService(repository, unitOfWork);

        var character = await service.CreateAsync(Command());

        Assert.Same(character, repository.Added);
        Assert.Equal(1, unitOfWork.SaveCalls);
        Assert.Equal("owner-1", character.OwnerId);
        Assert.Equal(0, character.Level);
        Assert.Equal(20, character.Attributes.MaxHealth);
        Assert.Equal(1.3d, character.Attributes.MovementSpeedMultiplier, 10);
    }

    [Fact]
    public async Task CreateAsync_WhenOwnerAlreadyHasCharacter_ReturnsStableErrorAndDoesNotSave()
    {
        var repository = new FakeRepository
        {
            Existing = PlayerCharacter.Create(
                "owner-1",
                "Existing",
                PlayerAttributes.Create(2, 2, 2, 2, 1, 1),
                Appearance())
        };
        var unitOfWork = new FakeUnitOfWork();
        var service = new CharacterService(repository, unitOfWork);

        var exception = await Assert.ThrowsAsync<CharacterCreationException>(() => service.CreateAsync(Command()));

        Assert.Equal(CharacterCreationErrorCodes.AlreadyExists, exception.Code);
        Assert.Null(repository.Added);
        Assert.Equal(0, unitOfWork.SaveCalls);
    }

    [Theory]
    [InlineData(2, 2, 2, 2, 2, 2)]
    [InlineData(0, 0, 0, 0, 0, 0)]
    public async Task CreateAsync_WhenAllocationIsNotTen_ReturnsStableError(
        int strength,
        int dexterity,
        int intelligence,
        int constitution,
        int luck,
        int faith)
    {
        var service = new CharacterService(new FakeRepository(), new FakeUnitOfWork());

        var exception = await Assert.ThrowsAsync<CharacterCreationException>(() => service.CreateAsync(
            Command(
                strength: strength,
                dexterity: dexterity,
                intelligence: intelligence,
                constitution: constitution,
                luck: luck,
                faith: faith)));

        Assert.Equal(CharacterCreationErrorCodes.AttributeAllocationInvalid, exception.Code);
    }

    [Fact]
    public async Task CreateAsync_WhenAttributeIsNegative_ReturnsStableError()
    {
        var service = new CharacterService(new FakeRepository(), new FakeUnitOfWork());

        var exception = await Assert.ThrowsAsync<CharacterCreationException>(() => service.CreateAsync(
            Command(strength: -1, dexterity: 2, intelligence: 2, constitution: 2, luck: 2, faith: 3)));

        Assert.Equal(CharacterCreationErrorCodes.AttributesNegative, exception.Code);
    }

    [Theory]
    [InlineData("", CharacterCreationErrorCodes.NameRequired)]
    [InlineData("  ", CharacterCreationErrorCodes.NameRequired)]
    [InlineData("AB", CharacterCreationErrorCodes.NameLengthInvalid)]
    [InlineData("ABCDEFGHIJKLMNOPQRSTUVWXY", CharacterCreationErrorCodes.NameLengthInvalid)]
    public async Task CreateAsync_WhenNameIsInvalid_ReturnsStableError(string name, string expectedCode)
    {
        var service = new CharacterService(new FakeRepository(), new FakeUnitOfWork());

        var exception = await Assert.ThrowsAsync<CharacterCreationException>(() => service.CreateAsync(Command(name: name)));

        Assert.Equal(expectedCode, exception.Code);
    }

    private static CreateCharacterCommand Command(
        string name = "Vuxian",
        int strength = 2,
        int dexterity = 3,
        int intelligence = 1,
        int constitution = 2,
        int luck = 1,
        int faith = 1) => new(
        "owner-1",
        name,
        strength,
        dexterity,
        intelligence,
        constitution,
        luck,
        faith,
        Appearance());

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

    private sealed class FakeRepository : IPlayerCharacterRepository
    {
        public PlayerCharacter? Existing { get; init; }
        public PlayerCharacter? Added { get; private set; }

        public Task<PlayerCharacter?> GetByOwnerIdAsync(string ownerId, CancellationToken cancellationToken = default)
            => Task.FromResult(Existing);

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
