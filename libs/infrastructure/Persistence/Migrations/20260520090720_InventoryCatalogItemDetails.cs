using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InventoryCatalogItemDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "clothing_size",
                schema: "inventory",
                table: "items",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "glove_size",
                schema: "inventory",
                table: "items",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "head_size",
                schema: "inventory",
                table: "items",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "height_size",
                schema: "inventory",
                table: "items",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "respirator_size",
                schema: "inventory",
                table: "items",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "shoe_size",
                schema: "inventory",
                table: "items",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "clothing_size",
                schema: "inventory",
                table: "items");

            migrationBuilder.DropColumn(
                name: "glove_size",
                schema: "inventory",
                table: "items");

            migrationBuilder.DropColumn(
                name: "head_size",
                schema: "inventory",
                table: "items");

            migrationBuilder.DropColumn(
                name: "height_size",
                schema: "inventory",
                table: "items");

            migrationBuilder.DropColumn(
                name: "respirator_size",
                schema: "inventory",
                table: "items");

            migrationBuilder.DropColumn(
                name: "shoe_size",
                schema: "inventory",
                table: "items");
        }
    }
}
