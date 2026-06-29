using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    [Migration("20260608120000_SiteUserAccessScopes")]
    public partial class SiteUserAccessScopes : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "site_user_access_scopes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    site_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    module_key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    scope_type = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    scope_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by_user_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_site_user_access_scopes", x => x.id);
                    table.ForeignKey(
                        name: "fk_site_user_access_scopes_site_users_site_user_id",
                        column: x => x.site_user_id,
                        principalTable: "site_users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_site_user_access_scopes_scope",
                table: "site_user_access_scopes",
                columns: new[] { "module_key", "scope_type", "scope_id" });

            migrationBuilder.CreateIndex(
                name: "ux_site_user_access_scopes_user_scope",
                table: "site_user_access_scopes",
                columns: new[] { "site_user_id", "module_key", "scope_type", "scope_id" },
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "site_user_access_scopes");
        }
    }
}
