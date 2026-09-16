using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

[DbContext(typeof(VuxoDbContext))]
[Migration("202609160004_AuditQueries")]
public partial class AuditQueries : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateIndex(
            name: "IX_game_events_OccurredAtUtc",
            table: "game_events",
            column: "OccurredAtUtc");

        migrationBuilder.CreateIndex(
            name: "IX_game_events_EventType_OccurredAtUtc",
            table: "game_events",
            columns: new[] { "EventType", "OccurredAtUtc" });

        migrationBuilder.CreateIndex(
            name: "IX_game_events_CorrelationId",
            table: "game_events",
            column: "CorrelationId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "IX_game_events_OccurredAtUtc", table: "game_events");
        migrationBuilder.DropIndex(name: "IX_game_events_EventType_OccurredAtUtc", table: "game_events");
        migrationBuilder.DropIndex(name: "IX_game_events_CorrelationId", table: "game_events");
    }
}
