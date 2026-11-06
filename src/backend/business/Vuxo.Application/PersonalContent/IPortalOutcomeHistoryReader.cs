namespace Vuxo.Application.PersonalContent;

/// <summary>
/// Canonical, immutable event evidence. Not every incorrect attempt or expired
/// grant has a durable result: this read model lists only evidenced outcomes.
/// </summary>
public interface IPortalOutcomeHistoryReader
{
    Task<PortalOutcomeHistoryPage> ListForPlayerAsync(
        string playerId, int page, int pageSize,
        CancellationToken cancellationToken = default);
}

public static class PortalOutcomeKinds
{
    public const string SequenceCompleted = "sequence_completed";
    public const string SequenceFirstMistake = "sequence_first_mistake";
    public const string GuardianVictory = "guardian_victory";
    public const string GuardianRetreat = "guardian_retreat";
}

public sealed record PortalOutcomeHistoryItem(
    Guid EventId,
    Guid GrantId,
    string ContentKey,
    string Kind,
    string RuleVersion,
    DateTimeOffset OccurredAtUtc);

public sealed record PortalOutcomeHistoryPage(
    IReadOnlyList<PortalOutcomeHistoryItem> Items,
    int Page,
    int PageSize,
    bool HasMore);
