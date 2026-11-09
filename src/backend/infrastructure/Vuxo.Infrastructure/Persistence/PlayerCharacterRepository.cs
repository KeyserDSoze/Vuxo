using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.Players;
using Vuxo.Infrastructure.Persistence.Entities;

namespace Vuxo.Infrastructure.Persistence;

public sealed class PlayerCharacterRepository(VuxoDbContext dbContext) : IPlayerCharacterRepository
{
    public async Task<PlayerCharacter?> GetByOwnerIdAsync(string ownerId, CancellationToken cancellationToken = default)
    {
        var entity = await dbContext.PlayerCharacters.AsNoTracking().SingleOrDefaultAsync(x => x.OwnerId == ownerId, cancellationToken);
        if (entity is null)
        {
            return null;
        }

        var attributes = PlayerAttributes.Create(entity.Strength, entity.Dexterity, entity.Intelligence, entity.Constitution, entity.Luck, entity.Faith);
        var appearance = new CharacterAppearance(entity.HairStyle, entity.HairColor, entity.Face, entity.BodyType, entity.SkinTone, entity.TopColor, entity.BottomStyle, entity.BottomColor, entity.ShoeStyle, entity.ShoeColor);
        return PlayerCharacter.Rehydrate(entity.Id, entity.OwnerId, entity.Name, entity.Level, attributes, appearance, entity.CurrentHealth, entity.AppearanceRevision);
    }

    public async Task AddAsync(PlayerCharacter character, CancellationToken cancellationToken = default)
    {
        var entity = new PlayerCharacterEntity
        {
            Id = character.Id,
            OwnerId = character.OwnerId,
            Name = character.Name,
            Level = character.Level,
            Strength = character.Attributes.Strength,
            Dexterity = character.Attributes.Dexterity,
            Intelligence = character.Attributes.Intelligence,
            Constitution = character.Attributes.Constitution,
            CurrentHealth = character.CurrentHealth,
            Luck = character.Attributes.Luck,
            Faith = character.Attributes.Faith,
            HairStyle = character.Appearance.HairStyle,
            HairColor = character.Appearance.HairColor,
            Face = character.Appearance.Face,
            BodyType = character.Appearance.BodyType,
            SkinTone = character.Appearance.SkinTone,
            TopColor = character.Appearance.TopColor,
            BottomStyle = character.Appearance.BottomStyle,
            BottomColor = character.Appearance.BottomColor,
            ShoeStyle = character.Appearance.ShoeStyle,
            ShoeColor = character.Appearance.ShoeColor
        };

        await dbContext.PlayerCharacters.AddAsync(entity, cancellationToken);
    }
}
