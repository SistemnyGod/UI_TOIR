using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260602190000_EmuEmployeeShifts")]
public partial class EmuEmployeeShifts : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "emu_shift_templates",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                code = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                shift_type = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                start_time = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                end_time = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                lunch_start_time = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                lunch_end_time = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                crosses_midnight = table.Column<bool>(type: "boolean", nullable: false),
                is_active = table.Column<bool>(type: "boolean", nullable: false),
                sort_order = table.Column<int>(type: "integer", nullable: false),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_emu_shift_templates", x => x.id);
            });

        migrationBuilder.CreateTable(
            name: "emu_employee_shifts",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                shift_date = table.Column<DateOnly>(type: "date", nullable: false),
                template_id = table.Column<Guid>(type: "uuid", nullable: true),
                shift_type = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                planned_start_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                planned_end_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                actual_start_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                actual_end_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                lunch_start_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                lunch_end_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                lunch_taken = table.Column<bool>(type: "boolean", nullable: false),
                lunch_overridden = table.Column<bool>(type: "boolean", nullable: false),
                source = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                comment = table.Column<string>(type: "character varying(1400)", maxLength: 1400, nullable: false),
                reason = table.Column<string>(type: "character varying(1400)", maxLength: 1400, nullable: false),
                adjusted_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                adjusted_by_name = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: false),
                adjusted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                row_version = table.Column<int>(type: "integer", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_emu_employee_shifts", x => x.id);
                table.ForeignKey(
                    name: "fk_emu_employee_shifts_employees_employee_id",
                    column: x => x.employee_id,
                    principalTable: "employees",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    name: "fk_emu_employee_shifts_emu_shift_templates_template_id",
                    column: x => x.template_id,
                    principalTable: "emu_shift_templates",
                    principalColumn: "id",
                    onDelete: ReferentialAction.SetNull);
                table.ForeignKey(
                    name: "fk_emu_employee_shifts_site_users_adjusted_by_user_id",
                    column: x => x.adjusted_by_user_id,
                    principalTable: "site_users",
                    principalColumn: "id",
                    onDelete: ReferentialAction.SetNull);
            });

        migrationBuilder.CreateIndex(
            name: "ix_emu_employee_shifts_date",
            table: "emu_employee_shifts",
            column: "shift_date");

        migrationBuilder.CreateIndex(
            name: "ix_emu_employee_shifts_source",
            table: "emu_employee_shifts",
            column: "source");

        migrationBuilder.CreateIndex(
            name: "ix_emu_employee_shifts_template_id",
            table: "emu_employee_shifts",
            column: "template_id");

        migrationBuilder.CreateIndex(
            name: "ix_emu_employee_shifts_adjusted_by_user_id",
            table: "emu_employee_shifts",
            column: "adjusted_by_user_id");

        migrationBuilder.CreateIndex(
            name: "ux_emu_employee_shifts_employee_date",
            table: "emu_employee_shifts",
            columns: new[] { "employee_id", "shift_date" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_emu_shift_templates_active",
            table: "emu_shift_templates",
            column: "is_active");

        migrationBuilder.CreateIndex(
            name: "ux_emu_shift_templates_code",
            table: "emu_shift_templates",
            column: "code",
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "emu_employee_shifts");
        migrationBuilder.DropTable(name: "emu_shift_templates");
    }
}
