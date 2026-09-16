using Vuxo.Domain.Common;
using Vuxo.Domain.Players;

namespace Vuxo.Application.Players;

public sealed class CharacterService(IPlayerCharacterRepository repository, IUnitOfWork unitOfWork)
{
    public async Task<PlayerCharacter> CreateAsync(CreateCharacterCommand command, CancellationToken cancellationToken = default)
    {
        var existing = await repository.GetByOwnerIdAsync(command.OwnerId, cancellationToken);
        if (existing is not null)
        {
            throw new InvalidOperationException("The player already owns a character.");
        }

        var attributes = PlayerAttributes.Create(
            command.Strength,
            command.Dexterity,
            command.Intelligence,
            command.Constitution,
            command.Luck,
            command.Faith);

        var character = PlayerCharacter.Create(command.OwnerId, command.Name, attributes, command.Appearance);
        await repository.AddAsync(character, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return character;
    }
}
