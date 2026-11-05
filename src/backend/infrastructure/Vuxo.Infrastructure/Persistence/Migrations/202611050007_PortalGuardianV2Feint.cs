using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

/// <summary>Forward-safe ruleset pinning: existing live Guardian encounters remain v1.</summary>
[DbContext(typeof(VuxoDbContext))]
[Migration("202611050007_PortalGuardianV2Feint")]
public partial class PortalGuardianV2Feint : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "GuardianRuleVersion", table: "portal_encounter_states",
            type: "character varying(48)", maxLength: 48, nullable: false,
            defaultValue: "portal-guardian-showdown-v1");
        migrationBuilder.AddCheckConstraint(
            name: "CK_portal_encounter_states_GuardianRuleVersion",
            table: "portal_encounter_states",
            sql: "\"GuardianRuleVersion\" IN ('portal-guardian-showdown-v1', 'portal-guardian-showdown-v2')");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(
            name: "CK_portal_encounter_states_GuardianRuleVersion",
            table: "portal_encounter_states");
        migrationBuilder.DropColumn(
            name: "GuardianRuleVersion", table: "portal_encounter_states");
    }
}
