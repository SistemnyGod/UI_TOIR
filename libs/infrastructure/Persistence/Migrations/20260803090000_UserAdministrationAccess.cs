using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260803090000_UserAdministrationAccess")]
public partial class UserAdministrationAccess : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "require_password_change",
            table: "site_users",
            type: "boolean",
            nullable: false,
            defaultValue: false);

        migrationBuilder.AddColumn<string>(
            name: "effect",
            table: "site_user_permissions",
            type: "character varying(16)",
            maxLength: 16,
            nullable: false,
            defaultValue: "allow");

        migrationBuilder.AddColumn<string>(
            name: "module_key",
            table: "permissions",
            type: "character varying(80)",
            maxLength: 80,
            nullable: false,
            defaultValue: "system");

        migrationBuilder.AddColumn<string>(
            name: "category",
            table: "permissions",
            type: "character varying(80)",
            maxLength: 80,
            nullable: false,
            defaultValue: "actions");

        migrationBuilder.AddColumn<bool>(
            name: "is_view_default",
            table: "permissions",
            type: "boolean",
            nullable: false,
            defaultValue: false);

        migrationBuilder.AddColumn<int>(
            name: "display_order",
            table: "permissions",
            type: "integer",
            nullable: false,
            defaultValue: 0);

        migrationBuilder.AddColumn<int>(
            name: "sort_order",
            table: "site_user_access_scopes",
            type: "integer",
            nullable: false,
            defaultValue: 0);

        migrationBuilder.AddColumn<string>(
            name: "ip_address",
            table: "site_user_sessions",
            type: "character varying(120)",
            maxLength: 120,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "user_agent",
            table: "site_user_sessions",
            type: "character varying(512)",
            maxLength: 512,
            nullable: true);

        migrationBuilder.AddColumn<DateTimeOffset>(
            name: "last_seen_at",
            table: "site_user_sessions",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.CreateTable(
            name: "site_user_audit_events",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                site_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                actor_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                actor_name = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: true),
                event_type = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                module_key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                details = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                before_json = table.Column<string>(type: "jsonb", nullable: true),
                after_json = table.Column<string>(type: "jsonb", nullable: true),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                ip_address = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                user_agent = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_site_user_audit_events", x => x.id);
                table.ForeignKey(
                    name: "fk_site_user_audit_events_site_users_site_user_id",
                    column: x => x.site_user_id,
                    principalTable: "site_users",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "ix_site_user_audit_user_created",
            table: "site_user_audit_events",
            columns: new[] { "site_user_id", "created_at" });

        migrationBuilder.CreateIndex(
            name: "ix_site_user_audit_type_created",
            table: "site_user_audit_events",
            columns: new[] { "event_type", "created_at" });

        migrationBuilder.Sql("""
            UPDATE permissions
            SET module_key = CASE
                WHEN code LIKE 'emu.%' THEN 'emu'
                WHEN code LIKE 'inventory.%' THEN 'inventory'
                WHEN code LIKE 'integrations.perco.%' THEN 'perco'
                WHEN code LIKE 'site_users.%' OR code LIKE 'system_%' THEN 'administration'
                ELSE 'patrol'
            END,
            category = CASE
                WHEN code LIKE '%.read' OR code LIKE '%.view' OR code IN ('dashboard.read', 'results.read') THEN 'view'
                WHEN code LIKE '%.export' OR code LIKE '%.audit.view' THEN 'audit'
                WHEN code LIKE '%.manage' OR code LIKE '%.write' OR code LIKE '%.create' OR code LIKE '%.update' OR code LIKE '%.complete' THEN 'actions'
                ELSE 'administration'
            END,
            is_view_default = CASE
                WHEN code LIKE '%.read' OR code LIKE '%.view' OR code IN ('dashboard.read', 'results.read') THEN TRUE
                ELSE FALSE
            END
        """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "site_user_audit_events");
        migrationBuilder.DropColumn(name: "require_password_change", table: "site_users");
        migrationBuilder.DropColumn(name: "effect", table: "site_user_permissions");
        migrationBuilder.DropColumn(name: "module_key", table: "permissions");
        migrationBuilder.DropColumn(name: "category", table: "permissions");
        migrationBuilder.DropColumn(name: "is_view_default", table: "permissions");
        migrationBuilder.DropColumn(name: "display_order", table: "permissions");
        migrationBuilder.DropColumn(name: "sort_order", table: "site_user_access_scopes");
        migrationBuilder.DropColumn(name: "ip_address", table: "site_user_sessions");
        migrationBuilder.DropColumn(name: "user_agent", table: "site_user_sessions");
        migrationBuilder.DropColumn(name: "last_seen_at", table: "site_user_sessions");
    }
}