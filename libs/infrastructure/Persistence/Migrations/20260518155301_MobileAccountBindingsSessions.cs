using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MobileAccountBindingsSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "actor",
                table: "mobile_account_audit_events",
                type: "character varying(160)",
                maxLength: 160,
                nullable: false,
                defaultValue: "system");

            migrationBuilder.CreateTable(
                name: "mobile_account_employee_bindings",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    mobile_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                    display_name = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    detached_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mobile_account_employee_bindings", x => x.id);
                    table.ForeignKey(
                        name: "FK_mobile_account_employee_bindings_employees_employee_id",
                        column: x => x.employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_mobile_account_employee_bindings_mobile_accounts_mobile_acc~",
                        column: x => x.mobile_account_id,
                        principalTable: "mobile_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "mobile_account_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    mobile_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    device = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    platform = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    app_version = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ip_address = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    last_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mobile_account_sessions", x => x.id);
                    table.ForeignKey(
                        name: "FK_mobile_account_sessions_mobile_accounts_mobile_account_id",
                        column: x => x.mobile_account_id,
                        principalTable: "mobile_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_mobile_account_employee_bindings_account_employee",
                table: "mobile_account_employee_bindings",
                columns: new[] { "mobile_account_id", "employee_id", "detached_at" });

            migrationBuilder.CreateIndex(
                name: "ix_mobile_account_employee_bindings_employee",
                table: "mobile_account_employee_bindings",
                column: "employee_id");

            migrationBuilder.CreateIndex(
                name: "ix_mobile_account_sessions_account_seen",
                table: "mobile_account_sessions",
                columns: new[] { "mobile_account_id", "last_seen_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "mobile_account_employee_bindings");

            migrationBuilder.DropTable(
                name: "mobile_account_sessions");

            migrationBuilder.DropColumn(
                name: "actor",
                table: "mobile_account_audit_events");
        }
    }
}
