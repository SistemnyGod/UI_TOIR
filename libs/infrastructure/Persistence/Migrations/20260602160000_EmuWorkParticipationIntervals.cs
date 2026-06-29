using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260602160000_EmuWorkParticipationIntervals")]
public partial class EmuWorkParticipationIntervals : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS emu_work_participation_intervals (
                id uuid NOT NULL PRIMARY KEY,
                work_session_id uuid NOT NULL REFERENCES emu_work_sessions(id) ON DELETE CASCADE,
                work_session_employee_id uuid NOT NULL REFERENCES emu_work_session_employees(id) ON DELETE CASCADE,
                employee_id uuid NOT NULL,
                started_at timestamp with time zone NOT NULL,
                ended_at timestamp with time zone NULL,
                status varchar(80) NOT NULL DEFAULT '',
                reason varchar(1200) NOT NULL DEFAULT '',
                created_by_user_id uuid NULL REFERENCES site_users(id) ON DELETE SET NULL,
                created_by_name varchar(220) NOT NULL DEFAULT '',
                created_at timestamp with time zone NOT NULL
            );

            CREATE INDEX IF NOT EXISTS ix_emu_participation_session_started
                ON emu_work_participation_intervals (work_session_id, started_at);

            CREATE INDEX IF NOT EXISTS ix_emu_participation_employee_started
                ON emu_work_participation_intervals (employee_id, started_at);

            CREATE INDEX IF NOT EXISTS ix_emu_participation_participant_ended
                ON emu_work_participation_intervals (work_session_employee_id, ended_at);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TABLE IF EXISTS emu_work_participation_intervals;
            """);
    }
}
