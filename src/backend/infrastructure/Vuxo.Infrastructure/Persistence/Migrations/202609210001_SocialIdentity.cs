using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

[DbContext(typeof(VuxoDbContext))]
[Migration("202609210001_SocialIdentity")]
public partial class SocialIdentity : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "vuxo_users",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                DisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                LastLoginAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_vuxo_users", x => x.Id));

        migrationBuilder.CreateTable(
            name: "external_identities",
            columns: table => new
            {
                Provider = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                Subject = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                VuxoUserId = table.Column<Guid>(type: "uuid", nullable: false),
                CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                LastLoginAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_external_identities", x => new { x.Provider, x.Subject });
                table.ForeignKey(
                    name: "FK_external_identities_vuxo_users_VuxoUserId",
                    column: x => x.VuxoUserId,
                    principalTable: "vuxo_users",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_external_identities_VuxoUserId",
            table: "external_identities",
            column: "VuxoUserId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "external_identities");
        migrationBuilder.DropTable(name: "vuxo_users");
    }
}
