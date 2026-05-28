using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260520165000_InventoryLegacyImport")]
public partial class InventoryLegacyImport : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "legacy_import_runs",
            schema: "inventory",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                dry_run = table.Column<bool>(type: "boolean", nullable: false),
                status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                tables_scanned = table.Column<int>(type: "integer", nullable: false),
                rows_read = table.Column<int>(type: "integer", nullable: false),
                rows_inserted = table.Column<int>(type: "integer", nullable: false),
                rows_updated = table.Column<int>(type: "integer", nullable: false),
                rows_skipped = table.Column<int>(type: "integer", nullable: false),
                error = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                stock_checksum = table.Column<string>(type: "jsonb", nullable: false),
                tables_json = table.Column<string>(type: "jsonb", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_legacy_import_runs", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "employee_legacy_links",
            schema: "inventory",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                legacy_id = table.Column<int>(type: "integer", nullable: false),
                employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                source_key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_employee_legacy_links", x => x.id);
                table.ForeignKey(
                    name: "FK_employee_legacy_links_employees_employee_id",
                    column: x => x.employee_id,
                    principalTable: "employees",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "user_legacy_links",
            schema: "inventory",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                legacy_id = table.Column<int>(type: "integer", nullable: false),
                user_id = table.Column<Guid>(type: "uuid", nullable: false),
                source_key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_user_legacy_links", x => x.id);
                table.ForeignKey(
                    name: "FK_user_legacy_links_site_users_user_id",
                    column: x => x.user_id,
                    principalTable: "site_users",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "ix_inventory_legacy_import_runs_created",
            schema: "inventory",
            table: "legacy_import_runs",
            column: "created_at");

        migrationBuilder.CreateIndex(
            name: "ix_inventory_employee_legacy_links_employee",
            schema: "inventory",
            table: "employee_legacy_links",
            column: "employee_id");

        migrationBuilder.CreateIndex(
            name: "ux_inventory_employee_legacy_links_source_legacy",
            schema: "inventory",
            table: "employee_legacy_links",
            columns: new[] { "source_key", "legacy_id" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_inventory_user_legacy_links_user",
            schema: "inventory",
            table: "user_legacy_links",
            column: "user_id");

        migrationBuilder.CreateIndex(
            name: "ux_inventory_user_legacy_links_source_legacy",
            schema: "inventory",
            table: "user_legacy_links",
            columns: new[] { "source_key", "legacy_id" },
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "employee_legacy_links", schema: "inventory");
        migrationBuilder.DropTable(name: "user_legacy_links", schema: "inventory");
        migrationBuilder.DropTable(name: "legacy_import_runs", schema: "inventory");
    }
}
