using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

/// <summary>Adds equipment without rewriting inventory grants or historic awards.</summary>
[DbContext(typeof(VuxoDbContext))]
[Migration("202611040002_PlayerEquipment")]
public partial class PlayerEquipment : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddUniqueConstraint(
            name: "AK_player_inventory_awards_GrantId_PlayerId",
            table: "player_inventory_awards",
            columns: new[] { "GrantId", "PlayerId" });

        migrationBuilder.CreateTable(
            name: "player_equipped_items",
            columns: table => new
            {
                PlayerId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                Slot = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                GrantId = table.Column<Guid>(type: "uuid", nullable: false),
                EquippedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_player_equipped_items", x => new { x.PlayerId, x.Slot });
                table.ForeignKey(
                    name: "FK_player_equipped_items_player_inventory_awards_GrantId_PlayerId",
                    columns: x => new { x.GrantId, x.PlayerId },
                    principalTable: "player_inventory_awards",
                    principalColumns: new[] { "GrantId", "PlayerId" },
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_player_equipped_items_GrantId",
            table: "player_equipped_items",
            column: "GrantId",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_player_equipped_items_GrantId_PlayerId",
            table: "player_equipped_items",
            columns: new[] { "GrantId", "PlayerId" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "player_equipped_items");
        migrationBuilder.DropUniqueConstraint(
            name: "AK_player_inventory_awards_GrantId_PlayerId",
            table: "player_inventory_awards");
    }
}
