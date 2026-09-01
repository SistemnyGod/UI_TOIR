using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260813090000_PatrolRequestCancellationHistory")]
public partial class PatrolRequestCancellationHistory : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>("cancellation_reason_code", "patrol_requests", "character varying(60)", maxLength: 60, nullable: true);
        migrationBuilder.AddColumn<string>("cancellation_reason_text", "patrol_requests", "character varying(1000)", maxLength: 1000, nullable: true);
        migrationBuilder.AddColumn<DateTimeOffset>("cancelled_at", "patrol_requests", "timestamp with time zone", nullable: true);
        migrationBuilder.AddColumn<Guid>("cancelled_by_user_id", "patrol_requests", "uuid", nullable: true);
        migrationBuilder.AddColumn<string>("cancelled_by_user_name", "patrol_requests", "character varying(220)", maxLength: 220, nullable: true);

        migrationBuilder.CreateTable(
            name: "patrol_request_history_events",
            columns: table => new
            {
                id = table.Column<Guid>("uuid", nullable: false),
                patrol_request_id = table.Column<Guid>("uuid", nullable: false),
                event_type = table.Column<string>("character varying(80)", maxLength: 80, nullable: false),
                from_status = table.Column<string>("character varying(60)", maxLength: 60, nullable: false),
                to_status = table.Column<string>("character varying(60)", maxLength: 60, nullable: false),
                details = table.Column<string>("character varying(1500)", maxLength: 1500, nullable: false),
                actor_user_id = table.Column<Guid>("uuid", nullable: true),
                actor_name = table.Column<string>("character varying(220)", maxLength: 220, nullable: false),
                created_at = table.Column<DateTimeOffset>("timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_patrol_request_history_events", x => x.id);
                table.ForeignKey("fk_patrol_request_history_events_patrol_requests_patrol_request_id", x => x.patrol_request_id, "patrol_requests", "id", onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex("ix_patrol_request_history_events_request_created", "patrol_request_history_events", new[] { "patrol_request_id", "created_at" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("patrol_request_history_events");
        migrationBuilder.DropColumn("cancellation_reason_code", "patrol_requests");
        migrationBuilder.DropColumn("cancellation_reason_text", "patrol_requests");
        migrationBuilder.DropColumn("cancelled_at", "patrol_requests");
        migrationBuilder.DropColumn("cancelled_by_user_id", "patrol_requests");
        migrationBuilder.DropColumn("cancelled_by_user_name", "patrol_requests");
    }
}
