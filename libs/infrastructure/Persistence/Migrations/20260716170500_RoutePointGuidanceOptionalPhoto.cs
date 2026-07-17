using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260716170500_RoutePointGuidanceOptionalPhoto")]
public partial class RoutePointGuidanceOptionalPhoto : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "description",
            table: "route_points",
            type: "character varying(1000)",
            maxLength: 1000,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<string>(
            name: "instruction",
            table: "route_points",
            type: "character varying(2000)",
            maxLength: 2000,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<string>(
            name: "description",
            table: "route_revision_points",
            type: "character varying(1000)",
            maxLength: 1000,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<string>(
            name: "instruction",
            table: "route_revision_points",
            type: "character varying(2000)",
            maxLength: 2000,
            nullable: false,
            defaultValue: "");

        migrationBuilder.Sql("UPDATE route_points SET requires_photo = FALSE WHERE requires_photo = TRUE;");
        migrationBuilder.Sql("UPDATE route_revision_points SET requires_photo = FALSE WHERE requires_photo = TRUE;");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "description", table: "route_points");
        migrationBuilder.DropColumn(name: "instruction", table: "route_points");
        migrationBuilder.DropColumn(name: "description", table: "route_revision_points");
        migrationBuilder.DropColumn(name: "instruction", table: "route_revision_points");
    }
}
