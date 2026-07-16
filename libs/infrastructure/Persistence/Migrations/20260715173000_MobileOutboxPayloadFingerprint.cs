using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260715173000_MobileOutboxPayloadFingerprint")]
public partial class MobileOutboxPayloadFingerprint : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "payload_fingerprint",
            table: "mobile_outbox_operations",
            type: "character varying(64)",
            maxLength: 64,
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "ix_mobile_outbox_operations_complete_fingerprint",
            table: "mobile_outbox_operations",
            columns: new[] { "mobile_account_id", "command_type", "entity_server_id", "status", "payload_fingerprint" },
            filter: "payload_fingerprint IS NOT NULL");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_mobile_outbox_operations_complete_fingerprint",
            table: "mobile_outbox_operations");

        migrationBuilder.DropColumn(
            name: "payload_fingerprint",
            table: "mobile_outbox_operations");
    }
}
