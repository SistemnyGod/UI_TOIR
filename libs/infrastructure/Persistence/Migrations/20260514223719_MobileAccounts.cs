using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MobileAccounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "mobile_accounts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    login = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    password = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    employee_scope = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    bound_employees = table.Column<string[]>(type: "text[]", nullable: false),
                    role = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    status = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    session = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    last_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    device = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    version = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mobile_accounts", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_mobile_accounts_status",
                table: "mobile_accounts",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ux_mobile_accounts_login",
                table: "mobile_accounts",
                column: "login",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "mobile_accounts");
        }
    }
}
