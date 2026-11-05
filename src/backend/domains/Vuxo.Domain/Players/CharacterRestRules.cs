namespace Vuxo.Domain.Players;

public static class CharacterRestRules
{
    public const string Version = "character-rest-v1";
    public static readonly TimeSpan Cooldown = TimeSpan.FromMinutes(30);

    /// <summary>Restore 25% of base maximum (rounded up), never beyond max.</summary>
    public static int CalculateRestored(int current, int maximum,
        DateTimeOffset now, DateTimeOffset? lastSuccessfulRestUtc)
    {
        PlayerHealth.Restore(current, maximum);
        if (maximum == 0 || current == 0)
            throw new CharacterRestException(CharacterRestErrorCodes.Unavailable);
        if (current == maximum)
            throw new CharacterRestException(CharacterRestErrorCodes.AlreadyFull);
        if (lastSuccessfulRestUtc is { } last && last.Add(Cooldown) > now)
            throw new CharacterRestException(CharacterRestErrorCodes.Cooldown,
                last.Add(Cooldown));

        var quota = Math.Max(1, (maximum + 3) / 4);
        return Math.Min(maximum - current, quota);
    }
}

public static class CharacterRestErrorCodes
{
    public const string CharacterNotFound = "character_not_found";
    public const string InvalidIdempotencyKey = "rest_idempotency_key_required";
    public const string Unavailable = "rest_unavailable";
    public const string AlreadyFull = "rest_already_full";
    public const string Cooldown = "rest_cooldown";
}

public sealed class CharacterRestException(
    string code, DateTimeOffset? nextAllowedAtUtc = null) : Exception(code)
{
    public string Code { get; } = code;
    public DateTimeOffset? NextAllowedAtUtc { get; } = nextAllowedAtUtc;
}

public sealed record CharacterRestResult(
    Guid IdempotencyKey,
    int PreviousHealth,
    int CurrentHealth,
    int MaxHealth,
    int RestoredHealth,
    DateTimeOffset RestedAtUtc,
    DateTimeOffset NextRestAtUtc,
    bool Replayed);

public interface ICharacterRestRepository
{
    Task<CharacterRestResult> RestAsync(
        string ownerId, Guid idempotencyKey, DateTimeOffset now,
        CancellationToken cancellationToken = default);
}
