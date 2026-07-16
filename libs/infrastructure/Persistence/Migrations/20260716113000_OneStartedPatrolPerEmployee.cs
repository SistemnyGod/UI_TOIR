using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260716113000_OneStartedPatrolPerEmployee")]
public partial class OneStartedPatrolPerEmployee : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateIndex(
            name: "ux_assignments_employee_started",
            table: "assignments",
            column: "employee_id",
            unique: true,
            filter: "status IN ('В пути', 'Приостановлена')");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ux_assignments_employee_started",
            table: "assignments");
    }
}
