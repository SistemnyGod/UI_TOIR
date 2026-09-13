using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PpeIssueDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_inventory_ppe_norm_sets_position_version",
                schema: "inventory",
                table: "ppe_norm_sets");

            migrationBuilder.AlterColumn<string>(
                name: "position_name",
                schema: "inventory",
                table: "ppe_norm_sets",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);

            migrationBuilder.AddColumn<string>(
                name: "department_name",
                schema: "inventory",
                table: "ppe_norm_sets",
                type: "character varying(500)",
                maxLength: 500,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "position_aliases_json",
                schema: "inventory",
                table: "ppe_norm_sets",
                type: "jsonb",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<bool>(
                name: "scope_confirmed",
                schema: "inventory",
                table: "ppe_norm_sets",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "alternative_group",
                schema: "inventory",
                table: "ppe_norm_rows",
                type: "character varying(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "period_months",
                schema: "inventory",
                table: "ppe_norm_rows",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "requirement_key",
                schema: "inventory",
                table: "ppe_norm_rows",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<string>(
                name: "unit_symbol",
                schema: "inventory",
                table: "ppe_norm_rows",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "approval_evidence",
                schema: "inventory",
                table: "ppe_norm_catalog_mappings",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "approved_by",
                schema: "inventory",
                table: "ppe_norm_catalog_mappings",
                type: "character varying(240)",
                maxLength: 240,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "is_approved",
                schema: "inventory",
                table: "ppe_norm_catalog_mappings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "norm_units_per_item",
                schema: "inventory",
                table: "ppe_norm_catalog_mappings",
                type: "numeric(18,6)",
                precision: 18,
                scale: 6,
                nullable: false,
                defaultValue: 1m);

            migrationBuilder.AddColumn<DateOnly>(
                name: "issue_date",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "issue_document_id",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "norm_units_per_item",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "numeric(18,6)",
                precision: 18,
                scale: 6,
                nullable: false,
                defaultValue: 1m);

            migrationBuilder.AddColumn<Guid>(
                name: "requirement_key",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "uuid",
                nullable: true);

            // Give old requirements stable identities without guessing periods or historical issue dates.
            migrationBuilder.Sql("UPDATE inventory.ppe_norm_rows SET requirement_key = id");

            migrationBuilder.CreateTable(
                name: "ppe_issue_documents",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                    norm_set_id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_card_id = table.Column<Guid>(type: "uuid", nullable: true),
                    version = table.Column<long>(type: "bigint", nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    content_json = table.Column<string>(type: "jsonb", nullable: false),
                    validation_json = table.Column<string>(type: "jsonb", nullable: false),
                    idempotency_key = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    confirmed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_by = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ppe_issue_documents", x => x.id);
                    table.ForeignKey(
                        name: "FK_ppe_issue_documents_employees_employee_id",
                        column: x => x.employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ppe_issue_documents_ppe_norm_sets_norm_set_id",
                        column: x => x.norm_set_id,
                        principalSchema: "inventory",
                        principalTable: "ppe_norm_sets",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ux_inventory_ppe_norm_sets_scope_version",
                schema: "inventory",
                table: "ppe_norm_sets",
                columns: new[] { "department_name", "position_name", "version_name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ppe_card_lines_issue_document_id",
                schema: "inventory",
                table: "ppe_card_lines",
                column: "issue_document_id");

            migrationBuilder.CreateIndex(
                name: "IX_ppe_card_lines_requirement_key_issue_date",
                schema: "inventory",
                table: "ppe_card_lines",
                columns: new[] { "requirement_key", "issue_date" });

            migrationBuilder.CreateIndex(
                name: "IX_ppe_issue_documents_employee_id_created_at",
                schema: "inventory",
                table: "ppe_issue_documents",
                columns: new[] { "employee_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_ppe_issue_documents_idempotency_key",
                schema: "inventory",
                table: "ppe_issue_documents",
                column: "idempotency_key",
                unique: true,
                filter: "idempotency_key IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ppe_issue_documents_legacy_card_id",
                schema: "inventory",
                table: "ppe_issue_documents",
                column: "legacy_card_id",
                unique: true,
                filter: "legacy_card_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ppe_issue_documents_norm_set_id",
                schema: "inventory",
                table: "ppe_issue_documents",
                column: "norm_set_id");

            migrationBuilder.AddForeignKey(
                name: "FK_ppe_card_lines_ppe_issue_documents_issue_document_id",
                schema: "inventory",
                table: "ppe_card_lines",
                column: "issue_document_id",
                principalSchema: "inventory",
                principalTable: "ppe_issue_documents",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ppe_card_lines_ppe_issue_documents_issue_document_id",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropTable(
                name: "ppe_issue_documents",
                schema: "inventory");

            migrationBuilder.DropIndex(
                name: "ux_inventory_ppe_norm_sets_scope_version",
                schema: "inventory",
                table: "ppe_norm_sets");

            migrationBuilder.DropIndex(
                name: "IX_ppe_card_lines_issue_document_id",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropIndex(
                name: "IX_ppe_card_lines_requirement_key_issue_date",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropColumn(
                name: "department_name",
                schema: "inventory",
                table: "ppe_norm_sets");

            migrationBuilder.DropColumn(
                name: "position_aliases_json",
                schema: "inventory",
                table: "ppe_norm_sets");

            migrationBuilder.DropColumn(
                name: "scope_confirmed",
                schema: "inventory",
                table: "ppe_norm_sets");

            migrationBuilder.DropColumn(
                name: "alternative_group",
                schema: "inventory",
                table: "ppe_norm_rows");

            migrationBuilder.DropColumn(
                name: "period_months",
                schema: "inventory",
                table: "ppe_norm_rows");

            migrationBuilder.DropColumn(
                name: "requirement_key",
                schema: "inventory",
                table: "ppe_norm_rows");

            migrationBuilder.DropColumn(
                name: "unit_symbol",
                schema: "inventory",
                table: "ppe_norm_rows");

            migrationBuilder.DropColumn(
                name: "approval_evidence",
                schema: "inventory",
                table: "ppe_norm_catalog_mappings");

            migrationBuilder.DropColumn(
                name: "approved_by",
                schema: "inventory",
                table: "ppe_norm_catalog_mappings");

            migrationBuilder.DropColumn(
                name: "is_approved",
                schema: "inventory",
                table: "ppe_norm_catalog_mappings");

            migrationBuilder.DropColumn(
                name: "norm_units_per_item",
                schema: "inventory",
                table: "ppe_norm_catalog_mappings");

            migrationBuilder.DropColumn(
                name: "issue_date",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropColumn(
                name: "issue_document_id",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropColumn(
                name: "norm_units_per_item",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropColumn(
                name: "requirement_key",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.AlterColumn<string>(
                name: "position_name",
                schema: "inventory",
                table: "ppe_norm_sets",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(4000)",
                oldMaxLength: 4000);

            migrationBuilder.CreateIndex(
                name: "ux_inventory_ppe_norm_sets_position_version",
                schema: "inventory",
                table: "ppe_norm_sets",
                columns: new[] { "position_name", "version_name" },
                unique: true);
        }
    }
}
