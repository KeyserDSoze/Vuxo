using Microsoft.EntityFrameworkCore;
using Vuxo.Domain.Players;

namespace Vuxo.Infrastructure.Persistence;

/// <summary>
/// Single PostgreSQL UPDATE with owner + expected persisted version in WHERE.
/// No client can edit stats, names, HP or another owner's character.
/// </summary>
public sealed class CharacterAppearanceRepository(VuxoDbContext dbContext) : ICharacterAppearanceRepository
{
    public async Task<bool> TryUpdateAsync(
        string ownerId,
        long expectedRevision,
        CharacterAppearance appearance,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(ownerId) || expectedRevision < 0)
            return false;

        var affected = await dbContext.PlayerCharacters
            .Where(row => row.OwnerId == ownerId && row.AppearanceRevision == expectedRevision)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(row => row.HairStyle, appearance.HairStyle)
                .SetProperty(row => row.HairColor, appearance.HairColor)
                .SetProperty(row => row.Face, appearance.Face)
                .SetProperty(row => row.BodyType, appearance.BodyType)
                .SetProperty(row => row.SkinTone, appearance.SkinTone)
                .SetProperty(row => row.TopColor, appearance.TopColor)
                .SetProperty(row => row.BottomStyle, appearance.BottomStyle)
                .SetProperty(row => row.BottomColor, appearance.BottomColor)
                .SetProperty(row => row.ShoeStyle, appearance.ShoeStyle)
                .SetProperty(row => row.ShoeColor, appearance.ShoeColor)
                .SetProperty(row => row.AppearanceRevision, row => row.AppearanceRevision + 1),
                cancellationToken);
        return affected == 1;
    }
}
