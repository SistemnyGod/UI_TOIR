using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20261011120000_InventoryOperationReceipts")]
public sealed class InventoryOperationReceipts : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.CreateTable(
        name: "operation_receipts", schema: "inventory",
        columns: table => new
        {
            id = table.Column<Guid>(type: "uuid", nullable: false),
            author_user_id = table.Column<Guid>(type: "uuid", nullable: true),
            payload_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
            response_json = table.Column<string>(type: "jsonb", nullable: false),
            created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
        }, constraints: table => table.PrimaryKey("PK_operation_receipts", row => row.id));

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropTable("operation_receipts", "inventory");
}
