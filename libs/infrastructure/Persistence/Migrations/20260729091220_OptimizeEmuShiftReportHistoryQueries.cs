using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class OptimizeEmuShiftReportHistoryQueries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "ix_emu_shift_reports_date_submitted",
                table: "emu_shift_reports",
                columns: new[] { "report_date", "submitted_at" });

            migrationBuilder.CreateIndex(
                name: "ix_emu_shift_reports_owner_date_submitted",
                table: "emu_shift_reports",
                columns: new[] { "created_by_user_id", "report_date", "submitted_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_emu_shift_reports_date_submitted",
                table: "emu_shift_reports");

            migrationBuilder.DropIndex(
                name: "ix_emu_shift_reports_owner_date_submitted",
                table: "emu_shift_reports");
        }
    }
}
