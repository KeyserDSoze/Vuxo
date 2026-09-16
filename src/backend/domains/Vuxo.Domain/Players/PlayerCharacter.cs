namespace Vuxo.Domain.Players;

public sealed class PlayerCharacter
{
    private PlayerCharacter(Guid id, string ownerId, string name, int level, PlayerAttributes attributes, CharacterAppearance appearance)
    {
        Id = id;
        OwnerId = ownerId;
        Name = name;
        Level = level;
        Attributes = attributes;
        Appearance = appearance;
    }

    public Guid Id { get; }
    public string OwnerId { get; }
    public string Name { get; }
    public int Level { get; }
    public PlayerAttributes Attributes { get; }
    public CharacterAppearance Appearance { get; }

    public static PlayerCharacter Create(string ownerId, string name, PlayerAttributes attributes, CharacterAppearance appearance)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerId);
        ArgumentException.ThrowIfNullOrWhiteSpace(name);

        var trimmedName = name.Trim();
        if (trimmedName.Length is < 3 or > 24)
        {
            throw new ArgumentOutOfRangeException(nameof(name), "Character name must be between 3 and 24 characters.");
        }

        return new PlayerCharacter(Guid.NewGuid(), ownerId.Trim(), trimmedName, 0, attributes, appearance);
    }

    public static PlayerCharacter Rehydrate(Guid id, string ownerId, string name, int level, PlayerAttributes attributes, CharacterAppearance appearance)
        => new(id, ownerId, name, level, attributes, appearance);
}
