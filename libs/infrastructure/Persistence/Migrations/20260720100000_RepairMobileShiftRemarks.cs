using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260720100000_RepairMobileShiftRemarks")]
public partial class RepairMobileShiftRemarks : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS mobile_shift_remarks (
                id uuid PRIMARY KEY,
                mobile_account_id uuid NOT NULL REFERENCES mobile_accounts(id) ON DELETE CASCADE,
                employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
                section_id uuid NOT NULL REFERENCES emu_work_sections(id) ON DELETE RESTRICT,
                title character varying(240) NOT NULL,
                comment character varying(4000) NOT NULL,
                media_client_file_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
                created_at_local timestamp with time zone NOT NULL,
                created_at_server timestamp with time zone NOT NULL,
                status character varying(40) NOT NULL
            );

            CREATE INDEX IF NOT EXISTS ix_mobile_shift_remarks_account_created
                ON mobile_shift_remarks (mobile_account_id, created_at_server);

            CREATE INDEX IF NOT EXISTS ix_mobile_shift_remarks_employee
                ON mobile_shift_remarks (employee_id);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // The original MobileWorkBoard migration owns this table. This repair
        // migration must not remove pre-existing data when it is rolled back.
    }
}
