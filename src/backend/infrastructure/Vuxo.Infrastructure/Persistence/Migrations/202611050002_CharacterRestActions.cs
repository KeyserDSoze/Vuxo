using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

/// <summary>Append-only transactional rest receipts and deduplication.</summary>
[DbContext(typeof(VuxoDbContext))]
[Migration("202611050002_CharacterRestActions")]
public partial class CharacterRestActions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "character_rest_actions",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                CharacterId = table.Column<Guid>(type: "uuid", nullable: false),
                PlayerId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                IdempotencyKey = table.Column<Guid>(type: "uuid", nullable: false),
                EventId = table.Column<Guid>(type: "uuid", nullable: false),
                PreviousHealth = table.Column<int>(type: "integer", nullable: false),
                CurrentHealth = table.Column<int>(type: "integer", nullable: false),
                MaxHealth = table.Column<int>(type: "integer", nullable: false),
                RestoredHealth = table.Column<int>(type: "integer", nullable: false),
                RestedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_character_rest_actions", x => x.Id);
                table.ForeignKey("FK_character_rest_actions_player_characters_CharacterId",
                    x => x.CharacterId, "player_characters", "Id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_character_rest_actions_game_events_EventId",
                    x => x.EventId, "game_events", "EventId",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_character_rest_actions_CharacterId_IdempotencyKey",
            table: "character_rest_actions",
            columns: new[] { "CharacterId", "IdempotencyKey" },
            unique: true);
        migrationBuilder.CreateIndex(
            name: "IX_character_rest_actions_CharacterId_RestedAtUtc",
            table: "character_rest_actions",
            columns: new[] { "CharacterId", "RestedAtUtc" });
        migrationBuilder.CreateIndex(
            name: "IX_character_rest_actions_EventId",
            table: "character_rest_actions",
            column: "EventId",
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.DropTable(name: "character_rest_actions");
}
