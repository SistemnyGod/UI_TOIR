using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260908103000_IncrementalPercoPresenceRebuild")]
public sealed class IncrementalPercoPresenceRebuild : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "perco_presence_rebuild_queue",
            columns: table => new
            {
                employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                enqueued_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_perco_presence_rebuild_queue", row => row.employee_id);
                table.ForeignKey(
                    name: "fk_perco_presence_rebuild_queue_employees_employee_id",
                    column: row => row.employee_id,
                    principalTable: "employees",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        // Existing events get one initial, resumable rebuild. The migration never
        // deletes events, intervals, or manual corrections.
        migrationBuilder.Sql("""
            INSERT INTO perco_presence_rebuild_queue (employee_id, enqueued_at)
            SELECT DISTINCT employee_id, CURRENT_TIMESTAMP
            FROM perco_access_events
            WHERE employee_id IS NOT NULL
              AND direction IN ('IN', 'OUT')
            ON CONFLICT (employee_id) DO NOTHING;
            """);

        migrationBuilder.CreateIndex(
            name: "ix_perco_presence_rebuild_queue_enqueued",
            table: "perco_presence_rebuild_queue",
            column: "enqueued_at");

        // A million-event history needs this ordering index. Concurrent creation
        // keeps existing event ingestion and diagnostics available while it runs.
        migrationBuilder.Sql(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_perco_access_events_employee_timeline ON perco_access_events (employee_id, event_at, direction, id);",
            suppressTransaction: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            "DROP INDEX CONCURRENTLY IF EXISTS ix_perco_access_events_employee_timeline;",
            suppressTransaction: true);
        migrationBuilder.DropTable(name: "perco_presence_rebuild_queue");
    }
}
