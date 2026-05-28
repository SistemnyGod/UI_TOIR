using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260525143000_MobileSyncConflictResolutions")]
public partial class MobileSyncConflictResolutions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS mobile_sync_conflict_resolutions (
                client_operation_id character varying(80) NOT NULL,
                status character varying(40) NOT NULL,
                comment character varying(1200) NOT NULL,
                resolved_by character varying(220) NOT NULL,
                resolved_at timestamp with time zone NOT NULL,
                CONSTRAINT "PK_mobile_sync_conflict_resolutions" PRIMARY KEY (client_operation_id)
            );

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'FK_mobile_sync_conflict_resolutions_mobile_outbox_operations_~'
                ) THEN
                    ALTER TABLE mobile_sync_conflict_resolutions
                        ADD CONSTRAINT "FK_mobile_sync_conflict_resolutions_mobile_outbox_operations_~"
                        FOREIGN KEY (client_operation_id)
                        REFERENCES mobile_outbox_operations (client_operation_id)
                        ON DELETE CASCADE;
                END IF;
            END $$;

            CREATE INDEX IF NOT EXISTS ix_mobile_sync_conflict_resolutions_status
                ON mobile_sync_conflict_resolutions (status);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "mobile_sync_conflict_resolutions");
    }
}
