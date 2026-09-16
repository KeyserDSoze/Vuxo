namespace Vuxo.Application.PersonalContent;

public sealed record GrantExclusiveContentCommand(
    Guid SourceEventId,
    string PlayerId,
    string ContentKey,
    string PortalKey,
    string DialogBranchKey,
    string RewardKey,
    long Seed,
    string RuleVersion,
    Guid? CorrelationId = null,
    Guid? CausationId = null,
    DateTimeOffset? ExpiresAtUtc = null);
