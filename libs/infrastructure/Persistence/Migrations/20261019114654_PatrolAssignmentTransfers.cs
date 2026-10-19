using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PatrolAssignmentTransfers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "patrol_assignment_transfers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    assignment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patrol_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    from_employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                    from_employee_name = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    to_employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                    to_employee_name = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    from_mobile_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    mode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    client_operation_id = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    status_before = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    status_after = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    carried_point_results_json = table.Column<string>(type: "text", nullable: false),
                    carried_point_count = table.Column<int>(type: "integer", nullable: false),
                    transferred_at_local = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_patrol_assignment_transfers", x => x.id);
                    table.ForeignKey(
                        name: "FK_patrol_assignment_transfers_assignments_assignment_id",
                        column: x => x.assignment_id,
                        principalTable: "assignments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_patrol_assignment_transfers_mobile_accounts_from_mobile_acc~",
                        column: x => x.from_mobile_account_id,
                        principalTable: "mobile_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_patrol_assignment_transfers_assignment_created",
                table: "patrol_assignment_transfers",
                columns: new[] { "assignment_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_patrol_assignment_transfers_created",
                table: "patrol_assignment_transfers",
                column: "created_at");

            migrationBuilder.CreateIndex(
                name: "ux_patrol_assignment_transfers_account_operation",
                table: "patrol_assignment_transfers",
                columns: new[] { "from_mobile_account_id", "client_operation_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "patrol_assignment_transfers");
        }
    }
}
