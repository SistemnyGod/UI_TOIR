using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

/// <inheritdoc />
[DbContext(typeof(Patrol360DbContext))]
[Migration("20260921114500_MobilePatrolAppealConversation")]
public partial class MobilePatrolAppealConversation : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "IX_mobile_patrol_appeals_AssignmentId_Kind", table: "mobile_patrol_appeals");
        migrationBuilder.CreateIndex(
            name: "IX_mobile_patrol_appeals_AssignmentId_Kind",
            table: "mobile_patrol_appeals",
            columns: new[] { "AssignmentId", "Kind" },
            unique: true,
            filter: "\"Status\" = 'open' AND \"Kind\" = 'cancel'");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "IX_mobile_patrol_appeals_AssignmentId_Kind", table: "mobile_patrol_appeals");
        migrationBuilder.CreateIndex(
            name: "IX_mobile_patrol_appeals_AssignmentId_Kind",
            table: "mobile_patrol_appeals",
            columns: new[] { "AssignmentId", "Kind" },
            unique: true,
            filter: "\"Status\" = 'open'");
    }
}
