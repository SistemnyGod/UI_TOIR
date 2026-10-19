using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20261008140000_PatrolRequestDateOrderIndex")]
public sealed class PatrolRequestDateOrderIndex : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.CreateIndex(
        name: "ix_patrol_requests_created_id",
        table: "patrol_requests",
        columns: ["created_at", "id"],
        descending: [true, true]);

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropIndex(
        name: "ix_patrol_requests_created_id",
        table: "patrol_requests");
}
