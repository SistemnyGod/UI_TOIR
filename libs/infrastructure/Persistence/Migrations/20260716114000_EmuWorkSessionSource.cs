using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260716114000_EmuWorkSessionSource")]
public partial class EmuWorkSessionSource : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "source",
            table: "emu_work_sessions",
            type: "character varying(40)",
            maxLength: 40,
            nullable: false,
            defaultValue: "web");

        migrationBuilder.CreateIndex(
            name: "ix_emu_work_sessions_source",
            table: "emu_work_sessions",
            column: "source");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "ix_emu_work_sessions_source", table: "emu_work_sessions");
        migrationBuilder.DropColumn(name: "source", table: "emu_work_sessions");
    }
}
