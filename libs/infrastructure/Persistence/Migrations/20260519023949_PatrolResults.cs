using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PatrolResults : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "source_result_id",
                table: "patrol_requests",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "patrol_results",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    assignment_id = table.Column<Guid>(type: "uuid", nullable: true),
                    route_id = table.Column<Guid>(type: "uuid", nullable: true),
                    employee_id = table.Column<Guid>(type: "uuid", nullable: true),
                    route_point_id = table.Column<Guid>(type: "uuid", nullable: true),
                    status = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    point_name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    employee_name = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: false),
                    route_name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    territory = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    shift = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    planned_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    actual_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    deviation = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    comment = table.Column<string>(type: "character varying(1200)", maxLength: 1200, nullable: false),
                    issue_type = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    severity = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    photos = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_patrol_results", x => x.id);
                    table.ForeignKey(
                        name: "FK_patrol_results_assignments_assignment_id",
                        column: x => x.assignment_id,
                        principalTable: "assignments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_patrol_results_employees_employee_id",
                        column: x => x.employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_patrol_results_route_points_route_point_id",
                        column: x => x.route_point_id,
                        principalTable: "route_points",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_patrol_results_routes_route_id",
                        column: x => x.route_id,
                        principalTable: "routes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "patrol_result_attachments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patrol_result_id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_name = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: false),
                    content_type = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_patrol_result_attachments", x => x.id);
                    table.ForeignKey(
                        name: "FK_patrol_result_attachments_patrol_results_patrol_result_id",
                        column: x => x.patrol_result_id,
                        principalTable: "patrol_results",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "patrol_result_issues",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patrol_result_id = table.Column<Guid>(type: "uuid", nullable: false),
                    issue_type = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    severity = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    message = table.Column<string>(type: "character varying(1200)", maxLength: 1200, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_patrol_result_issues", x => x.id);
                    table.ForeignKey(
                        name: "FK_patrol_result_issues_patrol_results_patrol_result_id",
                        column: x => x.patrol_result_id,
                        principalTable: "patrol_results",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_patrol_requests_source_result_id",
                table: "patrol_requests",
                column: "source_result_id");

            migrationBuilder.CreateIndex(
                name: "ix_patrol_result_attachments_result_created",
                table: "patrol_result_attachments",
                columns: new[] { "patrol_result_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_patrol_result_issues_result_created",
                table: "patrol_result_issues",
                columns: new[] { "patrol_result_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_patrol_results_actual_at",
                table: "patrol_results",
                column: "actual_at");

            migrationBuilder.CreateIndex(
                name: "IX_patrol_results_assignment_id",
                table: "patrol_results",
                column: "assignment_id");

            migrationBuilder.CreateIndex(
                name: "ix_patrol_results_employee_id",
                table: "patrol_results",
                column: "employee_id");

            migrationBuilder.CreateIndex(
                name: "ix_patrol_results_route_id",
                table: "patrol_results",
                column: "route_id");

            migrationBuilder.CreateIndex(
                name: "IX_patrol_results_route_point_id",
                table: "patrol_results",
                column: "route_point_id");

            migrationBuilder.CreateIndex(
                name: "ix_patrol_results_status",
                table: "patrol_results",
                column: "status");

            migrationBuilder.AddForeignKey(
                name: "FK_patrol_requests_patrol_results_source_result_id",
                table: "patrol_requests",
                column: "source_result_id",
                principalTable: "patrol_results",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_patrol_requests_patrol_results_source_result_id",
                table: "patrol_requests");

            migrationBuilder.DropTable(
                name: "patrol_result_attachments");

            migrationBuilder.DropTable(
                name: "patrol_result_issues");

            migrationBuilder.DropTable(
                name: "patrol_results");

            migrationBuilder.DropIndex(
                name: "ix_patrol_requests_source_result_id",
                table: "patrol_requests");

            migrationBuilder.DropColumn(
                name: "source_result_id",
                table: "patrol_requests");
        }
    }
}
