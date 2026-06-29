using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(Patrol360DbContext))]
    [Migration("20260625133000_PpeCardEmployeeDetails")]
    /// <inheritdoc />
    public partial class PpeCardEmployeeDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "gender",
                schema: "inventory",
                table: "ppe_cards",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "height",
                schema: "inventory",
                table: "ppe_cards",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "clothing_size",
                schema: "inventory",
                table: "ppe_cards",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "shoe_size",
                schema: "inventory",
                table: "ppe_cards",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "head_size",
                schema: "inventory",
                table: "ppe_cards",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "respirator_size",
                schema: "inventory",
                table: "ppe_cards",
                type: "character varying(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "hand_protection_size",
                schema: "inventory",
                table: "ppe_cards",
                type: "character varying(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "gender", schema: "inventory", table: "ppe_cards");
            migrationBuilder.DropColumn(name: "height", schema: "inventory", table: "ppe_cards");
            migrationBuilder.DropColumn(name: "clothing_size", schema: "inventory", table: "ppe_cards");
            migrationBuilder.DropColumn(name: "shoe_size", schema: "inventory", table: "ppe_cards");
            migrationBuilder.DropColumn(name: "head_size", schema: "inventory", table: "ppe_cards");
            migrationBuilder.DropColumn(name: "respirator_size", schema: "inventory", table: "ppe_cards");
            migrationBuilder.DropColumn(name: "hand_protection_size", schema: "inventory", table: "ppe_cards");
        }
    }
}
