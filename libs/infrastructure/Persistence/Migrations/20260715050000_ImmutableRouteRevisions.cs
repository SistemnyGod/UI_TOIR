using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260715050000_ImmutableRouteRevisions")]
public partial class ImmutableRouteRevisions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "route_revisions",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false), route_id = table.Column<Guid>(type: "uuid", nullable: false),
                version_no = table.Column<int>(type: "integer", nullable: false), name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                territory = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false), created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table => { table.PrimaryKey("PK_route_revisions", x => x.id); table.ForeignKey("FK_route_revisions_routes_route_id", x => x.route_id, "routes", "id", onDelete: ReferentialAction.Restrict); });
        migrationBuilder.CreateTable(
            name: "route_revision_points",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false), route_revision_id = table.Column<Guid>(type: "uuid", nullable: false), source_route_point_id = table.Column<Guid>(type: "uuid", nullable: false),
                seq_no = table.Column<int>(type: "integer", nullable: false), name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false), zone = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                point_type = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false), tag = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false), nfc_code = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                is_required = table.Column<bool>(type: "boolean", nullable: false), requires_photo = table.Column<bool>(type: "boolean", nullable: false), status = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false)
            },
            constraints: table => { table.PrimaryKey("PK_route_revision_points", x => x.id); table.ForeignKey("FK_route_revision_points_route_revisions_route_revision_id", x => x.route_revision_id, "route_revisions", "id", onDelete: ReferentialAction.Cascade); });
        migrationBuilder.AddColumn<Guid>("route_revision_id", "assignments", type: "uuid", nullable: true);
        migrationBuilder.CreateIndex("ux_route_revisions_route_version", "route_revisions", new[] { "route_id", "version_no" }, unique: true);
        migrationBuilder.CreateIndex("ux_route_revision_points_revision_seq", "route_revision_points", new[] { "route_revision_id", "seq_no" }, unique: true);
        migrationBuilder.CreateIndex("ux_route_revision_points_revision_source", "route_revision_points", new[] { "route_revision_id", "source_route_point_id" }, unique: true);
        migrationBuilder.CreateIndex("ix_assignments_route_revision_id", "assignments", "route_revision_id");
        migrationBuilder.Sql("""
            INSERT INTO route_revisions (id, route_id, version_no, name, territory, created_at)
            SELECT gen_random_uuid(), r.id, r.version_no, r.name, r.territory, NOW() FROM routes r;
            INSERT INTO route_revision_points (id, route_revision_id, source_route_point_id, seq_no, name, zone, point_type, tag, nfc_code, is_required, requires_photo, status)
            SELECT gen_random_uuid(), rr.id, p.id, p.seq_no, p.name, p.zone, p.point_type, p.tag, p.nfc_code, p.is_required, p.requires_photo, p.status
            FROM route_points p JOIN route_revisions rr ON rr.route_id = p.route_id;
            UPDATE assignments a SET route_revision_id = rr.id FROM route_revisions rr
            WHERE rr.route_id = a.route_id AND rr.version_no = a.route_version_no;
            """);
        migrationBuilder.AddForeignKey("FK_assignments_route_revisions_route_revision_id", "assignments", "route_revision_id", "route_revisions", principalColumn: "id", onDelete: ReferentialAction.Restrict);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey("FK_assignments_route_revisions_route_revision_id", "assignments");
        migrationBuilder.DropTable("route_revision_points"); migrationBuilder.DropTable("route_revisions");
        migrationBuilder.DropIndex("ix_assignments_route_revision_id", "assignments"); migrationBuilder.DropColumn("route_revision_id", "assignments");
    }
}
