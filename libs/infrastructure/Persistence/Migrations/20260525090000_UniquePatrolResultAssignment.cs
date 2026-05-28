using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(Patrol360DbContext))]
    [Migration("20260525090000_UniquePatrolResultAssignment")]
    public partial class UniquePatrolResultAssignment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_patrol_results_assignment_id",
                table: "patrol_results");

            migrationBuilder.CreateIndex(
                name: "ux_patrol_results_assignment_id",
                table: "patrol_results",
                column: "assignment_id",
                unique: true,
                filter: "assignment_id IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_patrol_results_assignment_id",
                table: "patrol_results");

            migrationBuilder.CreateIndex(
                name: "IX_patrol_results_assignment_id",
                table: "patrol_results",
                column: "assignment_id");
        }
    }
}
