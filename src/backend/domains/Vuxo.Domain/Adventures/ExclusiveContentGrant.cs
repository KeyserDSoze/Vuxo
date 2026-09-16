namespace Vuxo.Domain.Adventures;

public sealed record ExclusiveContentGrant(
    Guid GrantId,
    string PlayerId,
    string ContentKey,
    Guid SourceEventId,
    long Seed,
    string RuleVersion,
    DateTimeOffset GrantedAtUtc,
    DateTimeOffset? ExpiresAtUtc,
    DateTimeOffset? ConsumedAtUtc);
