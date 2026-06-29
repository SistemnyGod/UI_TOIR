using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260602133000_PercoIntegrationStage2")]
public partial class PercoIntegrationStage2 : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE perco_integration_settings
                ADD COLUMN IF NOT EXISTS employees_endpoint text NOT NULL DEFAULT '/api/users/staff/fullList';

            ALTER TABLE perco_integration_settings
                ADD COLUMN IF NOT EXISTS events_endpoint text NOT NULL DEFAULT '/api/verify/events';

            ALTER TABLE perco_integration_settings
                ADD COLUMN IF NOT EXISTS last_discovery_summary text NOT NULL DEFAULT '';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE perco_integration_settings DROP COLUMN IF EXISTS last_discovery_summary;
            ALTER TABLE perco_integration_settings DROP COLUMN IF EXISTS events_endpoint;
            ALTER TABLE perco_integration_settings DROP COLUMN IF EXISTS employees_endpoint;
            """);
    }
}
