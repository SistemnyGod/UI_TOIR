using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260727120000_MobileDeviceRegistry")]
public partial class MobileDeviceRegistry : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "mobile_devices",
            columns: table => new
            {
                device_id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                mobile_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                trusted = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                blocked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                block_reason = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false, defaultValue: ""),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                last_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_mobile_devices", x => x.device_id);
                table.ForeignKey(
                    name: "fk_mobile_devices_mobile_accounts_mobile_account_id",
                    column: x => x.mobile_account_id,
                    principalTable: "mobile_accounts",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "ix_mobile_devices_account",
            table: "mobile_devices",
            column: "mobile_account_id");

        migrationBuilder.CreateIndex(
            name: "ix_mobile_devices_blocked_at",
            table: "mobile_devices",
            column: "blocked_at");

        migrationBuilder.Sql(@"
            INSERT INTO mobile_devices (device_id, mobile_account_id, trusted, blocked_at, block_reason, created_at, updated_at, last_seen_at)
            SELECT DISTINCT ON (device_id)
                device_id,
                mobile_account_id,
                TRUE,
                NULL,
                '',
                created_at,
                last_seen_at,
                last_seen_at
            FROM mobile_account_sessions
            WHERE device_id IS NOT NULL AND device_id <> ''
            ORDER BY device_id, last_seen_at DESC;");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "mobile_devices");
    }
}