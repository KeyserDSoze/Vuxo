using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

/// <summary>Append-only, owner-scoped off-world run state and idempotent receipts.</summary>
[DbContext(typeof(VuxoDbContext))]
[Migration("202611050008_OffworldActivityRuns")]
public partial class OffworldActivityRuns : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "offworld_activity_runs",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                CharacterId = table.Column<Guid>(type: "uuid", nullable: false),
                PlayerId = table.Column<string>(type: "character varying(200)",
                    maxLength: 200, nullable: false),
                ActivityKey = table.Column<string>(type: "character varying(80)",
                    maxLength: 80, nullable: false),
                RulesVersion = table.Column<string>(type: "character varying(100)",
                    maxLength: 100, nullable: false),
                PuzzleIndex = table.Column<int>(type: "integer", nullable: false),
                StartKey = table.Column<Guid>(type: "uuid", nullable: false),
                StartEventId = table.Column<Guid>(type: "uuid", nullable: false),
                StartedAtUtc = table.Column<DateTimeOffset>(
                    type: "timestamp with time zone", nullable: false),
                ExpiresAtUtc = table.Column<DateTimeOffset>(
                    type: "timestamp with time zone", nullable: false),
                State = table.Column<string>(type: "character varying(16)",
                    maxLength: 16, nullable: false),
                FinishKey = table.Column<Guid>(type: "uuid", nullable: true),
                FinishEventId = table.Column<Guid>(type: "uuid", nullable: true),
                ProofHash = table.Column<string>(type: "character varying(64)",
                    maxLength: 64, nullable: true),
                StepsChecked = table.Column<int>(type: "integer", nullable: true),
                CompletedAtUtc = table.Column<DateTimeOffset>(
                    type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_offworld_activity_runs", x => x.Id);
                table.ForeignKey(
                    "FK_offworld_activity_runs_player_characters_CharacterId",
                    x => x.CharacterId, "player_characters", "Id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    "FK_offworld_activity_runs_game_events_StartEventId",
                    x => x.StartEventId, "game_events", "EventId",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    "FK_offworld_activity_runs_game_events_FinishEventId",
                    x => x.FinishEventId, "game_events", "EventId",
                    onDelete: ReferentialAction.Restrict);
                table.CheckConstraint("CK_offworld_activity_runs_State",
                    "\"State\" IN ('active','completed','expired')");
                table.CheckConstraint("CK_offworld_activity_runs_Time",
                    "\"ExpiresAtUtc\" > \"StartedAtUtc\"");
                table.CheckConstraint("CK_offworld_activity_runs_Completion",
                    "(\"State\" = 'completed') = (\"CompletedAtUtc\" IS NOT NULL AND \"FinishKey\" IS NOT NULL AND \"FinishEventId\" IS NOT NULL AND \"ProofHash\" IS NOT NULL AND \"StepsChecked\" IS NOT NULL)");
            });

        migrationBuilder.CreateIndex(
            "IX_offworld_activity_runs_CharacterId_StartKey",
            "offworld_activity_runs", new[] { "CharacterId", "StartKey" },
            unique: true);
        migrationBuilder.CreateIndex(
            "IX_offworld_activity_runs_CharacterId_FinishKey",
            "offworld_activity_runs", new[] { "CharacterId", "FinishKey" },
            unique: true, filter: "\"FinishKey\" IS NOT NULL");
        migrationBuilder.CreateIndex(
            "IX_offworld_activity_runs_CharacterId_StartedAtUtc",
            "offworld_activity_runs", new[] { "CharacterId", "StartedAtUtc" });
        migrationBuilder.CreateIndex(
            "IX_offworld_activity_runs_StartEventId",
            "offworld_activity_runs", "StartEventId", unique: true);
        migrationBuilder.CreateIndex(
            "IX_offworld_activity_runs_FinishEventId",
            "offworld_activity_runs", "FinishEventId", unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.DropTable("offworld_activity_runs");
}
