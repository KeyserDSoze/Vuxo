using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

[DbContext(typeof(VuxoDbContext))]
[Migration("202609160002_WorldGeneration")]
public partial class WorldGeneration : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "world_definitions",
            columns: table => new
            {
                WorldId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                Seed = table.Column<long>(type: "bigint", nullable: false),
                GeneratorVersion = table.Column<int>(type: "integer", nullable: false),
                CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_world_definitions", x => x.WorldId));

        migrationBuilder.CreateTable(
            name: "world_chunks",
            columns: table => new
            {
                WorldId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                ChunkX = table.Column<int>(type: "integer", nullable: false),
                ChunkY = table.Column<int>(type: "integer", nullable: false),
                Fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                MaterializedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_world_chunks", x => new { x.WorldId, x.ChunkX, x.ChunkY });
                table.ForeignKey(
                    name: "FK_world_chunks_world_definitions_WorldId",
                    column: x => x.WorldId,
                    principalTable: "world_definitions",
                    principalColumn: "WorldId",
                    onDelete: ReferentialAction.Cascade);
            });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "world_chunks");
        migrationBuilder.DropTable(name: "world_definitions");
    }
}
