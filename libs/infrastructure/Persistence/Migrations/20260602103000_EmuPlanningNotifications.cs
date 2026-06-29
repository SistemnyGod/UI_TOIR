using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260602103000_EmuPlanningNotifications")]
public partial class EmuPlanningNotifications : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE emu_notifications
                ADD COLUMN IF NOT EXISTS notification_type varchar(80) NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS severity varchar(40) NOT NULL DEFAULT 'warning',
                ADD COLUMN IF NOT EXISTS dedupe_key varchar(180) NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS resolved_at timestamp with time zone;

            UPDATE emu_notifications
            SET dedupe_key = 'legacy-' || id::text
            WHERE dedupe_key = '';

            CREATE UNIQUE INDEX IF NOT EXISTS ux_emu_notifications_dedupe_key
                ON emu_notifications (dedupe_key);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP INDEX IF EXISTS ux_emu_notifications_dedupe_key;

            ALTER TABLE emu_notifications
                DROP COLUMN IF EXISTS resolved_at,
                DROP COLUMN IF EXISTS dedupe_key,
                DROP COLUMN IF EXISTS severity,
                DROP COLUMN IF EXISTS notification_type;
            """);
    }
}
