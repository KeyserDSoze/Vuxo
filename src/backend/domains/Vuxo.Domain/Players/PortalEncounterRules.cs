namespace Vuxo.Domain.Players;

/// <summary>
/// A bounded, server-verified world portal encounter. No player-controlled
/// combat flag, start time, duration, or arbitrary encounter target.
/// </summary>
public static class PortalEncounterRules
{
    public const string Version = "portal-encounter-v1";
    public static readonly TimeSpan MaximumDuration = TimeSpan.FromMinutes(3);

    public static bool IsActive(
        DateTimeOffset now, DateTimeOffset expiresAtUtc, DateTimeOffset? portalConsumedAtUtc) =>
        portalConsumedAtUtc is null && now < expiresAtUtc;
}

public static class PortalEncounterErrorCodes
{
    public const string CharacterRequired = "encounter_character_required";
    public const string InvalidPortal = "encounter_portal_unavailable";
    public const string AlreadyActive = "encounter_already_active";
}

public sealed class PortalEncounterException(string code) : Exception(code)
{
    public string Code { get; } = code;
}

public sealed record PortalEncounterStatus(bool Active, Guid? PortalGrantId, DateTimeOffset? ExpiresAtUtc);

/// <summary>Trusted server-side entry and owner-only status. No public start/end action.</summary>
public interface IPortalEncounterRepository
{
    Task<PortalEncounterStatus> GetStatusAsync(
        string playerId, DateTimeOffset now, CancellationToken cancellationToken = default);

    Task<PortalEncounterStatus> StartVerifiedPortalAsync(
        string playerId, Guid portalGrantId, DateTimeOffset now,
        CancellationToken cancellationToken = default);
}
