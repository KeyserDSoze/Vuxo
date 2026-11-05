namespace Vuxo.Domain.Players;

/// <summary>A bounded consequence of a server-validated incorrect portal sequence.</summary>
public static class PortalMistakeDamageRules
{
    public const string Version = "portal-mistake-damage-v1";
    public const int MaximumDamagePerGrant = 2;

    public static int CalculateDamage(int currentHealth, int maxHealth)
    {
        PlayerHealth.Restore(currentHealth, maxHealth);
        return Math.Min(currentHealth, MaximumDamagePerGrant);
    }
}

public sealed record PortalMistakeDamageResult(
    Guid GrantId,
    int PreviousHealth,
    int CurrentHealth,
    int MaxHealth,
    int Damage,
    bool Applied);

/// <summary>
/// Applies only a pre-validated server-side incorrect sequence, never a browser
/// provided damage amount. Null means the grant is unavailable or has no character.
/// </summary>
public interface IPortalMistakeDamageRepository
{
    Task<PortalMistakeDamageResult?> ApplyFirstMistakeAsync(
        string playerId, Guid grantId, DateTimeOffset now,
        CancellationToken cancellationToken = default);
}
