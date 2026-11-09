using Vuxo.Domain.Players;

namespace Vuxo.Application.Players;

public static class CharacterAppearanceUpdateErrorCodes
{
    public const string NotFound = "character_not_found";
    public const string RevisionConflict = "character_appearance_revision_conflict";
    public const string InvalidRevision = "character_appearance_revision_invalid";
    public const string InvalidCatalog = "character_appearance_catalog_version_invalid";
    public const string InvalidOption = "character_appearance_option_invalid";
}

public sealed class CharacterAppearanceUpdateException(string code, string? field = null)
    : Exception(code)
{
    public string Code { get; } = code;
    public string? Field { get; } = field;
}

public sealed record SavedCharacterAppearance(
    Guid CharacterId,
    CharacterAppearance Appearance,
    long Revision,
    bool Changed);

/// <summary>Owner-only, optimistic and retry-safe appearance update.</summary>
public sealed class CharacterAppearanceUpdateService(
    IPlayerCharacterRepository characters,
    ICharacterAppearanceRepository changes)
{
    public async Task<SavedCharacterAppearance> UpdateAsync(
        string ownerId,
        string catalogVersion,
        long expectedRevision,
        CharacterAppearance appearance,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerId);
        ArgumentNullException.ThrowIfNull(appearance);

        if (catalogVersion != CharacterAppearanceCatalog.Version)
            throw new CharacterAppearanceUpdateException(CharacterAppearanceUpdateErrorCodes.InvalidCatalog);
        if (expectedRevision < 0 || expectedRevision == long.MaxValue)
            throw new CharacterAppearanceUpdateException(CharacterAppearanceUpdateErrorCodes.InvalidRevision);

        var badField = CharacterAppearanceCatalog.FindInvalidField(appearance);
        if (badField is not null)
            throw new CharacterAppearanceUpdateException(CharacterAppearanceUpdateErrorCodes.InvalidOption, badField);

        var current = await characters.GetByOwnerIdAsync(ownerId, cancellationToken)
            ?? throw new CharacterAppearanceUpdateException(CharacterAppearanceUpdateErrorCodes.NotFound);

        // A duplicate successful retry is idempotent even if it carries the
        // originally expected version; do not re-broadcast or change stats.
        if (current.Appearance == appearance)
            return new SavedCharacterAppearance(current.Id, current.Appearance, current.AppearanceRevision, false);

        if (current.AppearanceRevision != expectedRevision
            || !await changes.TryUpdateAsync(ownerId, expectedRevision, appearance, cancellationToken))
            throw new CharacterAppearanceUpdateException(CharacterAppearanceUpdateErrorCodes.RevisionConflict);

        return new SavedCharacterAppearance(current.Id, appearance, expectedRevision + 1, true);
    }
}
