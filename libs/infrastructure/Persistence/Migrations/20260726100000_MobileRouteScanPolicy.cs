using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260726100000_MobileRouteScanPolicy")]
public partial class MobileRouteScanPolicy : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE routes
                ADD COLUMN IF NOT EXISTS allow_free_order boolean NOT NULL DEFAULT TRUE,
                ADD COLUMN IF NOT EXISTS nfc_enabled boolean NOT NULL DEFAULT TRUE,
                ADD COLUMN IF NOT EXISTS qr_fallback_enabled boolean NOT NULL DEFAULT TRUE;
            ALTER TABLE route_revisions
                ADD COLUMN IF NOT EXISTS allow_free_order boolean NOT NULL DEFAULT TRUE,
                ADD COLUMN IF NOT EXISTS nfc_enabled boolean NOT NULL DEFAULT TRUE,
                ADD COLUMN IF NOT EXISTS qr_fallback_enabled boolean NOT NULL DEFAULT TRUE;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE routes
                DROP COLUMN IF EXISTS allow_free_order,
                DROP COLUMN IF EXISTS nfc_enabled,
                DROP COLUMN IF EXISTS qr_fallback_enabled;
            ALTER TABLE route_revisions
                DROP COLUMN IF EXISTS allow_free_order,
                DROP COLUMN IF EXISTS nfc_enabled,
                DROP COLUMN IF EXISTS qr_fallback_enabled;
            """);
    }
}
