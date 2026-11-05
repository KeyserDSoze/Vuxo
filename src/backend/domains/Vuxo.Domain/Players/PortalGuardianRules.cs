namespace Vuxo.Domain.Players;

/// <summary>
/// First simultaneous-card PvE showdown. Enemy stats and decisions depend only
/// on the server-owned portal seed, turn and rule version. No damage from clients.
/// </summary>
public static class PortalGuardianRules
{
    public const string Version = "portal-guardian-showdown-v1";
    public const string Strike = "strike";
    public const string Guard = "guard";
    public const string Ongoing = "ongoing";
    public const string Victory = "victory";
    public const string Retreat = "retreat";
    public const int MaximumTurns = 12;

    public static bool IsAction(string? action) => action is Strike or Guard;

    public static int GuardianMaxHealth(long seed) =>
        6 + (int)((seed % 3 + 3) % 3);

    public static int GuardianSpeed(long seed) =>
        2 + (int)((seed % 3 + 3) % 3);

    public static string GuardianAction(long seed, int turn) =>
        ((seed & 1L) ^ (turn & 1)) == 0 ? Strike : Guard;

    /// <summary>Both reveal actions together. Dexterity breaks a lethal strike tie.</summary>
    public static PortalGuardianResolution Resolve(
        long seed, int turn, string action, int strength, int dexterity,
        int playerHealth, int playerMaxHealth, int guardianHealth, int guardianMaxHealth)
    {
        if (!IsAction(action)) throw new ArgumentException("Invalid card.", nameof(action));
        if (turn < 1 || turn > MaximumTurns)
            throw new ArgumentOutOfRangeException(nameof(turn));
        if (strength < 0 || dexterity < 0)
            throw new ArgumentOutOfRangeException(nameof(strength));
        if (playerMaxHealth < 1 || playerHealth < 1 || playerHealth > playerMaxHealth)
            throw new ArgumentOutOfRangeException(nameof(playerHealth));
        if (guardianMaxHealth < 1 || guardianHealth < 1 || guardianHealth > guardianMaxHealth)
            throw new ArgumentOutOfRangeException(nameof(guardianHealth));

        var enemyCard = GuardianAction(seed, turn);
        var enemyGuards = enemyCard == Guard;
        var playerGuards = action == Guard;
        var strikeDamage = 2 + Math.Min(2, strength / 3);
        var dealt = playerGuards ? (enemyGuards ? 0 : 1)
            : Math.Max(1, strikeDamage - (enemyGuards ? 1 : 0));
        dealt = Math.Min(dealt, guardianHealth);
        var guardianAfter = guardianHealth - dealt;

        // Resolve speed priority when a lethal strike is revealed together
        // with an enemy strike; otherwise the Guardian can retaliate.
        var playerGoesFirst = dexterity >= GuardianSpeed(seed);
        var enemyCanStrike = !enemyGuards && !playerGuards
            && (guardianAfter > 0 || !playerGoesFirst);
        var taken = enemyCanStrike ? Math.Min(2, playerHealth - 1) : 0;
        var playerAfter = playerHealth - taken; // prototype cannot strand player at 0 HP
        var outcome = guardianAfter == 0 ? Victory
            : playerAfter == 1 || turn == MaximumTurns ? Retreat
            : Ongoing;
        return new PortalGuardianResolution(
            enemyCard, dealt, taken, guardianAfter, playerAfter, outcome);
    }
}

public sealed record PortalGuardianResolution(
    string GuardianAction, int DamageDealt, int DamageTaken,
    int GuardianHealth, int PlayerHealth, string Outcome);

public static class PortalGuardianErrorCodes
{
    public const string Unavailable = "guardian_unavailable";
    public const string InvalidAction = "guardian_invalid_action";
    public const string InvalidTurn = "guardian_invalid_turn";
    public const string KeyRequired = "guardian_idempotency_key_required";
    public const string KeyReused = "guardian_idempotency_key_reused";
    public const string StaleTurn = "guardian_stale_turn";
    public const string Finished = "guardian_finished";
    public const string TooInjured = "guardian_too_injured";
}

public sealed class PortalGuardianException(string code) : Exception(code)
{
    public string Code { get; } = code;
}

public sealed record PortalGuardianStatus(
    Guid GrantId, int Turn, int GuardianHealth, int GuardianMaxHealth,
    int PlayerHealth, int PlayerMaxHealth, string Outcome, string RuleVersion);

public sealed record PortalGuardianTurnResult(
    Guid GrantId, Guid IdempotencyKey, int Turn, string Action, string GuardianAction,
    int DamageDealt, int DamageTaken, int GuardianHealth, int GuardianMaxHealth,
    int PlayerHealth, int PlayerMaxHealth, string Outcome, bool Replayed);

/// <summary>Public combat log entry. Never expose receipt IDs, portal seeds or audit IDs.</summary>
public sealed record PortalGuardianHistoryEntry(
    int Turn, string Action, string GuardianAction, int DamageDealt,
    int DamageTaken, int GuardianHealth, int PlayerHealth,
    string Outcome, DateTimeOffset OccurredAtUtc);

public interface IPortalGuardianRepository
{
    Task<PortalGuardianStatus?> GetAsync(string playerId, Guid grantId,
        DateTimeOffset now, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<PortalGuardianHistoryEntry>?> GetHistoryAsync(
        string playerId, Guid grantId, DateTimeOffset now,
        CancellationToken cancellationToken = default);

    Task<PortalGuardianTurnResult> PlayAsync(string playerId, Guid grantId,
        string action, int expectedTurn, Guid idempotencyKey, DateTimeOffset now,
        CancellationToken cancellationToken = default);
}
