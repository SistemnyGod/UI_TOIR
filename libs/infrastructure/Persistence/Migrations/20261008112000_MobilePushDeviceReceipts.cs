using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20261008112000_MobilePushDeviceReceipts")]
public sealed class MobilePushDeviceReceipts : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) =>
        migrationBuilder.AddColumn<string[]>(
            name: "push_delivered_token_hashes",
            table: "mobile_notifications",
            type: "text[]",
            nullable: false,
            defaultValueSql: "ARRAY[]::text[]");

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropColumn(name: "push_delivered_token_hashes", table: "mobile_notifications");
}
