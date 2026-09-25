using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

public sealed partial class PpeKitTemplates : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "ux_inventory_ppe_issue_templates_name", schema: "inventory", table: "ppe_issue_templates");
        migrationBuilder.AddColumn<DateTimeOffset>(name: "created_at", schema: "inventory", table: "ppe_issue_templates", type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP");
        migrationBuilder.AddColumn<bool>(name: "is_shared", schema: "inventory", table: "ppe_issue_templates", type: "boolean", nullable: false, defaultValue: false);
        migrationBuilder.AddColumn<Guid>(name: "norm_set_id", schema: "inventory", table: "ppe_issue_templates", type: "uuid", nullable: false, defaultValue: Guid.Empty);
        migrationBuilder.AddColumn<string>(name: "owner_name", schema: "inventory", table: "ppe_issue_templates", type: "character varying(160)", maxLength: 160, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<Guid>(name: "owner_user_id", schema: "inventory", table: "ppe_issue_templates", type: "uuid", nullable: false, defaultValue: Guid.Empty);
        migrationBuilder.AddColumn<DateTimeOffset>(name: "updated_at", schema: "inventory", table: "ppe_issue_templates", type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP");
        migrationBuilder.AddColumn<long>(name: "version", schema: "inventory", table: "ppe_issue_templates", type: "bigint", nullable: false, defaultValue: 1L);
        migrationBuilder.CreateTable(name: "ppe_issue_template_lines", schema: "inventory", columns: table => new
        {
            id = table.Column<Guid>(type: "uuid", nullable: false), template_id = table.Column<Guid>(type: "uuid", nullable: false), norm_row_id = table.Column<Guid>(type: "uuid", nullable: false), item_id = table.Column<Guid>(type: "uuid", nullable: false), item_name = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false), unit_symbol = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false), quantity = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false), life_months = table.Column<int>(type: "integer", nullable: true), unit_price_minor = table.Column<long>(type: "bigint", nullable: true)
        }, constraints: table => { table.PrimaryKey("PK_ppe_issue_template_lines", x => x.id); table.ForeignKey(name: "FK_ppe_issue_template_lines_ppe_issue_templates_template_id", column: x => x.template_id, principalSchema: "inventory", principalTable: "ppe_issue_templates", principalColumn: "id", onDelete: ReferentialAction.Cascade); });
        migrationBuilder.CreateIndex(name: "ix_ppe_issue_templates_owner_archive_updated", schema: "inventory", table: "ppe_issue_templates", columns: new[] { "owner_user_id", "is_archived", "updated_at" });
        migrationBuilder.CreateIndex(name: "ix_ppe_issue_templates_shared_archive_updated", schema: "inventory", table: "ppe_issue_templates", columns: new[] { "is_shared", "is_archived", "updated_at" });
        migrationBuilder.CreateIndex(name: "ux_ppe_issue_template_lines_mapping", schema: "inventory", table: "ppe_issue_template_lines", columns: new[] { "template_id", "norm_row_id", "item_id" }, unique: true);
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "ppe_issue_template_lines", schema: "inventory");
        migrationBuilder.DropIndex(name: "ix_ppe_issue_templates_owner_archive_updated", schema: "inventory", table: "ppe_issue_templates");
        migrationBuilder.DropIndex(name: "ix_ppe_issue_templates_shared_archive_updated", schema: "inventory", table: "ppe_issue_templates");
        migrationBuilder.DropColumn(name: "created_at", schema: "inventory", table: "ppe_issue_templates"); migrationBuilder.DropColumn(name: "is_shared", schema: "inventory", table: "ppe_issue_templates"); migrationBuilder.DropColumn(name: "norm_set_id", schema: "inventory", table: "ppe_issue_templates"); migrationBuilder.DropColumn(name: "owner_name", schema: "inventory", table: "ppe_issue_templates"); migrationBuilder.DropColumn(name: "owner_user_id", schema: "inventory", table: "ppe_issue_templates"); migrationBuilder.DropColumn(name: "updated_at", schema: "inventory", table: "ppe_issue_templates"); migrationBuilder.DropColumn(name: "version", schema: "inventory", table: "ppe_issue_templates");
        migrationBuilder.CreateIndex(name: "ux_inventory_ppe_issue_templates_name", schema: "inventory", table: "ppe_issue_templates", column: "name", unique: true);
    }
}
