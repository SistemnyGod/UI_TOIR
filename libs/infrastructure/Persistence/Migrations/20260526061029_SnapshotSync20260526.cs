using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SnapshotSync20260526 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Snapshot-only migration. Previous hand-written migrations already create the schema.
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Snapshot-only migration. No schema changes to revert.
        }
    }
}
