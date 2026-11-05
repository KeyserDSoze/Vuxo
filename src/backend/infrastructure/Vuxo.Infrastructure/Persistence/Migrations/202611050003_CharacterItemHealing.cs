using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vuxo.Infrastructure.Persistence.Migrations;

/// <summary>
/// Append-only heal receipts linked to canonical owner awards and audit events.
/// Award row locks in triggers serialize use/equip even on distinct API nodes.
/// </summary>
[DbContext(typeof(VuxoDbContext))]
[Migration("202611050003_CharacterItemHealing")]
public partial class CharacterItemHealing : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "character_item_heals",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                CharacterId = table.Column<Guid>(type: "uuid", nullable: false),
                PlayerId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                GrantId = table.Column<Guid>(type: "uuid", nullable: false),
                IdempotencyKey = table.Column<Guid>(type: "uuid", nullable: false),
                EventId = table.Column<Guid>(type: "uuid", nullable: false),
                PreviousHealth = table.Column<int>(type: "integer", nullable: false),
                CurrentHealth = table.Column<int>(type: "integer", nullable: false),
                MaxHealth = table.Column<int>(type: "integer", nullable: false),
                RestoredHealth = table.Column<int>(type: "integer", nullable: false),
                ConsumedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_character_item_heals", x => x.Id);
                table.ForeignKey("FK_character_item_heals_player_characters_CharacterId",
                    x => x.CharacterId, "player_characters", "Id", onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_character_item_heals_player_inventory_awards_GrantId_PlayerId",
                    x => new { x.GrantId, x.PlayerId }, "player_inventory_awards",
                    new[] { "GrantId", "PlayerId" }, onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_character_item_heals_game_events_EventId",
                    x => x.EventId, "game_events", "EventId", onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_character_item_heals_CharacterId_IdempotencyKey",
            table: "character_item_heals",
            columns: new[] { "CharacterId", "IdempotencyKey" }, unique: true);
        migrationBuilder.CreateIndex(
            name: "IX_character_item_heals_GrantId",
            table: "character_item_heals", column: "GrantId", unique: true);
        migrationBuilder.CreateIndex(
            name: "IX_character_item_heals_GrantId_PlayerId",
            table: "character_item_heals", columns: new[] { "GrantId", "PlayerId" });
        migrationBuilder.CreateIndex(
            name: "IX_character_item_heals_EventId",
            table: "character_item_heals", column: "EventId", unique: true);

        // Both directions lock the same award row and check the opposite
        // lifecycle table. A healing use and an equip cannot both commit
        // even when initiated concurrently on different API nodes.
        migrationBuilder.Sql("""
            CREATE FUNCTION vuxo_guard_heal_unspent() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                PERFORM 1 FROM player_inventory_awards
                WHERE "GrantId" = NEW."GrantId" AND "PlayerId" = NEW."PlayerId"
                FOR UPDATE;
                IF EXISTS (SELECT 1 FROM player_equipped_items
                    WHERE "GrantId" = NEW."GrantId" AND "PlayerId" = NEW."PlayerId") THEN
                    RAISE EXCEPTION 'heal_item_equipped' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$;
            CREATE TRIGGER tr_vuxo_heal_unspent
            BEFORE INSERT ON character_item_heals
            FOR EACH ROW EXECUTE FUNCTION vuxo_guard_heal_unspent();

            CREATE FUNCTION vuxo_guard_equip_unspent() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                PERFORM 1 FROM player_inventory_awards
                WHERE "GrantId" = NEW."GrantId" AND "PlayerId" = NEW."PlayerId"
                FOR UPDATE;
                IF EXISTS (SELECT 1 FROM character_item_heals
                    WHERE "GrantId" = NEW."GrantId") THEN
                    RAISE EXCEPTION 'equipment_item_used' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$;
            CREATE TRIGGER tr_vuxo_equip_unspent
            BEFORE INSERT OR UPDATE OF "GrantId" ON player_equipped_items
            FOR EACH ROW EXECUTE FUNCTION vuxo_guard_equip_unspent();
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TRIGGER IF EXISTS tr_vuxo_equip_unspent ON player_equipped_items;
            DROP FUNCTION IF EXISTS vuxo_guard_equip_unspent();
            DROP TRIGGER IF EXISTS tr_vuxo_heal_unspent ON character_item_heals;
            DROP FUNCTION IF EXISTS vuxo_guard_heal_unspent();
            """);
        migrationBuilder.DropTable(name: "character_item_heals");
    }
}
