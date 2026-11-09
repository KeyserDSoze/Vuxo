namespace Vuxo.Application.PersonalContent;

/// <summary>
/// Only verified sequence-completion audit events are listed. A consumed or
/// awarded grant by itself is not proof of a solved rune challenge.
/// </summary>
public interface IPortalCompletionHistoryReader
{
    Task<PortalCompletionHistoryPage> ListCompletedForPlayerAsync(
        string playerId, int page, int pageSize,
        CancellationToken cancellationToken = default);
}

public sealed record PortalCompletionHistoryItem(
    Guid GrantId,
    string ContentKey,
    string RuleVersion,
    DateTimeOffset GrantedAtUtc,
    DateTimeOffset CompletedAtUtc,
    string? RewardItemKey = null);

public sealed record PortalCompletionHistoryPage(
    IReadOnlyList<PortalCompletionHistoryItem> Items,
    int Page,
    int PageSize,
    bool HasMore);
