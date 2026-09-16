using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

[DbContext(typeof(VuxoDbContext))]
[Migration("202609160003_ExclusiveContent")]
public partial class ExclusiveContent : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "exclusive_content_grants",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                GrantEventId = table.Column<Guid>(type: "uuid", nullable: false),
                SourceEventId = table.Column<Guid>(type: "uuid", nullable: false),
                PlayerId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                ContentKey = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                PortalKey = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                DialogBranchKey = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                RewardKey = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                Seed = table.Column<long>(type: "bigint", nullable: false),
                RuleVersion = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                CorrelationId = table.Column<Guid>(type: "uuid", nullable: false),
                CausationId = table.Column<Guid>(type: "uuid", nullable: true),
                CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                ConsumedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table => table.PrimaryKey("PK_exclusive_content_grants", x => x.Id));

        migrationBuilder.CreateIndex(
            name: "IX_exclusive_content_grants_GrantEventId",
            table: "exclusive_content_grants",
            column: "GrantEventId",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_exclusive_content_grants_PlayerId_ConsumedAtUtc_ExpiresAtUtc",
            table: "exclusive_content_grants",
            columns: new[] { "PlayerId", "ConsumedAtUtc", "ExpiresAtUtc" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "exclusive_content_grants");
    }
}
