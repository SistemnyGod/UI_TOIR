using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260526123000_MobileNotificationPushDiagnosticsRepair")]
public partial class MobileNotificationPushDiagnosticsRepair : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE mobile_notifications
                ADD COLUMN IF NOT EXISTS push_attempt_count integer NOT NULL DEFAULT 0;

            ALTER TABLE mobile_notifications
                ADD COLUMN IF NOT EXISTS push_last_error character varying(1200) NOT NULL DEFAULT '';

            ALTER TABLE mobile_notifications
                ADD COLUMN IF NOT EXISTS push_sent_at timestamp with time zone NULL;

            ALTER TABLE mobile_notifications
                ADD COLUMN IF NOT EXISTS push_claimed_at timestamp with time zone NULL;

            CREATE INDEX IF NOT EXISTS ix_mobile_notifications_push_status_created
                ON mobile_notifications (push_status, created_at);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP INDEX IF EXISTS ix_mobile_notifications_push_status_created;

            ALTER TABLE mobile_notifications
                DROP COLUMN IF EXISTS push_claimed_at,
                DROP COLUMN IF EXISTS push_sent_at,
                DROP COLUMN IF EXISTS push_last_error,
                DROP COLUMN IF EXISTS push_attempt_count;
            """);
    }
}
