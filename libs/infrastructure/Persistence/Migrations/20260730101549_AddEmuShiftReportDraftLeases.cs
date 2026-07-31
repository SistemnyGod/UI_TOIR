using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddEmuShiftReportDraftLeases : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "emu_shift_report_drafts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    report_date = table.Column<DateOnly>(type: "date", nullable: false),
                    shift_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    worker_category = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                    editor_instance_id = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    editor_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    editor_name = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: false),
                    version = table.Column<long>(type: "bigint", nullable: false),
                    payload_json = table.Column<string>(type: "jsonb", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    lease_expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_emu_shift_report_drafts", x => x.id);
                    table.ForeignKey(
                        name: "FK_emu_shift_report_drafts_employees_employee_id",
                        column: x => x.employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_emu_shift_report_drafts_site_users_editor_user_id",
                        column: x => x.editor_user_id,
                        principalTable: "site_users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_emu_shift_report_drafts_editor_user_id",
                table: "emu_shift_report_drafts",
                column: "editor_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_emu_shift_report_drafts_lease_expires",
                table: "emu_shift_report_drafts",
                column: "lease_expires_at");

            migrationBuilder.CreateIndex(
                name: "ux_emu_shift_report_drafts_employee_date_shift",
                table: "emu_shift_report_drafts",
                columns: new[] { "employee_id", "report_date", "shift_type" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "emu_shift_report_drafts");
        }
    }
}
