using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260603150000_PercoAuthModeAndSecretChecks")]
public partial class PercoAuthModeAndSecretChecks : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE perco_integration_settings
                ADD COLUMN IF NOT EXISTS auth_mode text NOT NULL DEFAULT 'LoginPassword';

            ALTER TABLE perco_integration_settings
                ADD COLUMN IF NOT EXISTS session_token_encrypted text NOT NULL DEFAULT '';

            ALTER TABLE perco_integration_settings
                ADD COLUMN IF NOT EXISTS session_token_expires_at timestamp with time zone NULL;

            ALTER TABLE perco_integration_settings
                ADD COLUMN IF NOT EXISTS last_api_secret_check_at timestamp with time zone NULL;

            ALTER TABLE perco_integration_settings
                ADD COLUMN IF NOT EXISTS last_api_secret_status text NOT NULL DEFAULT '';

            ALTER TABLE perco_integration_settings
                ADD COLUMN IF NOT EXISTS last_api_secret_error text NOT NULL DEFAULT '';

            ALTER TABLE perco_integration_settings
                ADD COLUMN IF NOT EXISTS last_worker_secret_check_at timestamp with time zone NULL;

            ALTER TABLE perco_integration_settings
                ADD COLUMN IF NOT EXISTS last_worker_secret_status text NOT NULL DEFAULT '';

            ALTER TABLE perco_integration_settings
                ADD COLUMN IF NOT EXISTS last_worker_secret_error text NOT NULL DEFAULT '';

            UPDATE perco_integration_settings
               SET auth_mode = CASE
                    WHEN token_encrypted <> '' AND password_encrypted = '' THEN 'Token'
                    ELSE 'LoginPassword'
               END
             WHERE auth_mode IS NULL OR auth_mode = '';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
    }
}
