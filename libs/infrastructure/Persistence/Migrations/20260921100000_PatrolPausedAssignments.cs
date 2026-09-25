using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260921100000_PatrolPausedAssignments")]
public sealed class PatrolPausedAssignments : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "ux_assignments_employee_started", table: "assignments");
        migrationBuilder.CreateIndex(name: "ux_assignments_employee_started", table: "assignments",
            column: "employee_id", unique: true, filter: "status = 'В пути'");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Refuse an unsafe rollback instead of deleting or silently closing paused patrols.
        migrationBuilder.Sql("DO $$ BEGIN IF EXISTS (SELECT employee_id FROM assignments WHERE status IN ('В пути', 'Приостановлена') GROUP BY employee_id HAVING COUNT(*) > 1) THEN RAISE EXCEPTION 'Resolve multiple paused patrols before rollback'; END IF; END $$;");
        migrationBuilder.DropIndex(name: "ux_assignments_employee_started", table: "assignments");
        migrationBuilder.CreateIndex(name: "ux_assignments_employee_started", table: "assignments",
            column: "employee_id", unique: true, filter: "status IN ('В пути', 'Приостановлена')");
    }
}
