using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

/// <summary>Monotonic version for owner-only cosmetic compare-and-swap.</summary>
[DbContext(typeof(VuxoDbContext))]
[Migration("202611090001_CharacterAppearanceRevision")]
public sealed class CharacterAppearanceRevision : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<long>(
            name: "AppearanceRevision",
            table: "player_characters",
            type: "bigint",
            nullable: false,
            defaultValue: 0L);

        migrationBuilder.AddCheckConstraint(
            name: "CK_player_characters_AppearanceRevision_Nonnegative",
            table: "player_characters",
            sql: "\"AppearanceRevision\" >= 0");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(
            name: "CK_player_characters_AppearanceRevision_Nonnegative",
            table: "player_characters");
        migrationBuilder.DropColumn(name: "AppearanceRevision", table: "player_characters");
    }
}
