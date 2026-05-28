using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260522220500_InventoryEmployeesUsersFilters")]
public partial class InventoryEmployeesUsersFilters : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateIndex(
            name: "ix_employees_department",
            table: "employees",
            column: "department");

        migrationBuilder.CreateIndex(
            name: "ix_employees_employee_group",
            table: "employees",
            column: "employee_group");

        migrationBuilder.CreateIndex(
            name: "ix_site_users_display_name",
            table: "site_users",
            column: "display_name");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_site_users_display_name",
            table: "site_users");

        migrationBuilder.DropIndex(
            name: "ix_employees_employee_group",
            table: "employees");

        migrationBuilder.DropIndex(
            name: "ix_employees_department",
            table: "employees");
    }
}
