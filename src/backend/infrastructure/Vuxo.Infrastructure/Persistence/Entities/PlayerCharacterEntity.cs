namespace Vuxo.Infrastructure.Persistence.Entities;

public sealed class PlayerCharacterEntity
{
    public Guid Id { get; set; }
    public required string OwnerId { get; set; }
    public required string Name { get; set; }
    public int Level { get; set; }
    public int Strength { get; set; }
    public int Dexterity { get; set; }
    public int Intelligence { get; set; }
    public int Constitution { get; set; }
    public int CurrentHealth { get; set; }
    public int Luck { get; set; }
    public int Faith { get; set; }
    public required string HairStyle { get; set; }
    public required string HairColor { get; set; }
    public required string Face { get; set; }
    public required string BodyType { get; set; }
    public required string SkinTone { get; set; }
    public required string TopColor { get; set; }
    public required string BottomStyle { get; set; }
    public required string BottomColor { get; set; }
    public required string ShoeStyle { get; set; }
    public required string ShoeColor { get; set; }
}
