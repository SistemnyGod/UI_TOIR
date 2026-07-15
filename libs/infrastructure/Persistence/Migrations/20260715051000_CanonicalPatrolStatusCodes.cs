using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260715051000_CanonicalPatrolStatusCodes")]
public partial class CanonicalPatrolStatusCodes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>("status_code", "assignments", type: "character varying(40)", maxLength: 40, nullable: true);
        migrationBuilder.AddColumn<string>("status_code", "patrol_requests", type: "character varying(40)", maxLength: 40, nullable: true);
        migrationBuilder.AddColumn<string>("status_code", "patrol_results", type: "character varying(40)", maxLength: 40, nullable: true);

        migrationBuilder.Sql("""
            UPDATE assignments SET status_code = CASE lower(trim(status))
                WHEN 'назначена' THEN 'assigned' WHEN 'назначено' THEN 'assigned' WHEN 'assigned' THEN 'assigned'
                WHEN 'ожидает' THEN 'waiting' WHEN 'ожидает принятия' THEN 'waiting' WHEN 'waiting' THEN 'waiting'
                WHEN 'принята' THEN 'accepted' WHEN 'принято' THEN 'accepted' WHEN 'accepted' THEN 'accepted'
                WHEN 'в пути' THEN 'in_progress' WHEN 'в работе' THEN 'in_progress' WHEN 'in_progress' THEN 'in_progress'
                WHEN 'приостановлена' THEN 'paused' WHEN 'приостановлено' THEN 'paused' WHEN 'paused' THEN 'paused'
                WHEN 'завершено' THEN 'completed' WHEN 'завершена' THEN 'completed' WHEN 'выполнено' THEN 'completed' WHEN 'completed' THEN 'completed' WHEN 'closed' THEN 'completed'
                WHEN 'отменено' THEN 'cancelled' WHEN 'отменена' THEN 'cancelled' WHEN 'cancelled' THEN 'cancelled' WHEN 'canceled' THEN 'cancelled'
                WHEN 'требует решения диспетчера' THEN 'dispatcher_review' WHEN 'dispatcher_review' THEN 'dispatcher_review'
                WHEN 'просрочена' THEN 'overdue' WHEN 'просрочено' THEN 'overdue' WHEN 'overdue' THEN 'overdue'
                WHEN 'задержка' THEN 'delayed' WHEN 'delayed' THEN 'delayed' ELSE NULL END;

            UPDATE patrol_requests SET status_code = CASE lower(trim(status))
                WHEN 'новая' THEN 'new' WHEN 'new' THEN 'new' WHEN 'отправлена' THEN 'dispatched' WHEN 'отправлено' THEN 'dispatched' WHEN 'dispatched' THEN 'dispatched' WHEN 'sent' THEN 'dispatched'
                WHEN 'назначена' THEN 'assigned' WHEN 'назначено' THEN 'assigned' WHEN 'assigned' THEN 'assigned'
                WHEN 'ожидает' THEN 'waiting' WHEN 'ожидает принятия' THEN 'waiting' WHEN 'waiting' THEN 'waiting'
                WHEN 'принята' THEN 'accepted' WHEN 'принято' THEN 'accepted' WHEN 'accepted' THEN 'accepted'
                WHEN 'в пути' THEN 'in_progress' WHEN 'в работе' THEN 'in_progress' WHEN 'in_progress' THEN 'in_progress'
                WHEN 'приостановлена' THEN 'paused' WHEN 'приостановлено' THEN 'paused' WHEN 'paused' THEN 'paused'
                WHEN 'завершено' THEN 'completed' WHEN 'завершена' THEN 'completed' WHEN 'выполнено' THEN 'completed' WHEN 'completed' THEN 'completed' WHEN 'closed' THEN 'completed'
                WHEN 'отменено' THEN 'cancelled' WHEN 'отменена' THEN 'cancelled' WHEN 'cancelled' THEN 'cancelled' WHEN 'canceled' THEN 'cancelled'
                WHEN 'требует решения диспетчера' THEN 'dispatcher_review' WHEN 'dispatcher_review' THEN 'dispatcher_review'
                WHEN 'просрочена' THEN 'overdue' WHEN 'просрочено' THEN 'overdue' WHEN 'overdue' THEN 'overdue'
                WHEN 'задержка' THEN 'delayed' WHEN 'delayed' THEN 'delayed' ELSE NULL END;

            UPDATE patrol_results SET status_code = CASE lower(trim(status))
                WHEN 'подтверждено' THEN 'confirmed' WHEN 'выполнено' THEN 'confirmed' WHEN 'ok' THEN 'confirmed' WHEN 'success' THEN 'confirmed' WHEN 'completed' THEN 'confirmed' WHEN 'confirmed' THEN 'confirmed'
                WHEN 'замечание' THEN 'issue' WHEN 'issue' THEN 'issue'
                WHEN 'просрочено' THEN 'overdue' WHEN 'просрочена' THEN 'overdue' WHEN 'overdue' THEN 'overdue'
                WHEN 'отменено' THEN 'cancelled' WHEN 'отменена' THEN 'cancelled' WHEN 'cancelled' THEN 'cancelled' WHEN 'canceled' THEN 'cancelled' ELSE NULL END;
            """);

        migrationBuilder.CreateIndex("ix_assignments_employee_status_code", "assignments", new[] { "employee_id", "status_code" });
        migrationBuilder.CreateIndex("ix_assignments_planned_at_status_code", "assignments", new[] { "planned_at", "status_code" });
        migrationBuilder.CreateIndex("ix_patrol_requests_status_code", "patrol_requests", "status_code");
        migrationBuilder.CreateIndex("ix_patrol_requests_scheduled_date_status_code", "patrol_requests", new[] { "scheduled_date", "status_code" });
        migrationBuilder.CreateIndex("ix_patrol_results_status_code", "patrol_results", "status_code");
        migrationBuilder.CreateIndex("ix_patrol_results_actual_at_assignment_id", "patrol_results", new[] { "actual_at", "assignment_id" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex("ix_assignments_employee_status_code", "assignments");
        migrationBuilder.DropIndex("ix_assignments_planned_at_status_code", "assignments");
        migrationBuilder.DropIndex("ix_patrol_requests_status_code", "patrol_requests");
        migrationBuilder.DropIndex("ix_patrol_requests_scheduled_date_status_code", "patrol_requests");
        migrationBuilder.DropIndex("ix_patrol_results_status_code", "patrol_results");
        migrationBuilder.DropIndex("ix_patrol_results_actual_at_assignment_id", "patrol_results");
        migrationBuilder.DropColumn("status_code", "assignments");
        migrationBuilder.DropColumn("status_code", "patrol_requests");
        migrationBuilder.DropColumn("status_code", "patrol_results");
    }
}
