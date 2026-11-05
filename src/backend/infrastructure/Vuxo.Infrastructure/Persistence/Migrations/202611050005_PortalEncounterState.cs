using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

/// <summary>Server-owned, bounded portal encounter lock per character.</summary>
[DbContext(typeof(VuxoDbContext))]
[Migration("202611050005_PortalEncounterState")]
public partial class PortalEncounterState : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "portal_encounter_states",
            columns: table => new
            {
                CharacterId = table.Column<Guid>(type: "uuid", nullable: false),
                PlayerId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                PortalGrantId = table.Column<Guid>(type: "uuid", nullable: false),
                StartEventId = table.Column<Guid>(type: "uuid", nullable: false),
                StartedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_portal_encounter_states", x => x.CharacterId);
                table.ForeignKey("FK_portal_encounter_states_player_characters_CharacterId",
                    x => x.CharacterId, "player_characters", "Id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_portal_encounter_states_exclusive_content_grants_PortalGrantId_PlayerId",
                    x => new { x.PortalGrantId, x.PlayerId },
                    "exclusive_content_grants",
                    new[] { "Id", "PlayerId" },
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_portal_encounter_states_game_events_StartEventId",
                    x => x.StartEventId, "game_events", "EventId",
                    onDelete: ReferentialAction.Restrict);
                table.CheckConstraint("CK_portal_encounter_states_Time",
                    "\"ExpiresAtUtc\" > \"StartedAtUtc\"");
            });
        migrationBuilder.CreateIndex("IX_portal_encounter_states_PlayerId",
            "portal_encounter_states", "PlayerId", unique: true);
        migrationBuilder.CreateIndex("IX_portal_encounter_states_PortalGrantId_PlayerId",
            "portal_encounter_states", new[] { "PortalGrantId", "PlayerId" });
        migrationBuilder.CreateIndex("IX_portal_encounter_states_StartEventId",
            "portal_encounter_states", "StartEventId", unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.DropTable("portal_encounter_states");
}
