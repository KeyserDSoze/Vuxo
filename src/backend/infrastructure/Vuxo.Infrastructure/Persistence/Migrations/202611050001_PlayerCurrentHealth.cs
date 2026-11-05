using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

/// <summary>
/// Adds authoritative current HP. Historic characters begin at their
/// existing base maximum; no reward or healing action is implied.
/// </summary>
[DbContext(typeof(VuxoDbContext))]
[Migration("202611050001_PlayerCurrentHealth")]
public partial class PlayerCurrentHealth : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "CurrentHealth",
            table: "player_characters",
            type: "integer",
            nullable: false,
            defaultValue: 0);

        // AddColumn default=0 safely introduces the NOT NULL column, and this
        // one-time backfill initializes existing characters to full base HP.
        migrationBuilder.Sql("""
            UPDATE player_characters
            SET "CurrentHealth" = "Constitution" * 10;
            """);

        migrationBuilder.AddCheckConstraint(
            name: "CK_player_characters_CurrentHealth_Range",
            table: "player_characters",
            sql: "\"CurrentHealth\" >= 0 AND \"CurrentHealth\" <= \"Constitution\" * 10");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(
            name: "CK_player_characters_CurrentHealth_Range",
            table: "player_characters");
        migrationBuilder.DropColumn(name: "CurrentHealth", table: "player_characters");
    }
}
