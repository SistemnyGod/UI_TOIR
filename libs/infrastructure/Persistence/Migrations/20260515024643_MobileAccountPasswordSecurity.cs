using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MobileAccountPasswordSecurity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "password",
                table: "mobile_accounts");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "last_password_reset_at",
                table: "mobile_accounts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "password_hash",
                table: "mobile_accounts",
                type: "character varying(512)",
                maxLength: 512,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "password_reset_required",
                table: "mobile_accounts",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateTable(
                name: "mobile_account_audit_events",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    mobile_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    action = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    details = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mobile_account_audit_events", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_mobile_account_audit_account_created",
                table: "mobile_account_audit_events",
                columns: new[] { "mobile_account_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_mobile_account_audit_action",
                table: "mobile_account_audit_events",
                column: "action");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "mobile_account_audit_events");

            migrationBuilder.DropColumn(
                name: "last_password_reset_at",
                table: "mobile_accounts");

            migrationBuilder.DropColumn(
                name: "password_hash",
                table: "mobile_accounts");

            migrationBuilder.DropColumn(
                name: "password_reset_required",
                table: "mobile_accounts");

            migrationBuilder.AddColumn<string>(
                name: "password",
                table: "mobile_accounts",
                type: "character varying(160)",
                maxLength: 160,
                nullable: false,
                defaultValue: "");
        }
    }
}
