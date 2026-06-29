using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(Patrol360DbContext))]
    [Migration("20260625120000_PpeLineBrandModelArticle")]
    /// <inheritdoc />
    public partial class PpeLineBrandModelArticle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "brand_model_article",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "character varying(600)",
                maxLength: 600,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql("""
                UPDATE inventory.ppe_card_lines lines
                SET brand_model_article = LEFT(
                    array_to_string(
                        array_remove(ARRAY[
                            NULLIF(items.brand_name, ''),
                            NULLIF(items.model_name, ''),
                            NULLIF(items.article, ''),
                            NULLIF(items.protection_class, '')
                        ], NULL),
                        ' / '
                    ),
                    600)
                FROM inventory.items items
                WHERE lines.item_id = items.id
                  AND NULLIF(lines.brand_model_article, '') IS NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "brand_model_article",
                schema: "inventory",
                table: "ppe_card_lines");
        }
    }
}
