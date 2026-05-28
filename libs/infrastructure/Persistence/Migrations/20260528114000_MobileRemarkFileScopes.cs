using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260528114000_MobileRemarkFileScopes")]
public partial class MobileRemarkFileScopes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE mobile_uploaded_files
                ALTER COLUMN assignment_id DROP NOT NULL,
                ALTER COLUMN point_id DROP NOT NULL;

            ALTER TABLE mobile_uploaded_files
                ADD COLUMN IF NOT EXISTS remark_id character varying(80);

            CREATE INDEX IF NOT EXISTS ix_mobile_uploaded_files_account_remark
                ON mobile_uploaded_files (mobile_account_id, remark_id);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_mobile_uploaded_files_account_remark",
            table: "mobile_uploaded_files");

        migrationBuilder.DropColumn(
            name: "remark_id",
            table: "mobile_uploaded_files");
    }
}
