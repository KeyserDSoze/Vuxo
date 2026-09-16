namespace Vuxo.Domain.Players;

public sealed record PlayerAttributes
{
    public const int AllocationPoints = 10;

    private PlayerAttributes(int strength, int dexterity, int intelligence, int constitution, int luck, int faith)
    {
        Strength = strength;
        Dexterity = dexterity;
        Intelligence = intelligence;
        Constitution = constitution;
        Luck = luck;
        Faith = faith;
    }

    public int Strength { get; }
    public int Dexterity { get; }
    public int Intelligence { get; }
    public int Constitution { get; }
    public int Luck { get; }
    public int Faith { get; }

    public int MaxHealth => Constitution * 10;
    public double MovementSpeedMultiplier => 1d + (Dexterity * 0.10d);

    public static PlayerAttributes Create(int strength, int dexterity, int intelligence, int constitution, int luck, int faith)
    {
        var values = new[] { strength, dexterity, intelligence, constitution, luck, faith };

        if (values.Any(value => value < 0))
        {
            throw new ArgumentOutOfRangeException(nameof(values), "Player attributes cannot be negative.");
        }

        if (values.Sum() != AllocationPoints)
        {
            throw new ArgumentException($"Exactly {AllocationPoints} points must be allocated.", nameof(values));
        }

        return new PlayerAttributes(strength, dexterity, intelligence, constitution, luck, faith);
    }
}
