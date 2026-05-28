using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260522130000_AccountingEmployeeDirectory")]
public partial class AccountingEmployeeDirectory : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateOnly>(
            name: "birth_date",
            table: "employees",
            type: "date",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "employee_group",
            table: "employees",
            type: "character varying(120)",
            maxLength: 120,
            nullable: false,
            defaultValue: string.Empty);

        migrationBuilder.AddColumn<DateOnly>(
            name: "hired_at",
            table: "employees",
            type: "date",
            nullable: true);

        migrationBuilder.CreateTable(
            name: "accounting_employee_references",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                kind = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                name = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                is_archived = table.Column<bool>(type: "boolean", nullable: false),
                created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_accounting_employee_references", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_accounting_employee_references_kind_active",
            table: "accounting_employee_references",
            columns: new[] { "kind", "is_archived" });

        migrationBuilder.CreateIndex(
            name: "ux_accounting_employee_references_kind_name",
            table: "accounting_employee_references",
            columns: new[] { "kind", "name" },
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "accounting_employee_references");

        migrationBuilder.DropColumn(
            name: "birth_date",
            table: "employees");

        migrationBuilder.DropColumn(
            name: "employee_group",
            table: "employees");

        migrationBuilder.DropColumn(
            name: "hired_at",
            table: "employees");
    }
}
