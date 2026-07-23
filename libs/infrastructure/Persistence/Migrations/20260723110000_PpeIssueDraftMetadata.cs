using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260723110000_PpeIssueDraftMetadata")]
public partial class PpeIssueDraftMetadata : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE inventory.ppe_cards
                ADD COLUMN IF NOT EXISTS issue_type character varying(40) NOT NULL DEFAULT 'planned',
                ADD COLUMN IF NOT EXISTS responsible_name character varying(240) NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS basis character varying(600) NOT NULL DEFAULT '';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE inventory.ppe_cards
                DROP COLUMN IF EXISTS issue_type,
                DROP COLUMN IF EXISTS responsible_name,
                DROP COLUMN IF EXISTS basis;
            """);
    }
}