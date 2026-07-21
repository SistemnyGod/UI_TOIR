using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260721120000_MobileRefreshRotation")]
public partial class MobileRefreshRotation : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE mobile_account_sessions
                ADD COLUMN IF NOT EXISTS previous_refresh_token_hash character varying(128),
                ADD COLUMN IF NOT EXISTS previous_access_token_protected character varying(4096),
                ADD COLUMN IF NOT EXISTS previous_refresh_token_protected character varying(4096),
                ADD COLUMN IF NOT EXISTS previous_refresh_token_valid_until timestamp with time zone NULL,
                ADD COLUMN IF NOT EXISTS refresh_generation integer;

            UPDATE mobile_account_sessions
            SET
                previous_refresh_token_hash = COALESCE(previous_refresh_token_hash, ''),
                previous_access_token_protected = COALESCE(previous_access_token_protected, ''),
                previous_refresh_token_protected = COALESCE(previous_refresh_token_protected, ''),
                refresh_generation = COALESCE(refresh_generation, 0),
                refresh_expires_at = LEAST(refresh_expires_at, now() + INTERVAL '180 days');

            ALTER TABLE mobile_account_sessions
                ALTER COLUMN previous_refresh_token_hash SET DEFAULT '',
                ALTER COLUMN previous_refresh_token_hash SET NOT NULL,
                ALTER COLUMN previous_access_token_protected SET DEFAULT '',
                ALTER COLUMN previous_access_token_protected SET NOT NULL,
                ALTER COLUMN previous_refresh_token_protected SET DEFAULT '',
                ALTER COLUMN previous_refresh_token_protected SET NOT NULL,
                ALTER COLUMN refresh_generation SET DEFAULT 0,
                ALTER COLUMN refresh_generation SET NOT NULL;

            CREATE INDEX IF NOT EXISTS ix_mobile_account_sessions_previous_refresh_token_hash
                ON mobile_account_sessions (previous_refresh_token_hash)
                WHERE previous_refresh_token_hash <> '';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP INDEX IF EXISTS ix_mobile_account_sessions_previous_refresh_token_hash;
            ALTER TABLE mobile_account_sessions
                DROP COLUMN IF EXISTS previous_refresh_token_hash,
                DROP COLUMN IF EXISTS previous_access_token_protected,
                DROP COLUMN IF EXISTS previous_refresh_token_protected,
                DROP COLUMN IF EXISTS previous_refresh_token_valid_until,
                DROP COLUMN IF EXISTS refresh_generation;
            """);
    }
}