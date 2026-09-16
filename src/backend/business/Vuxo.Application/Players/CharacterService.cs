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
            throw new CharacterCreationException(
                CharacterCreationErrorCodes.AlreadyExists,
                "The player already owns a character.");
        }

        PlayerAttributes attributes;
        try
        {
            attributes = PlayerAttributes.Create(
                command.Strength,
                command.Dexterity,
                command.Intelligence,
                command.Constitution,
                command.Luck,
                command.Faith);
        }
        catch (ArgumentOutOfRangeException exception)
        {
            throw new CharacterCreationException(
                CharacterCreationErrorCodes.AttributesNegative,
                exception.Message);
        }
        catch (ArgumentException exception)
        {
            throw new CharacterCreationException(
                CharacterCreationErrorCodes.AttributeAllocationInvalid,
                exception.Message);
        }

        PlayerCharacter character;
        try
        {
            character = PlayerCharacter.Create(command.OwnerId, command.Name, attributes, command.Appearance);
        }
        catch (ArgumentOutOfRangeException exception) when (exception.ParamName == "name")
        {
            throw new CharacterCreationException(
                CharacterCreationErrorCodes.NameLengthInvalid,
                exception.Message);
        }
        catch (ArgumentException exception) when (exception.ParamName == "name")
        {
            throw new CharacterCreationException(
                CharacterCreationErrorCodes.NameRequired,
                exception.Message);
        }

        await repository.AddAsync(character, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return character;
    }
}
