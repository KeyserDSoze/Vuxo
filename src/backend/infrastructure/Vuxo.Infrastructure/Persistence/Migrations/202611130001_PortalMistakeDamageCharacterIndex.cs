using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

/// <summary>The FK column of the damage ledger had no index, unlike the model convention and its sibling tables.</summary>
[DbContext(typeof(VuxoDbContext))]
[Migration("202611130001_PortalMistakeDamageCharacterIndex")]
public sealed class PortalMistakeDamageCharacterIndex : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateIndex(
            name: "IX_portal_mistake_damages_CharacterId",
            table: "portal_mistake_damages",
            column: "CharacterId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "IX_portal_mistake_damages_CharacterId",
            table: "portal_mistake_damages");
    }
}
