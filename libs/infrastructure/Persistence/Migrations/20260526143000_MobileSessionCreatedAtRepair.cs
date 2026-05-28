using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260526143000_MobileSessionCreatedAtRepair")]
public partial class MobileSessionCreatedAtRepair : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE mobile_account_sessions
                ADD COLUMN IF NOT EXISTS created_at timestamp with time zone;

            UPDATE mobile_account_sessions
            SET created_at = COALESCE(created_at, last_seen_at, now());

            ALTER TABLE mobile_account_sessions
                ALTER COLUMN created_at SET DEFAULT now(),
                ALTER COLUMN created_at SET NOT NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            -- Repair-only migration. Keep created_at because the current model requires it.
            """);
    }
}
