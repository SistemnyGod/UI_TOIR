using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddEmuShiftReports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "emu_shift_reports",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    report_date = table.Column<DateOnly>(type: "date", nullable: false),
                    shift_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    worker_category = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                    employee_name_snapshot = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: false),
                    personnel_no_snapshot = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    position_snapshot = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    department_snapshot = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    created_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_by_name = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    submitted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    row_version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_emu_shift_reports", x => x.id);
                    table.ForeignKey(
                        name: "FK_emu_shift_reports_employees_employee_id",
                        column: x => x.employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_emu_shift_reports_site_users_created_by_user_id",
                        column: x => x.created_by_user_id,
                        principalTable: "site_users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "emu_shift_report_lines",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    report_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sequence_no = table.Column<int>(type: "integer", nullable: false),
                    work_description = table.Column<string>(type: "character varying(1500)", maxLength: 1500, nullable: false),
                    duration_minutes = table.Column<int>(type: "integer", nullable: false),
                    section_id = table.Column<Guid>(type: "uuid", nullable: true),
                    section_name_snapshot = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    note = table.Column<string>(type: "character varying(1500)", maxLength: 1500, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_emu_shift_report_lines", x => x.id);
                    table.CheckConstraint("ck_emu_shift_report_lines_duration", "duration_minutes >= 1 AND duration_minutes <= 1440");
                    table.CheckConstraint("ck_emu_shift_report_lines_sequence", "sequence_no > 0");
                    table.ForeignKey(
                        name: "FK_emu_shift_report_lines_emu_shift_reports_report_id",
                        column: x => x.report_id,
                        principalTable: "emu_shift_reports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_emu_shift_report_lines_emu_work_sections_section_id",
                        column: x => x.section_id,
                        principalTable: "emu_work_sections",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "ix_emu_shift_report_lines_report",
                table: "emu_shift_report_lines",
                column: "report_id");

            migrationBuilder.CreateIndex(
                name: "IX_emu_shift_report_lines_section_id",
                table: "emu_shift_report_lines",
                column: "section_id");

            migrationBuilder.CreateIndex(
                name: "ux_emu_shift_report_lines_report_sequence",
                table: "emu_shift_report_lines",
                columns: new[] { "report_id", "sequence_no" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_emu_shift_reports_category_date_shift",
                table: "emu_shift_reports",
                columns: new[] { "worker_category", "report_date", "shift_type" });

            migrationBuilder.CreateIndex(
                name: "ix_emu_shift_reports_created_by",
                table: "emu_shift_reports",
                column: "created_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_emu_shift_reports_date",
                table: "emu_shift_reports",
                column: "report_date");

            migrationBuilder.CreateIndex(
                name: "ux_emu_shift_reports_employee_date_shift",
                table: "emu_shift_reports",
                columns: new[] { "employee_id", "report_date", "shift_type" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "emu_shift_report_lines");

            migrationBuilder.DropTable(
                name: "emu_shift_reports");
        }
    }
}
