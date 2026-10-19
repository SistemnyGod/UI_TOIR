using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    // Server side of mobile report auto-send: submission mode on assignments,
    // late report review queue, deferred report photos and the outbox heartbeat.
    /// <inheritdoc />
    public partial class MobileReportDelivery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "heartbeat_at",
                table: "mobile_account_sessions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "heartbeat_failed_count",
                table: "mobile_account_sessions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "heartbeat_oldest_pending_age_seconds",
                table: "mobile_account_sessions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "heartbeat_pending_count",
                table: "mobile_account_sessions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "report_late_applied_at",
                table: "assignments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "report_submission_mode",
                table: "assignments",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "patrol_late_reports",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    assignment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    mobile_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_operation_id = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    reason_code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    assignment_status_at_receipt = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    submission_mode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    payload_json = table.Column<string>(type: "text", nullable: false),
                    payload_fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    completed_at_local = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    received_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    resolution_comment = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    resolved_by = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    resolved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_patrol_late_reports", x => x.id);
                    table.ForeignKey(
                        name: "FK_patrol_late_reports_assignments_assignment_id",
                        column: x => x.assignment_id,
                        principalTable: "assignments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_patrol_late_reports_mobile_accounts_mobile_account_id",
                        column: x => x.mobile_account_id,
                        principalTable: "mobile_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patrol_report_pending_photos",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    mobile_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    assignment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    point_id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_file_id = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    late_report_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    uploaded_file_id = table.Column<Guid>(type: "uuid", nullable: true),
                    linked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_patrol_report_pending_photos", x => x.id);
                    table.ForeignKey(
                        name: "FK_patrol_report_pending_photos_assignments_assignment_id",
                        column: x => x.assignment_id,
                        principalTable: "assignments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_patrol_report_pending_photos_patrol_late_reports_late_repor~",
                        column: x => x.late_report_id,
                        principalTable: "patrol_late_reports",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_patrol_late_reports_assignment_fingerprint",
                table: "patrol_late_reports",
                columns: new[] { "assignment_id", "payload_fingerprint" });

            migrationBuilder.CreateIndex(
                name: "ix_patrol_late_reports_status_received",
                table: "patrol_late_reports",
                columns: new[] { "status", "received_at" });

            migrationBuilder.CreateIndex(
                name: "ux_patrol_late_reports_account_operation",
                table: "patrol_late_reports",
                columns: new[] { "mobile_account_id", "client_operation_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_patrol_report_pending_photos_assignment_id",
                table: "patrol_report_pending_photos",
                column: "assignment_id");

            migrationBuilder.CreateIndex(
                name: "IX_patrol_report_pending_photos_late_report_id",
                table: "patrol_report_pending_photos",
                column: "late_report_id");

            migrationBuilder.CreateIndex(
                name: "ix_patrol_report_pending_photos_unlinked",
                table: "patrol_report_pending_photos",
                column: "linked_at",
                filter: "linked_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_patrol_report_pending_photos_file",
                table: "patrol_report_pending_photos",
                columns: new[] { "mobile_account_id", "assignment_id", "client_file_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "patrol_report_pending_photos");

            migrationBuilder.DropTable(
                name: "patrol_late_reports");

            migrationBuilder.DropColumn(
                name: "heartbeat_at",
                table: "mobile_account_sessions");

            migrationBuilder.DropColumn(
                name: "heartbeat_failed_count",
                table: "mobile_account_sessions");

            migrationBuilder.DropColumn(
                name: "heartbeat_oldest_pending_age_seconds",
                table: "mobile_account_sessions");

            migrationBuilder.DropColumn(
                name: "heartbeat_pending_count",
                table: "mobile_account_sessions");

            migrationBuilder.DropColumn(
                name: "report_late_applied_at",
                table: "assignments");

            migrationBuilder.DropColumn(
                name: "report_submission_mode",
                table: "assignments");
        }
    }
}
