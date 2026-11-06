using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

/// <summary>
/// Owner/time indexes for immutable portal mistake and Guardian turn receipts.
/// No fabricated history, no mutation of previously persisted outcomes.
/// </summary>
[DbContext(typeof(VuxoDbContext))]
[Migration("202611060002_PortalOutcomeHistoryIndexes")]
public partial class PortalOutcomeHistoryIndexes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateIndex(
            name: "IX_portal_mistake_damages_PlayerId_OccurredAtUtc_EventId",
            table: "portal_mistake_damages",
            columns: new[] { "PlayerId", "OccurredAtUtc", "EventId" });
        migrationBuilder.CreateIndex(
            name: "IX_portal_guardian_turns_PlayerId_OccurredAtUtc_TurnEventId",
            table: "portal_guardian_turns",
            columns: new[] { "PlayerId", "OccurredAtUtc", "TurnEventId" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "IX_portal_mistake_damages_PlayerId_OccurredAtUtc_EventId",
            table: "portal_mistake_damages");
        migrationBuilder.DropIndex(
            name: "IX_portal_guardian_turns_PlayerId_OccurredAtUtc_TurnEventId",
            table: "portal_guardian_turns");
    }
}
