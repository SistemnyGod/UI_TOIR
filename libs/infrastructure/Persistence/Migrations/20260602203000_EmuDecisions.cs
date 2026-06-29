using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260602203000_EmuDecisions")]
public partial class EmuDecisions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS emu_decisions (
                id uuid NOT NULL,
                decision_type character varying(80) NOT NULL,
                severity character varying(40) NOT NULL DEFAULT 'warning',
                status character varying(40) NOT NULL DEFAULT 'new',
                employee_id uuid NOT NULL,
                work_session_id uuid NULL,
                shift_date date NOT NULL,
                detected_at timestamp with time zone NOT NULL,
                resolved_at timestamp with time zone NULL,
                resolved_by_user_id uuid NULL,
                resolved_by_name character varying(220) NOT NULL DEFAULT '',
                dedupe_key character varying(220) NOT NULL,
                payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
                resolution character varying(80) NOT NULL DEFAULT '',
                comment character varying(1600) NOT NULL DEFAULT '',
                row_version integer NOT NULL DEFAULT 1,
                CONSTRAINT pk_emu_decisions PRIMARY KEY (id),
                CONSTRAINT fk_emu_decisions_employees_employee_id FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE RESTRICT,
                CONSTRAINT fk_emu_decisions_emu_work_sessions_work_session_id FOREIGN KEY (work_session_id) REFERENCES emu_work_sessions (id) ON DELETE SET NULL,
                CONSTRAINT fk_emu_decisions_site_users_resolved_by_user_id FOREIGN KEY (resolved_by_user_id) REFERENCES site_users (id) ON DELETE SET NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS ux_emu_decisions_dedupe_key ON emu_decisions (dedupe_key);
            CREATE INDEX IF NOT EXISTS ix_emu_decisions_status_severity ON emu_decisions (status, severity);
            CREATE INDEX IF NOT EXISTS ix_emu_decisions_employee_shift ON emu_decisions (employee_id, shift_date);
            CREATE INDEX IF NOT EXISTS ix_emu_decisions_work_session ON emu_decisions (work_session_id);
        """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "emu_decisions");
    }
}
