using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260716115000_MobileWorkTaskFileScope")]
public partial class MobileWorkTaskFileScope : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "work_task_id",
            table: "mobile_uploaded_files",
            type: "uuid",
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "ix_mobile_uploaded_files_account_work_task",
            table: "mobile_uploaded_files",
            columns: ["mobile_account_id", "work_task_id"]);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_mobile_uploaded_files_account_work_task",
            table: "mobile_uploaded_files");

        migrationBuilder.DropColumn(
            name: "work_task_id",
            table: "mobile_uploaded_files");
    }
}
