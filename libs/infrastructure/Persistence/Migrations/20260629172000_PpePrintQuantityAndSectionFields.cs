using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(Patrol360DbContext))]
    [Migration("20260629172000_PpePrintQuantityAndSectionFields")]
    /// <inheritdoc />
    public partial class PpePrintQuantityAndSectionFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "quantity_text",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_section_title",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_section_title",
                schema: "inventory",
                table: "position_norms",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "is_section_title",
                schema: "inventory",
                table: "position_norms");

            migrationBuilder.DropColumn(
                name: "is_section_title",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropColumn(
                name: "quantity_text",
                schema: "inventory",
                table: "ppe_card_lines");
        }
    }
}
