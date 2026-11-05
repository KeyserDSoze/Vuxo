using Vuxo.Domain.Inventory;

namespace Vuxo.Domain.Players;

/// <summary>
/// One non-equipped Grove Seed can restore up to ten base HP. This is a
/// server-owned effect; the client only selects the grant to spend.
/// </summary>
public static class CharacterHealingRules
{
    public const string Version = "character-healing-v1";
    public const int GroveSeedHealing = 10;

    public static int CalculateRestored(string itemKey, int current, int maximum)
    {
        PlayerHealth.Restore(current, maximum);
        if (itemKey != InventoryItemCatalog.GroveSeed)
            throw new CharacterHealingException(CharacterHealingErrorCodes.NotConsumable);
        if (maximum == 0 || current == 0)
            throw new CharacterHealingException(CharacterHealingErrorCodes.Unavailable);
        if (current == maximum)
            throw new CharacterHealingException(CharacterHealingErrorCodes.AlreadyFull);
        return Math.Min(GroveSeedHealing, maximum - current);
    }
}

public static class CharacterHealingErrorCodes
{
    public const string InvalidKey = "heal_idempotency_key_required";
    public const string CharacterNotFound = "character_not_found";
    public const string ItemNotOwned = "heal_item_not_owned";
    public const string NotConsumable = "heal_item_not_consumable";
    public const string ItemEquipped = "heal_item_equipped";
    public const string ItemUsed = "heal_item_used";
    public const string AlreadyFull = "heal_already_full";
    public const string Unavailable = "heal_unavailable";
    public const string KeyReused = "heal_idempotency_key_reused";
    public const string EncounterActive = "heal_encounter_active";
}

public sealed class CharacterHealingException(string code) : Exception(code)
{
    public string Code { get; } = code;
}

public sealed record CharacterHealingResult(
    Guid GrantId,
    Guid IdempotencyKey,
    int PreviousHealth,
    int CurrentHealth,
    int MaxHealth,
    int RestoredHealth,
    DateTimeOffset ConsumedAtUtc,
    bool Replayed);

public interface ICharacterHealingRepository
{
    Task<CharacterHealingResult> HealAsync(string playerId, Guid grantId,
        Guid idempotencyKey, DateTimeOffset now,
        CancellationToken cancellationToken = default);
}
