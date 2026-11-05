using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

/// <summary>Canonical Guardian HP/turn in encounter lease and append-only turn receipts.</summary>
[DbContext(typeof(VuxoDbContext))]
[Migration("202611050006_PortalGuardianShowdown")]
public partial class PortalGuardianShowdown : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>("GuardianMaxHealth", "portal_encounter_states",
            type: "integer", nullable: false, defaultValue: 8);
        migrationBuilder.AddColumn<int>("GuardianHealth", "portal_encounter_states",
            type: "integer", nullable: false, defaultValue: 8);
        migrationBuilder.AddColumn<int>("GuardianTurn", "portal_encounter_states",
            type: "integer", nullable: false, defaultValue: 0);
        migrationBuilder.AddColumn<string>("GuardianOutcome", "portal_encounter_states",
            type: "character varying(16)", maxLength: 16, nullable: false,
            defaultValue: "ongoing");

        migrationBuilder.AddCheckConstraint("CK_portal_encounter_states_GuardianHp",
            "portal_encounter_states",
            "\"GuardianMaxHealth\" >= 1 AND \"GuardianHealth\" >= 0 AND \"GuardianHealth\" <= \"GuardianMaxHealth\"");
        migrationBuilder.AddCheckConstraint("CK_portal_encounter_states_GuardianTurn",
            "portal_encounter_states",
            "\"GuardianTurn\" >= 0 AND \"GuardianTurn\" <= 12");

        migrationBuilder.CreateTable(
            name: "portal_guardian_turns",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                CharacterId = table.Column<Guid>(type: "uuid", nullable: false),
                PlayerId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                PortalGrantId = table.Column<Guid>(type: "uuid", nullable: false),
                EncounterEventId = table.Column<Guid>(type: "uuid", nullable: false),
                TurnEventId = table.Column<Guid>(type: "uuid", nullable: false),
                IdempotencyKey = table.Column<Guid>(type: "uuid", nullable: false),
                Turn = table.Column<int>(type: "integer", nullable: false),
                Action = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                GuardianAction = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                PlayerHealthBefore = table.Column<int>(type: "integer", nullable: false),
                PlayerHealthAfter = table.Column<int>(type: "integer", nullable: false),
                PlayerMaxHealth = table.Column<int>(type: "integer", nullable: false),
                GuardianHealthBefore = table.Column<int>(type: "integer", nullable: false),
                GuardianHealthAfter = table.Column<int>(type: "integer", nullable: false),
                GuardianMaxHealth = table.Column<int>(type: "integer", nullable: false),
                DamageDealt = table.Column<int>(type: "integer", nullable: false),
                DamageTaken = table.Column<int>(type: "integer", nullable: false),
                Outcome = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                OccurredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_portal_guardian_turns", x => x.Id);
                table.ForeignKey("FK_portal_guardian_turns_player_characters_CharacterId",
                    x => x.CharacterId, "player_characters", "Id", onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_portal_guardian_turns_exclusive_content_grants_PortalGrantId_PlayerId",
                    x => new { x.PortalGrantId, x.PlayerId }, "exclusive_content_grants",
                    new[] { "Id", "PlayerId" }, onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_portal_guardian_turns_game_events_EncounterEventId",
                    x => x.EncounterEventId, "game_events", "EventId", onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_portal_guardian_turns_game_events_TurnEventId",
                    x => x.TurnEventId, "game_events", "EventId", onDelete: ReferentialAction.Restrict);
                table.CheckConstraint("CK_portal_guardian_turns_Turn",
                    "\"Turn\" >= 1 AND \"Turn\" <= 12");
                table.CheckConstraint("CK_portal_guardian_turns_Damage",
                    "\"DamageDealt\" >= 0 AND \"DamageTaken\" >= 0");
            });
        migrationBuilder.CreateIndex("IX_portal_guardian_turns_PlayerId_IdempotencyKey",
            "portal_guardian_turns", new[] { "PlayerId", "IdempotencyKey" }, unique: true);
        migrationBuilder.CreateIndex("IX_portal_guardian_turns_EncounterEventId_Turn",
            "portal_guardian_turns", new[] { "EncounterEventId", "Turn" }, unique: true);
        migrationBuilder.CreateIndex("IX_portal_guardian_turns_TurnEventId",
            "portal_guardian_turns", "TurnEventId", unique: true);
        migrationBuilder.CreateIndex("IX_portal_guardian_turns_CharacterId",
            "portal_guardian_turns", "CharacterId");
        migrationBuilder.CreateIndex("IX_portal_guardian_turns_PortalGrantId_PlayerId",
            "portal_guardian_turns", new[] { "PortalGrantId", "PlayerId" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("portal_guardian_turns");
        migrationBuilder.DropCheckConstraint("CK_portal_encounter_states_GuardianHp",
            "portal_encounter_states");
        migrationBuilder.DropCheckConstraint("CK_portal_encounter_states_GuardianTurn",
            "portal_encounter_states");
        migrationBuilder.DropColumn("GuardianOutcome", "portal_encounter_states");
        migrationBuilder.DropColumn("GuardianTurn", "portal_encounter_states");
        migrationBuilder.DropColumn("GuardianHealth", "portal_encounter_states");
        migrationBuilder.DropColumn("GuardianMaxHealth", "portal_encounter_states");
    }
}
