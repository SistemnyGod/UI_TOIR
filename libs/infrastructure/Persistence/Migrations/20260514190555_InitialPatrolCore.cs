using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialPatrolCore : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "employees",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    full_name = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: false),
                    personnel_no = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    position = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    department = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    status = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    shift = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    has_mobile_account = table.Column<bool>(type: "boolean", nullable: false),
                    last_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_employees", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "routes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    version_no = table.Column<int>(type: "integer", nullable: false),
                    is_archived = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_routes", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "patrol_requests",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    number = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    employee_id = table.Column<Guid>(type: "uuid", nullable: true),
                    employee_name = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: false),
                    route_id = table.Column<Guid>(type: "uuid", nullable: true),
                    route_name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    scheduled_date = table.Column<DateOnly>(type: "date", nullable: false),
                    scheduled_time = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    notify_employee = table.Column<bool>(type: "boolean", nullable: false),
                    notification_text = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    status = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    description = table.Column<string>(type: "character varying(1200)", maxLength: 1200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_patrol_requests", x => x.id);
                    table.ForeignKey(
                        name: "FK_patrol_requests_employees_employee_id",
                        column: x => x.employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_patrol_requests_routes_route_id",
                        column: x => x.route_id,
                        principalTable: "routes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "route_points",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    route_id = table.Column<Guid>(type: "uuid", nullable: false),
                    seq_no = table.Column<int>(type: "integer", nullable: false),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    nfc_code = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    is_required = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_route_points", x => x.id);
                    table.ForeignKey(
                        name: "FK_route_points_routes_route_id",
                        column: x => x.route_id,
                        principalTable: "routes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "assignments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    patrol_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    route_id = table.Column<Guid>(type: "uuid", nullable: false),
                    employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                    shift = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    status = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    planned_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    finished_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    progress_percent = table.Column<int>(type: "integer", nullable: false),
                    lock_version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assignments", x => x.id);
                    table.ForeignKey(
                        name: "FK_assignments_employees_employee_id",
                        column: x => x.employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_assignments_patrol_requests_patrol_request_id",
                        column: x => x.patrol_request_id,
                        principalTable: "patrol_requests",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_assignments_routes_route_id",
                        column: x => x.route_id,
                        principalTable: "routes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_assignments_employee_status",
                table: "assignments",
                columns: new[] { "employee_id", "status" });

            migrationBuilder.CreateIndex(
                name: "IX_assignments_patrol_request_id",
                table: "assignments",
                column: "patrol_request_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_assignments_planned_at",
                table: "assignments",
                column: "planned_at");

            migrationBuilder.CreateIndex(
                name: "ix_assignments_route_id",
                table: "assignments",
                column: "route_id");

            migrationBuilder.CreateIndex(
                name: "ix_employees_status",
                table: "employees",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ux_employees_personnel_no",
                table: "employees",
                column: "personnel_no",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_patrol_requests_employee_id",
                table: "patrol_requests",
                column: "employee_id");

            migrationBuilder.CreateIndex(
                name: "IX_patrol_requests_route_id",
                table: "patrol_requests",
                column: "route_id");

            migrationBuilder.CreateIndex(
                name: "ix_patrol_requests_scheduled_date",
                table: "patrol_requests",
                column: "scheduled_date");

            migrationBuilder.CreateIndex(
                name: "ix_patrol_requests_status",
                table: "patrol_requests",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ux_patrol_requests_number",
                table: "patrol_requests",
                column: "number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_route_points_nfc_code",
                table: "route_points",
                column: "nfc_code");

            migrationBuilder.CreateIndex(
                name: "ux_route_points_route_seq",
                table: "route_points",
                columns: new[] { "route_id", "seq_no" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_routes_archived",
                table: "routes",
                column: "is_archived");

            migrationBuilder.CreateIndex(
                name: "ix_routes_name",
                table: "routes",
                column: "name");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "assignments");

            migrationBuilder.DropTable(
                name: "route_points");

            migrationBuilder.DropTable(
                name: "patrol_requests");

            migrationBuilder.DropTable(
                name: "employees");

            migrationBuilder.DropTable(
                name: "routes");
        }
    }
}
