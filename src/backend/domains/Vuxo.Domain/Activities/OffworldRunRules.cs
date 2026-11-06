namespace Vuxo.Domain.Activities;

/// <summary>
/// Server-issued practice run policy. This is not a rewards system: a perfect
/// path can be generated automatically, so never turn the result into XP/items.
/// </summary>
public static class OffworldRunRules
{
    public const string ActivityKey = "rune-path";
    public const string Active = "active";
    public const string Completed = "completed";
    public const string Expired = "expired";
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(5);
    public static readonly TimeSpan StartCooldown = TimeSpan.FromMinutes(2);
    public static readonly TimeSpan DailyWindow = TimeSpan.FromDays(1);
    public const int MaximumDailyStarts = 12;
    public const int DefaultHistoryResults = 10;
    public const int MaximumHistoryResults = 20;

    public static void ValidateStart(DateTimeOffset now, DateTimeOffset? lastStart, int recentStarts)
    {
        if (recentStarts >= MaximumDailyStarts)
            throw new OffworldRunException(OffworldRunErrorCodes.DailyLimit);
        if (lastStart is { } last && now < last.Add(StartCooldown))
            throw new OffworldRunException(OffworldRunErrorCodes.Cooldown,
                last.Add(StartCooldown));
    }

    public static string CurrentState(string storedState, DateTimeOffset expires, DateTimeOffset now)
        => storedState == Active && now >= expires ? Expired : storedState;
}

public static class OffworldRunErrorCodes
{
    public const string CharacterNotFound = "activity_character_not_found";
    public const string KeyRequired = "activity_idempotency_key_required";
    public const string KeyReused = "activity_idempotency_key_reused";
    public const string InvalidActivity = "activity_not_supported";
    public const string AlreadyActive = "activity_run_active";
    public const string Cooldown = "activity_run_cooldown";
    public const string DailyLimit = "activity_run_daily_limit";
    public const string NotFound = "activity_run_not_found";
    public const string Expired = "activity_run_expired";
    public const string Completed = "activity_run_completed";
    public const string InvalidPath = "activity_run_invalid_path";
    public const string HistoryLimitInvalid = "activity_history_limit_invalid";
}

public sealed class OffworldRunException(
    string code, DateTimeOffset? nextAllowedAtUtc = null) : Exception(code)
{
    public string Code { get; } = code;
    public DateTimeOffset? NextAllowedAtUtc { get; } = nextAllowedAtUtc;
}

public sealed record OffworldRunResult(
    Guid RunId,
    string ActivityKey,
    string RulesVersion,
    int PuzzleIndex,
    DateTimeOffset StartedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    string State,
    DateTimeOffset? CompletedAtUtc,
    int? StepsChecked,
    bool Replayed);

/// <summary>Public read model: no proof, idempotency key, player ID or audit metadata.</summary>
public sealed record OffworldRunHistoryEntry(
    Guid RunId,
    string ActivityKey,
    string RulesVersion,
    int PuzzleIndex,
    DateTimeOffset StartedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    string State,
    DateTimeOffset? CompletedAtUtc,
    int? StepsChecked);

public interface IOffworldRunRepository
{
    Task<IReadOnlyList<OffworldRunHistoryEntry>> GetHistoryAsync(
        string ownerId, int limit, DateTimeOffset now,
        CancellationToken cancellationToken = default);

    Task<OffworldRunResult> StartAsync(string ownerId, Guid idempotencyKey,
        DateTimeOffset now, CancellationToken cancellationToken = default);

    // Active owner-only discovery is read-only; expired/completed tickets are never returned.
    Task<OffworldRunResult?> GetActiveAsync(string ownerId,
        DateTimeOffset now, CancellationToken cancellationToken = default);

    Task<OffworldRunResult?> GetAsync(string ownerId, Guid runId,
        DateTimeOffset now, CancellationToken cancellationToken = default);

    Task<OffworldRunResult> CompleteAsync(string ownerId, Guid runId,
        Guid idempotencyKey, string? path,
        DateTimeOffset now, CancellationToken cancellationToken = default);
}
