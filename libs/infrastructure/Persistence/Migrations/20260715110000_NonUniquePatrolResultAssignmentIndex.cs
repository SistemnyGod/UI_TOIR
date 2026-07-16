using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260715110000_NonUniquePatrolResultAssignmentIndex")]
public partial class NonUniquePatrolResultAssignmentIndex : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) =>
        migrationBuilder.Sql("""
            DROP INDEX IF EXISTS ux_patrol_results_assignment_id;
            CREATE INDEX IF NOT EXISTS ix_patrol_results_assignment_id
                ON patrol_results (assignment_id);
            """);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.Sql("""
            DROP INDEX IF EXISTS ix_patrol_results_assignment_id;
            CREATE UNIQUE INDEX IF NOT EXISTS ux_patrol_results_assignment_id
                ON patrol_results (assignment_id)
                WHERE assignment_id IS NOT NULL;
            """);
}
