using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260530094000_AssignmentServerSettings")]
public partial class AssignmentServerSettings : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "assignment_settings",
            columns: table => new
            {
                id = table.Column<int>(type: "integer", nullable: false),
                day_start = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                day_end = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                night_start = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                night_end = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: false),
                updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_assignment_settings", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "assignment_favorite_employees",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                sort_order = table.Column<int>(type: "integer", nullable: false),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_assignment_favorite_employees", x => x.id);
                table.ForeignKey(
                    name: "FK_assignment_favorite_employees_employees_employee_id",
                    column: x => x.employee_id,
                    principalTable: "employees",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "ix_assignment_favorite_employees_sort",
            table: "assignment_favorite_employees",
            column: "sort_order");

        migrationBuilder.CreateIndex(
            name: "ux_assignment_favorite_employees_employee",
            table: "assignment_favorite_employees",
            column: "employee_id",
            unique: true);

        migrationBuilder.Sql("""
            INSERT INTO assignment_settings (id, day_start, day_end, night_start, night_end, updated_at)
            VALUES (1, '08:00', '20:00', '20:00', '08:00', now())
            ON CONFLICT (id) DO NOTHING;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "assignment_favorite_employees");
        migrationBuilder.DropTable(name: "assignment_settings");
    }
}
