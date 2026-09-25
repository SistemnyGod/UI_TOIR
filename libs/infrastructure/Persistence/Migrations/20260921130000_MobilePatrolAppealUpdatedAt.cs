using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

/// <inheritdoc />
[DbContext(typeof(Patrol360DbContext))]
[Migration("20260921130000_MobilePatrolAppealUpdatedAt")]
public partial class MobilePatrolAppealUpdatedAt : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTimeOffset>(
            name: "UpdatedAt",
            table: "mobile_patrol_appeals",
            type: "timestamp with time zone",
            nullable: false,
            defaultValueSql: "CURRENT_TIMESTAMP");

        migrationBuilder.Sql("UPDATE mobile_patrol_appeals SET \"UpdatedAt\" = \"CreatedAt\"");

        migrationBuilder.CreateIndex(
            name: "IX_mobile_patrol_appeals_MobileAccountId_UpdatedAt",
            table: "mobile_patrol_appeals",
            columns: new[] { "MobileAccountId", "UpdatedAt" });

        migrationBuilder.CreateIndex(
            name: "IX_mobile_patrol_appeals_Status_UpdatedAt",
            table: "mobile_patrol_appeals",
            columns: new[] { "Status", "UpdatedAt" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "IX_mobile_patrol_appeals_MobileAccountId_UpdatedAt",
            table: "mobile_patrol_appeals");

        migrationBuilder.DropIndex(
            name: "IX_mobile_patrol_appeals_Status_UpdatedAt",
            table: "mobile_patrol_appeals");

        migrationBuilder.DropColumn(
            name: "UpdatedAt",
            table: "mobile_patrol_appeals");
    }
}
