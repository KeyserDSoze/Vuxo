using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

/// <summary>Append-only first-wrong-portal receipts, with one per canonical grant.</summary>
[DbContext(typeof(VuxoDbContext))]
[Migration("202611050004_PortalMistakeDamage")]
public partial class PortalMistakeDamage : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // A compound principal key is necessary to enforce same-owner damage
        // receipts at database level, not just via application queries.
        migrationBuilder.AddUniqueConstraint(
            name: "AK_exclusive_content_grants_Id_PlayerId",
            table: "exclusive_content_grants",
            columns: new[] { "Id", "PlayerId" });

        migrationBuilder.CreateTable(
            name: "portal_mistake_damages",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                CharacterId = table.Column<Guid>(type: "uuid", nullable: false),
                GrantId = table.Column<Guid>(type: "uuid", nullable: false),
                PlayerId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                EventId = table.Column<Guid>(type: "uuid", nullable: false),
                PreviousHealth = table.Column<int>(type: "integer", nullable: false),
                CurrentHealth = table.Column<int>(type: "integer", nullable: false),
                MaxHealth = table.Column<int>(type: "integer", nullable: false),
                Damage = table.Column<int>(type: "integer", nullable: false),
                OccurredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_portal_mistake_damages", x => x.Id);
                table.ForeignKey("FK_portal_mistake_damages_player_characters_CharacterId",
                    x => x.CharacterId, "player_characters", "Id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_portal_mistake_damages_exclusive_content_grants_GrantId_PlayerId",
                    x => new { x.GrantId, x.PlayerId }, "exclusive_content_grants",
                    new[] { "Id", "PlayerId" }, onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_portal_mistake_damages_game_events_EventId",
                    x => x.EventId, "game_events", "EventId",
                    onDelete: ReferentialAction.Restrict);
                table.CheckConstraint("CK_portal_mistake_damages_Damage_Range",
                    "\"Damage\" >= 0 AND \"Damage\" <= 2");
            });
        migrationBuilder.CreateIndex("IX_portal_mistake_damages_GrantId",
            "portal_mistake_damages", "GrantId", unique: true);
        migrationBuilder.CreateIndex("IX_portal_mistake_damages_EventId",
            "portal_mistake_damages", "EventId", unique: true);
        migrationBuilder.CreateIndex("IX_portal_mistake_damages_GrantId_PlayerId",
            "portal_mistake_damages", new[] { "GrantId", "PlayerId" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("portal_mistake_damages");
        migrationBuilder.DropUniqueConstraint(
            name: "AK_exclusive_content_grants_Id_PlayerId",
            table: "exclusive_content_grants");
    }
}
