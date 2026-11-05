namespace Vuxo.Domain.Players;

/// <summary>
/// Canonical base health persisted for the player character. Equipment bonuses
/// are preview-only in 0.0.1 and do not change this maximum yet.
/// </summary>
public sealed record PlayerHealth
{
    public const string RulesVersion = "character-health-v1";

    private PlayerHealth(int current, int maximum)
    {
        Current = current;
        Maximum = maximum;
    }

    public int Current { get; }
    public int Maximum { get; }

    public static PlayerHealth Full(int maximum) => Restore(maximum, maximum);

    public static PlayerHealth Restore(int current, int maximum)
    {
        if (maximum < 0) throw new ArgumentOutOfRangeException(nameof(maximum));
        if (current < 0 || current > maximum)
            throw new ArgumentOutOfRangeException(nameof(current), "Health must be within 0..maximum.");
        return new PlayerHealth(current, maximum);
    }
}
