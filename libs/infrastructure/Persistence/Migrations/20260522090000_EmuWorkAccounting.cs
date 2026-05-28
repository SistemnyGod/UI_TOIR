using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260522090000_EmuWorkAccounting")]
public partial class EmuWorkAccounting : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "emu_work_sections",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                code = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                is_active = table.Column<bool>(type: "boolean", nullable: false),
                sort_order = table.Column<int>(type: "integer", nullable: false),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_emu_work_sections", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "emu_wait_reasons",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                code = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                is_active = table.Column<bool>(type: "boolean", nullable: false),
                sort_order = table.Column<int>(type: "integer", nullable: false),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_emu_wait_reasons", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "emu_not_completed_reasons",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                code = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                is_active = table.Column<bool>(type: "boolean", nullable: false),
                sort_order = table.Column<int>(type: "integer", nullable: false),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_emu_not_completed_reasons", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "emu_favorite_employees",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                is_active = table.Column<bool>(type: "boolean", nullable: false),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_emu_favorite_employees", x => x.id);
                table.ForeignKey(
                    name: "FK_emu_favorite_employees_employees_employee_id",
                    column: x => x.employee_id,
                    principalTable: "employees",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateTable(
            name: "emu_work_templates",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                name = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                description = table.Column<string>(type: "character varying(1400)", maxLength: 1400, nullable: false),
                section_id = table.Column<Guid>(type: "uuid", nullable: true),
                is_active = table.Column<bool>(type: "boolean", nullable: false),
                sort_order = table.Column<int>(type: "integer", nullable: false),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_emu_work_templates", x => x.id);
                table.ForeignKey(
                    name: "FK_emu_work_templates_emu_work_sections_section_id",
                    column: x => x.section_id,
                    principalTable: "emu_work_sections",
                    principalColumn: "id",
                    onDelete: ReferentialAction.SetNull);
            });

        migrationBuilder.CreateTable(
            name: "emu_work_plan_tasks",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                title = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: false),
                description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                planned_date = table.Column<DateOnly>(type: "date", nullable: false),
                section_id = table.Column<Guid>(type: "uuid", nullable: true),
                status = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                approval_status = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                priority = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                is_recurring = table.Column<bool>(type: "boolean", nullable: false),
                recurrence_rule = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                approved_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                approved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                row_version = table.Column<int>(type: "integer", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_emu_work_plan_tasks", x => x.id);
                table.ForeignKey(
                    name: "FK_emu_work_plan_tasks_emu_work_sections_section_id",
                    column: x => x.section_id,
                    principalTable: "emu_work_sections",
                    principalColumn: "id",
                    onDelete: ReferentialAction.SetNull);
                table.ForeignKey(
                    name: "FK_emu_work_plan_tasks_site_users_approved_by_user_id",
                    column: x => x.approved_by_user_id,
                    principalTable: "site_users",
                    principalColumn: "id",
                    onDelete: ReferentialAction.SetNull);
            });

        migrationBuilder.CreateTable(
            name: "emu_work_sessions",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                work_number = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                work_date = table.Column<DateOnly>(type: "date", nullable: false),
                section_id = table.Column<Guid>(type: "uuid", nullable: false),
                plan_task_id = table.Column<Guid>(type: "uuid", nullable: true),
                task_description = table.Column<string>(type: "character varying(2400)", maxLength: 2400, nullable: false),
                status = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                result_status = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                result_comment = table.Column<string>(type: "character varying(2400)", maxLength: 2400, nullable: false),
                not_completed_reason_id = table.Column<Guid>(type: "uuid", nullable: true),
                arrived_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                created_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                deleted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                deleted_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                delete_reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                work_minutes = table.Column<int>(type: "integer", nullable: false),
                waiting_minutes = table.Column<int>(type: "integer", nullable: false),
                other_work_minutes = table.Column<int>(type: "integer", nullable: false),
                row_version = table.Column<int>(type: "integer", nullable: false),
                is_carried_over = table.Column<bool>(type: "boolean", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_emu_work_sessions", x => x.id);
                table.ForeignKey(
                    name: "FK_emu_work_sessions_emu_not_completed_reasons_not_completed_reason_id",
                    column: x => x.not_completed_reason_id,
                    principalTable: "emu_not_completed_reasons",
                    principalColumn: "id",
                    onDelete: ReferentialAction.SetNull);
                table.ForeignKey(
                    name: "FK_emu_work_sessions_emu_work_plan_tasks_plan_task_id",
                    column: x => x.plan_task_id,
                    principalTable: "emu_work_plan_tasks",
                    principalColumn: "id",
                    onDelete: ReferentialAction.SetNull);
                table.ForeignKey(
                    name: "FK_emu_work_sessions_emu_work_sections_section_id",
                    column: x => x.section_id,
                    principalTable: "emu_work_sections",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    name: "FK_emu_work_sessions_site_users_created_by_user_id",
                    column: x => x.created_by_user_id,
                    principalTable: "site_users",
                    principalColumn: "id",
                    onDelete: ReferentialAction.SetNull);
                table.ForeignKey(
                    name: "FK_emu_work_sessions_site_users_deleted_by_user_id",
                    column: x => x.deleted_by_user_id,
                    principalTable: "site_users",
                    principalColumn: "id",
                    onDelete: ReferentialAction.SetNull);
            });

        migrationBuilder.CreateTable(
            name: "emu_work_plan_task_employees",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                plan_task_id = table.Column<Guid>(type: "uuid", nullable: false),
                employee_id = table.Column<Guid>(type: "uuid", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_emu_work_plan_task_employees", x => x.id);
                table.ForeignKey(
                    name: "FK_emu_work_plan_task_employees_emu_work_plan_tasks_plan_task_id",
                    column: x => x.plan_task_id,
                    principalTable: "emu_work_plan_tasks",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_emu_work_plan_task_employees_employees_employee_id",
                    column: x => x.employee_id,
                    principalTable: "employees",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateTable(
            name: "emu_work_session_employees",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                work_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                full_name_snapshot = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: false),
                position_snapshot = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                status = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                arrived_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                finished_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                work_minutes = table.Column<int>(type: "integer", nullable: false),
                waiting_minutes = table.Column<int>(type: "integer", nullable: false),
                other_work_minutes = table.Column<int>(type: "integer", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_emu_work_session_employees", x => x.id);
                table.ForeignKey(
                    name: "FK_emu_work_session_employees_emu_work_sessions_work_session_id",
                    column: x => x.work_session_id,
                    principalTable: "emu_work_sessions",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_emu_work_session_employees_employees_employee_id",
                    column: x => x.employee_id,
                    principalTable: "employees",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateTable(
            name: "emu_work_pauses",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                work_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                wait_reason_id = table.Column<Guid>(type: "uuid", nullable: false),
                started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                ended_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                comment = table.Column<string>(type: "character varying(1400)", maxLength: 1400, nullable: false),
                is_other_work = table.Column<bool>(type: "boolean", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_emu_work_pauses", x => x.id);
                table.ForeignKey(
                    name: "FK_emu_work_pauses_emu_wait_reasons_wait_reason_id",
                    column: x => x.wait_reason_id,
                    principalTable: "emu_wait_reasons",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    name: "FK_emu_work_pauses_emu_work_sessions_work_session_id",
                    column: x => x.work_session_id,
                    principalTable: "emu_work_sessions",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "emu_work_session_carry_overs",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                work_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                from_date = table.Column<DateOnly>(type: "date", nullable: false),
                to_date = table.Column<DateOnly>(type: "date", nullable: false),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_emu_work_session_carry_overs", x => x.id);
                table.ForeignKey(
                    name: "FK_emu_work_session_carry_overs_emu_work_sessions_work_session_id",
                    column: x => x.work_session_id,
                    principalTable: "emu_work_sessions",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "emu_work_audit_events",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                work_session_id = table.Column<Guid>(type: "uuid", nullable: true),
                plan_task_id = table.Column<Guid>(type: "uuid", nullable: true),
                event_type = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                from_status = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                to_status = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                comment = table.Column<string>(type: "character varying(2400)", maxLength: 2400, nullable: false),
                actor_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                actor = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: false),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_emu_work_audit_events", x => x.id);
                table.ForeignKey(
                    name: "FK_emu_work_audit_events_emu_work_plan_tasks_plan_task_id",
                    column: x => x.plan_task_id,
                    principalTable: "emu_work_plan_tasks",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_emu_work_audit_events_emu_work_sessions_work_session_id",
                    column: x => x.work_session_id,
                    principalTable: "emu_work_sessions",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_emu_work_audit_events_site_users_actor_user_id",
                    column: x => x.actor_user_id,
                    principalTable: "site_users",
                    principalColumn: "id",
                    onDelete: ReferentialAction.SetNull);
            });

        migrationBuilder.CreateTable(
            name: "emu_notifications",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                employee_id = table.Column<Guid>(type: "uuid", nullable: true),
                work_session_id = table.Column<Guid>(type: "uuid", nullable: true),
                plan_task_id = table.Column<Guid>(type: "uuid", nullable: true),
                title = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: false),
                message = table.Column<string>(type: "character varying(1200)", maxLength: 1200, nullable: false),
                status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_emu_notifications", x => x.id);
                table.ForeignKey(
                    name: "FK_emu_notifications_emu_work_plan_tasks_plan_task_id",
                    column: x => x.plan_task_id,
                    principalTable: "emu_work_plan_tasks",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_emu_notifications_emu_work_sessions_work_session_id",
                    column: x => x.work_session_id,
                    principalTable: "emu_work_sessions",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_emu_notifications_employees_employee_id",
                    column: x => x.employee_id,
                    principalTable: "employees",
                    principalColumn: "id",
                    onDelete: ReferentialAction.SetNull);
            });

        migrationBuilder.CreateTable(
            name: "emu_work_pause_employees",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                pause_id = table.Column<Guid>(type: "uuid", nullable: false),
                employee_id = table.Column<Guid>(type: "uuid", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_emu_work_pause_employees", x => x.id);
                table.ForeignKey(
                    name: "FK_emu_work_pause_employees_emu_work_pauses_pause_id",
                    column: x => x.pause_id,
                    principalTable: "emu_work_pauses",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_emu_work_pause_employees_employees_employee_id",
                    column: x => x.employee_id,
                    principalTable: "employees",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(name: "ux_emu_work_sections_code", table: "emu_work_sections", column: "code", unique: true);
        migrationBuilder.CreateIndex(name: "ix_emu_work_sections_active", table: "emu_work_sections", column: "is_active");
        migrationBuilder.CreateIndex(name: "ux_emu_wait_reasons_code", table: "emu_wait_reasons", column: "code", unique: true);
        migrationBuilder.CreateIndex(name: "ux_emu_not_completed_reasons_code", table: "emu_not_completed_reasons", column: "code", unique: true);
        migrationBuilder.CreateIndex(name: "ux_emu_favorite_employees_employee", table: "emu_favorite_employees", column: "employee_id", unique: true);
        migrationBuilder.CreateIndex(name: "ix_emu_favorite_employees_active", table: "emu_favorite_employees", column: "is_active");
        migrationBuilder.CreateIndex(name: "ix_emu_work_templates_active", table: "emu_work_templates", column: "is_active");
        migrationBuilder.CreateIndex(name: "IX_emu_work_templates_section_id", table: "emu_work_templates", column: "section_id");
        migrationBuilder.CreateIndex(name: "ix_emu_plan_tasks_planned_date", table: "emu_work_plan_tasks", column: "planned_date");
        migrationBuilder.CreateIndex(name: "ix_emu_plan_tasks_approval_status", table: "emu_work_plan_tasks", column: "approval_status");
        migrationBuilder.CreateIndex(name: "IX_emu_work_plan_tasks_approved_by_user_id", table: "emu_work_plan_tasks", column: "approved_by_user_id");
        migrationBuilder.CreateIndex(name: "IX_emu_work_plan_tasks_section_id", table: "emu_work_plan_tasks", column: "section_id");
        migrationBuilder.CreateIndex(name: "ux_emu_plan_task_employees_task_employee", table: "emu_work_plan_task_employees", columns: new[] { "plan_task_id", "employee_id" }, unique: true);
        migrationBuilder.CreateIndex(name: "IX_emu_work_plan_task_employees_employee_id", table: "emu_work_plan_task_employees", column: "employee_id");
        migrationBuilder.CreateIndex(name: "ux_emu_work_sessions_number", table: "emu_work_sessions", column: "work_number", unique: true);
        migrationBuilder.CreateIndex(name: "ix_emu_work_sessions_work_date", table: "emu_work_sessions", column: "work_date");
        migrationBuilder.CreateIndex(name: "ix_emu_work_sessions_status", table: "emu_work_sessions", column: "status");
        migrationBuilder.CreateIndex(name: "ix_emu_work_sessions_deleted_at", table: "emu_work_sessions", column: "deleted_at");
        migrationBuilder.CreateIndex(name: "IX_emu_work_sessions_created_by_user_id", table: "emu_work_sessions", column: "created_by_user_id");
        migrationBuilder.CreateIndex(name: "IX_emu_work_sessions_deleted_by_user_id", table: "emu_work_sessions", column: "deleted_by_user_id");
        migrationBuilder.CreateIndex(name: "IX_emu_work_sessions_not_completed_reason_id", table: "emu_work_sessions", column: "not_completed_reason_id");
        migrationBuilder.CreateIndex(name: "IX_emu_work_sessions_plan_task_id", table: "emu_work_sessions", column: "plan_task_id");
        migrationBuilder.CreateIndex(name: "IX_emu_work_sessions_section_id", table: "emu_work_sessions", column: "section_id");
        migrationBuilder.CreateIndex(name: "ix_emu_work_session_employees_employee_status", table: "emu_work_session_employees", columns: new[] { "employee_id", "status" });
        migrationBuilder.CreateIndex(name: "IX_emu_work_session_employees_work_session_id", table: "emu_work_session_employees", column: "work_session_id");
        migrationBuilder.CreateIndex(name: "ix_emu_work_pauses_session_started", table: "emu_work_pauses", columns: new[] { "work_session_id", "started_at" });
        migrationBuilder.CreateIndex(name: "IX_emu_work_pauses_wait_reason_id", table: "emu_work_pauses", column: "wait_reason_id");
        migrationBuilder.CreateIndex(name: "ux_emu_work_pause_employees_pause_employee", table: "emu_work_pause_employees", columns: new[] { "pause_id", "employee_id" }, unique: true);
        migrationBuilder.CreateIndex(name: "IX_emu_work_pause_employees_employee_id", table: "emu_work_pause_employees", column: "employee_id");
        migrationBuilder.CreateIndex(name: "ux_emu_work_carry_overs_session_date", table: "emu_work_session_carry_overs", columns: new[] { "work_session_id", "to_date" }, unique: true);
        migrationBuilder.CreateIndex(name: "ix_emu_audit_session_created", table: "emu_work_audit_events", columns: new[] { "work_session_id", "created_at" });
        migrationBuilder.CreateIndex(name: "ix_emu_audit_plan_created", table: "emu_work_audit_events", columns: new[] { "plan_task_id", "created_at" });
        migrationBuilder.CreateIndex(name: "IX_emu_work_audit_events_actor_user_id", table: "emu_work_audit_events", column: "actor_user_id");
        migrationBuilder.CreateIndex(name: "ix_emu_notifications_status", table: "emu_notifications", column: "status");
        migrationBuilder.CreateIndex(name: "IX_emu_notifications_employee_id", table: "emu_notifications", column: "employee_id");
        migrationBuilder.CreateIndex(name: "IX_emu_notifications_plan_task_id", table: "emu_notifications", column: "plan_task_id");
        migrationBuilder.CreateIndex(name: "IX_emu_notifications_work_session_id", table: "emu_notifications", column: "work_session_id");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "emu_notifications");
        migrationBuilder.DropTable(name: "emu_work_audit_events");
        migrationBuilder.DropTable(name: "emu_work_pause_employees");
        migrationBuilder.DropTable(name: "emu_work_session_carry_overs");
        migrationBuilder.DropTable(name: "emu_work_plan_task_employees");
        migrationBuilder.DropTable(name: "emu_work_session_employees");
        migrationBuilder.DropTable(name: "emu_work_pauses");
        migrationBuilder.DropTable(name: "emu_favorite_employees");
        migrationBuilder.DropTable(name: "emu_work_templates");
        migrationBuilder.DropTable(name: "emu_work_sessions");
        migrationBuilder.DropTable(name: "emu_wait_reasons");
        migrationBuilder.DropTable(name: "emu_not_completed_reasons");
        migrationBuilder.DropTable(name: "emu_work_plan_tasks");
        migrationBuilder.DropTable(name: "emu_work_sections");
    }
}
