using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260526090000_MobileNotificationPushDiagnostics")]
public partial class MobileNotificationPushDiagnostics : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "push_attempt_count",
            table: "mobile_notifications",
            type: "integer",
            nullable: false,
            defaultValue: 0);

        migrationBuilder.AddColumn<string>(
            name: "push_last_error",
            table: "mobile_notifications",
            type: "character varying(1200)",
            maxLength: 1200,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<DateTimeOffset>(
            name: "push_sent_at",
            table: "mobile_notifications",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.AddColumn<DateTimeOffset>(
            name: "push_claimed_at",
            table: "mobile_notifications",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "ix_mobile_notifications_push_status_created",
            table: "mobile_notifications",
            columns: new[] { "push_status", "created_at" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "ix_mobile_notifications_push_status_created", table: "mobile_notifications");
        migrationBuilder.DropColumn(name: "push_claimed_at", table: "mobile_notifications");
        migrationBuilder.DropColumn(name: "push_attempt_count", table: "mobile_notifications");
        migrationBuilder.DropColumn(name: "push_last_error", table: "mobile_notifications");
        migrationBuilder.DropColumn(name: "push_sent_at", table: "mobile_notifications");
    }
}
