using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

public partial class Initial : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "game_events",
            columns: table => new
            {
                EventId = table.Column<Guid>(type: "uuid", nullable: false),
                EventType = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                VisibilityScope = table.Column<int>(type: "integer", nullable: false),
                PlayerId = table.Column<string>(type: "text", nullable: true),
                CorrelationId = table.Column<Guid>(type: "uuid", nullable: false),
                CausationId = table.Column<Guid>(type: "uuid", nullable: true),
                RuleVersion = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                OccurredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                PayloadJson = table.Column<string>(type: "jsonb", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_game_events", x => x.EventId));

        migrationBuilder.CreateTable(
            name: "player_characters",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                OwnerId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                Name = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                Level = table.Column<int>(type: "integer", nullable: false),
                Strength = table.Column<int>(type: "integer", nullable: false),
                Dexterity = table.Column<int>(type: "integer", nullable: false),
                Intelligence = table.Column<int>(type: "integer", nullable: false),
                Constitution = table.Column<int>(type: "integer", nullable: false),
                Luck = table.Column<int>(type: "integer", nullable: false),
                Faith = table.Column<int>(type: "integer", nullable: false),
                HairStyle = table.Column<string>(type: "text", nullable: false),
                HairColor = table.Column<string>(type: "text", nullable: false),
                Face = table.Column<string>(type: "text", nullable: false),
                BodyType = table.Column<string>(type: "text", nullable: false),
                SkinTone = table.Column<string>(type: "text", nullable: false),
                TopColor = table.Column<string>(type: "text", nullable: false),
                BottomStyle = table.Column<string>(type: "text", nullable: false),
                BottomColor = table.Column<string>(type: "text", nullable: false),
                ShoeStyle = table.Column<string>(type: "text", nullable: false),
                ShoeColor = table.Column<string>(type: "text", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_player_characters", x => x.Id));

        migrationBuilder.CreateIndex(
            name: "IX_game_events_PlayerId_OccurredAtUtc",
            table: "game_events",
            columns: new[] { "PlayerId", "OccurredAtUtc" });

        migrationBuilder.CreateIndex(
            name: "IX_player_characters_OwnerId",
            table: "player_characters",
            column: "OwnerId",
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "game_events");
        migrationBuilder.DropTable(name: "player_characters");
    }
}
