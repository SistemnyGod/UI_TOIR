using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260728100000_MobileRefreshReplayIdempotency")]
public partial class MobileRefreshReplayIdempotency : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "client_operation_id",
            table: "mobile_refresh_token_histories",
            type: "character varying(120)",
            maxLength: 120,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "access_token_protected",
            table: "mobile_refresh_token_histories",
            type: "character varying(4096)",
            maxLength: 4096,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "refresh_token_protected",
            table: "mobile_refresh_token_histories",
            type: "character varying(4096)",
            maxLength: 4096,
            nullable: true);

        migrationBuilder.AddColumn<DateTimeOffset>(
            name: "access_token_expires_at",
            table: "mobile_refresh_token_histories",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.AddColumn<DateTimeOffset>(
            name: "refresh_token_expires_at",
            table: "mobile_refresh_token_histories",
            type: "timestamp with time zone",
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "client_operation_id", table: "mobile_refresh_token_histories");
        migrationBuilder.DropColumn(name: "access_token_protected", table: "mobile_refresh_token_histories");
        migrationBuilder.DropColumn(name: "refresh_token_protected", table: "mobile_refresh_token_histories");
        migrationBuilder.DropColumn(name: "access_token_expires_at", table: "mobile_refresh_token_histories");
        migrationBuilder.DropColumn(name: "refresh_token_expires_at", table: "mobile_refresh_token_histories");
    }
}