using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

/// <summary>Forward-only additive 0.0.1 inventory award ledger.</summary>
[DbContext(typeof(VuxoDbContext))]
[Migration("202611040001_PlayerInventoryAwards")]
public partial class PlayerInventoryAwards : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "player_inventory_awards",
            columns: table => new
            {
                GrantId = table.Column<Guid>(type: "uuid", nullable: false),
                AwardEventId = table.Column<Guid>(type: "uuid", nullable: false),
                PlayerId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                ItemKey = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                AwardedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                CorrelationId = table.Column<Guid>(type: "uuid", nullable: false),
                CausationId = table.Column<Guid>(type: "uuid", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_player_inventory_awards", x => x.GrantId);
                table.ForeignKey(
                    name: "FK_player_inventory_awards_exclusive_content_grants_GrantId",
                    column: x => x.GrantId,
                    principalTable: "exclusive_content_grants",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_player_inventory_awards_AwardEventId",
            table: "player_inventory_awards",
            column: "AwardEventId",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_player_inventory_awards_PlayerId_AwardedAtUtc",
            table: "player_inventory_awards",
            columns: new[] { "PlayerId", "AwardedAtUtc" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "player_inventory_awards");
    }
}
