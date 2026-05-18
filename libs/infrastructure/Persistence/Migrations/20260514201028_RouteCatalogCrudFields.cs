using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RouteCatalogCrudFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "distance",
                table: "routes",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "duration",
                table: "routes",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "periodicity",
                table: "routes",
                type: "character varying(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "status",
                table: "routes",
                type: "character varying(60)",
                maxLength: 60,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "territory",
                table: "routes",
                type: "character varying(160)",
                maxLength: 160,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "expected_time",
                table: "route_points",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "interval",
                table: "route_points",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "point_type",
                table: "route_points",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "requires_photo",
                table: "route_points",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "status",
                table: "route_points",
                type: "character varying(60)",
                maxLength: 60,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "tag",
                table: "route_points",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "zone",
                table: "route_points",
                type: "character varying(160)",
                maxLength: 160,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "distance",
                table: "routes");

            migrationBuilder.DropColumn(
                name: "duration",
                table: "routes");

            migrationBuilder.DropColumn(
                name: "periodicity",
                table: "routes");

            migrationBuilder.DropColumn(
                name: "status",
                table: "routes");

            migrationBuilder.DropColumn(
                name: "territory",
                table: "routes");

            migrationBuilder.DropColumn(
                name: "expected_time",
                table: "route_points");

            migrationBuilder.DropColumn(
                name: "interval",
                table: "route_points");

            migrationBuilder.DropColumn(
                name: "point_type",
                table: "route_points");

            migrationBuilder.DropColumn(
                name: "requires_photo",
                table: "route_points");

            migrationBuilder.DropColumn(
                name: "status",
                table: "route_points");

            migrationBuilder.DropColumn(
                name: "tag",
                table: "route_points");

            migrationBuilder.DropColumn(
                name: "zone",
                table: "route_points");
        }
    }
}
