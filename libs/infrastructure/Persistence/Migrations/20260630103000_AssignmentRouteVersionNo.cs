using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260630103000_AssignmentRouteVersionNo")]
public partial class AssignmentRouteVersionNo : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "route_version_no",
            table: "assignments",
            type: "integer",
            nullable: false,
            defaultValue: 0);

        // Existing assignments have no reliable historical route version.
        // Keep route_version_no = 0 as a legacy marker; new assignments store
        // the route version at creation and are protected by completion checks.
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "route_version_no",
            table: "assignments");
    }
}
