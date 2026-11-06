using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

/// <summary>
/// Narrow owner/event-type index for read-only portal completion timeline.
/// No historical outcomes are inferred or backfilled by this migration.
/// </summary>
[DbContext(typeof(VuxoDbContext))]
[Migration("202611060001_PortalCompletionHistoryIndex")]
public partial class PortalCompletionHistoryIndex : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateIndex(
            name: "IX_game_events_PlayerId_EventType_OccurredAtUtc_EventId",
            table: "game_events",
            columns: new[] { "PlayerId", "EventType", "OccurredAtUtc", "EventId" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "IX_game_events_PlayerId_EventType_OccurredAtUtc_EventId",
            table: "game_events");
    }
}
