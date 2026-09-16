namespace Vuxo.Domain.PersonalContent;

public sealed class ExclusiveContentGrant
{
    private ExclusiveContentGrant(
        Guid id,
        Guid grantEventId,
        Guid sourceEventId,
        string playerId,
        string contentKey,
        string portalKey,
        string dialogBranchKey,
        string rewardKey,
        long seed,
        string ruleVersion,
        Guid correlationId,
        Guid? causationId,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? expiresAtUtc,
        DateTimeOffset? consumedAtUtc)
    {
        Id = id;
        GrantEventId = grantEventId;
        SourceEventId = sourceEventId;
        PlayerId = playerId;
        ContentKey = contentKey;
        PortalKey = portalKey;
        DialogBranchKey = dialogBranchKey;
        RewardKey = rewardKey;
        Seed = seed;
        RuleVersion = ruleVersion;
        CorrelationId = correlationId;
        CausationId = causationId;
        CreatedAtUtc = createdAtUtc;
        ExpiresAtUtc = expiresAtUtc;
        ConsumedAtUtc = consumedAtUtc;
    }

    public Guid Id { get; }
    public Guid GrantEventId { get; }
    public Guid SourceEventId { get; }
    public string PlayerId { get; }
    public string ContentKey { get; }
    public string PortalKey { get; }
    public string DialogBranchKey { get; }
    public string RewardKey { get; }
    public long Seed { get; }
    public string RuleVersion { get; }
    public Guid CorrelationId { get; }
    public Guid? CausationId { get; }
    public DateTimeOffset CreatedAtUtc { get; }
    public DateTimeOffset? ExpiresAtUtc { get; }
    public DateTimeOffset? ConsumedAtUtc { get; private set; }

    public bool IsConsumed => ConsumedAtUtc.HasValue;

    public bool IsExpired(DateTimeOffset now) => ExpiresAtUtc is { } expiresAt && expiresAt <= now;

    public bool IsAvailable(DateTimeOffset now) => !IsConsumed && !IsExpired(now);

    public static ExclusiveContentGrant Create(
        Guid grantEventId,
        Guid sourceEventId,
        string playerId,
        string contentKey,
        string portalKey,
        string dialogBranchKey,
        string rewardKey,
        long seed,
        string ruleVersion,
        Guid correlationId,
        Guid? causationId,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? expiresAtUtc)
    {
        if (grantEventId == Guid.Empty) throw new ArgumentException("Grant event id is required.", nameof(grantEventId));
        if (sourceEventId == Guid.Empty) throw new ArgumentException("Source event id is required.", nameof(sourceEventId));
        if (correlationId == Guid.Empty) throw new ArgumentException("Correlation id is required.", nameof(correlationId));
        ArgumentException.ThrowIfNullOrWhiteSpace(playerId);
        ArgumentException.ThrowIfNullOrWhiteSpace(contentKey);
        ArgumentException.ThrowIfNullOrWhiteSpace(portalKey);
        ArgumentException.ThrowIfNullOrWhiteSpace(dialogBranchKey);
        ArgumentException.ThrowIfNullOrWhiteSpace(rewardKey);
        ArgumentException.ThrowIfNullOrWhiteSpace(ruleVersion);

        if (expiresAtUtc is { } expiresAt && expiresAt <= createdAtUtc)
        {
            throw new ArgumentOutOfRangeException(nameof(expiresAtUtc), "Expiration must be after grant creation.");
        }

        return new ExclusiveContentGrant(
            Guid.NewGuid(),
            grantEventId,
            sourceEventId,
            playerId.Trim(),
            contentKey.Trim(),
            portalKey.Trim(),
            dialogBranchKey.Trim(),
            rewardKey.Trim(),
            seed,
            ruleVersion.Trim(),
            correlationId,
            causationId,
            createdAtUtc,
            expiresAtUtc,
            consumedAtUtc: null);
    }

    public static ExclusiveContentGrant Rehydrate(
        Guid id,
        Guid grantEventId,
        Guid sourceEventId,
        string playerId,
        string contentKey,
        string portalKey,
        string dialogBranchKey,
        string rewardKey,
        long seed,
        string ruleVersion,
        Guid correlationId,
        Guid? causationId,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? expiresAtUtc,
        DateTimeOffset? consumedAtUtc) =>
        new(
            id,
            grantEventId,
            sourceEventId,
            playerId,
            contentKey,
            portalKey,
            dialogBranchKey,
            rewardKey,
            seed,
            ruleVersion,
            correlationId,
            causationId,
            createdAtUtc,
            expiresAtUtc,
            consumedAtUtc);

    public bool TryConsume(DateTimeOffset now)
    {
        if (!IsAvailable(now)) return false;
        ConsumedAtUtc = now;
        return true;
    }
}
