using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

/// <summary>
/// Read-only, owner-scoped index for correlating one server-awarded item with
/// the verified sequence consumption event that actually caused its award.
/// No historical attribution is fabricated or backfilled.
/// </summary>
[DbContext(typeof(VuxoDbContext))]
[Migration("202611060003_PortalRewardProvenanceIndex")]
public partial class PortalRewardProvenanceIndex : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateIndex(
            name: "IX_player_inventory_awards_PlayerId_CausationId_GrantId",
            table: "player_inventory_awards",
            columns: new[] { "PlayerId", "CausationId", "GrantId" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "IX_player_inventory_awards_PlayerId_CausationId_GrantId",
            table: "player_inventory_awards");
    }
}
