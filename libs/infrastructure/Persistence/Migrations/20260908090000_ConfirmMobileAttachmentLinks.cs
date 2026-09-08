using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260908090000_ConfirmMobileAttachmentLinks")]
public sealed class ConfirmMobileAttachmentLinks : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTimeOffset>("linked_at", "mobile_uploaded_files",
            type: "timestamp with time zone", nullable: true);
        migrationBuilder.Sql("""
            UPDATE mobile_uploaded_files f SET linked_at = f.uploaded_at
            WHERE
                (f.work_task_id IS NOT NULL AND f.remark_id IS NULL
                 AND f.assignment_id IS NULL AND f.point_id IS NULL
                 AND EXISTS (
                    SELECT 1 FROM emu_work_session_employees p
                    JOIN mobile_account_employee_bindings b ON b.employee_id = p.employee_id
                    WHERE p.work_session_id = f.work_task_id AND b.mobile_account_id = f.mobile_account_id
                      AND b.created_at <= f.uploaded_at
                      AND (b.detached_at IS NULL OR b.detached_at > f.uploaded_at)))
                OR
                (f.remark_id IS NOT NULL AND f.work_task_id IS NULL
                 AND f.assignment_id IS NULL AND f.point_id IS NULL
                 AND EXISTS (
                    SELECT 1 FROM mobile_shift_remarks r
                    WHERE r.id::text = f.remark_id AND r.mobile_account_id = f.mobile_account_id
                      AND r.media_client_file_ids_json::jsonb ? f.client_file_id))
                OR
                (f.assignment_id IS NOT NULL AND f.point_id IS NOT NULL
                 AND f.remark_id IS NULL AND f.work_task_id IS NULL
                 AND EXISTS (
                    SELECT 1 FROM assignments a
                    JOIN mobile_account_employee_bindings b ON b.employee_id = a.employee_id
                    WHERE a.id = f.assignment_id AND b.mobile_account_id = f.mobile_account_id
                      AND b.created_at <= f.uploaded_at
                      AND (b.detached_at IS NULL OR b.detached_at > f.uploaded_at)));

            CREATE TABLE mobile_attachment_migration_review AS
                SELECT id AS file_id, mobile_account_id, client_file_id, assignment_id, point_id,
                       remark_id, work_task_id, CURRENT_TIMESTAMP AS reviewed_at,
                       'Parent ownership not proven during migration'::text AS reason
                FROM mobile_uploaded_files WHERE linked_at IS NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DROP TABLE mobile_attachment_migration_review");
        migrationBuilder.DropColumn("linked_at", "mobile_uploaded_files");
    }
}
