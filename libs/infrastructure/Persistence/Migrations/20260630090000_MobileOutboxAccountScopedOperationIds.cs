using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260630090000_MobileOutboxAccountScopedOperationIds")]
public partial class MobileOutboxAccountScopedOperationIds : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE mobile_sync_conflict_resolutions
                ADD COLUMN IF NOT EXISTS mobile_account_id uuid;

            UPDATE mobile_sync_conflict_resolutions AS resolution
            SET mobile_account_id = operation.mobile_account_id
            FROM mobile_outbox_operations AS operation
            WHERE resolution.client_operation_id = operation.client_operation_id
              AND resolution.mobile_account_id IS NULL;

            DELETE FROM mobile_sync_conflict_resolutions
            WHERE mobile_account_id IS NULL;

            ALTER TABLE mobile_sync_conflict_resolutions
                ALTER COLUMN mobile_account_id SET NOT NULL;

            -- Older installations used PostgreSQL-generated lowercase names,
            -- while newer ones used EF names. Drop constraints by type rather
            -- than by name so an interrupted/manual deployment is recoverable.
            DO $$
            DECLARE
                constraint_row record;
            BEGIN
                FOR constraint_row IN
                    SELECT conrelid::regclass AS table_name, conname
                    FROM pg_constraint
                    WHERE (conrelid = 'mobile_sync_conflict_resolutions'::regclass
                           AND contype = 'f'
                           AND confrelid = 'mobile_outbox_operations'::regclass)
                       OR (conrelid IN (
                               'mobile_sync_conflict_resolutions'::regclass,
                               'mobile_outbox_operations'::regclass)
                           AND contype = 'p')
                LOOP
                    EXECUTE format(
                        'ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I CASCADE',
                        constraint_row.table_name,
                        constraint_row.conname);
                END LOOP;
            END $$;

            ALTER TABLE mobile_outbox_operations
                ADD CONSTRAINT "PK_mobile_outbox_operations"
                PRIMARY KEY (mobile_account_id, client_operation_id);
            ALTER TABLE mobile_sync_conflict_resolutions
                ADD CONSTRAINT "PK_mobile_sync_conflict_resolutions"
                PRIMARY KEY (mobile_account_id, client_operation_id);

            ALTER TABLE mobile_sync_conflict_resolutions
                ADD CONSTRAINT "FK_mobile_sync_conflict_resolutions_mobile_outbox_operations_account_operation"
                FOREIGN KEY (mobile_account_id, client_operation_id)
                REFERENCES mobile_outbox_operations (mobile_account_id, client_operation_id)
                ON DELETE CASCADE;

            CREATE INDEX IF NOT EXISTS ix_mobile_outbox_operations_client_operation_id
                ON mobile_outbox_operations (client_operation_id);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE mobile_sync_conflict_resolutions
                DROP CONSTRAINT IF EXISTS "FK_mobile_sync_conflict_resolutions_mobile_outbox_operations_account_operation";
            ALTER TABLE mobile_sync_conflict_resolutions
                DROP CONSTRAINT IF EXISTS "PK_mobile_sync_conflict_resolutions";
            ALTER TABLE mobile_outbox_operations
                DROP CONSTRAINT IF EXISTS "PK_mobile_outbox_operations";

            WITH kept_operations AS (
                SELECT mobile_account_id, client_operation_id
                FROM (
                    SELECT
                        mobile_account_id,
                        client_operation_id,
                        ROW_NUMBER() OVER (
                            PARTITION BY client_operation_id
                            ORDER BY created_at_server DESC, mobile_account_id
                        ) AS row_number
                    FROM mobile_outbox_operations
                ) ranked
                WHERE row_number = 1
            )
            DELETE FROM mobile_sync_conflict_resolutions resolution
            WHERE NOT EXISTS (
                SELECT 1
                FROM kept_operations kept
                WHERE kept.mobile_account_id = resolution.mobile_account_id
                  AND kept.client_operation_id = resolution.client_operation_id
            );

            WITH ranked_operations AS (
                SELECT
                    ctid,
                    ROW_NUMBER() OVER (
                        PARTITION BY client_operation_id
                        ORDER BY created_at_server DESC, mobile_account_id
                    ) AS row_number
                FROM mobile_outbox_operations
            )
            DELETE FROM mobile_outbox_operations operation
            USING ranked_operations ranked
            WHERE operation.ctid = ranked.ctid
              AND ranked.row_number > 1;

            ALTER TABLE mobile_outbox_operations
                ADD CONSTRAINT "PK_mobile_outbox_operations"
                PRIMARY KEY (client_operation_id);
            ALTER TABLE mobile_sync_conflict_resolutions
                ADD CONSTRAINT "PK_mobile_sync_conflict_resolutions"
                PRIMARY KEY (client_operation_id);

            ALTER TABLE mobile_sync_conflict_resolutions
                ADD CONSTRAINT "FK_mobile_sync_conflict_resolutions_mobile_outbox_operations_~"
                FOREIGN KEY (client_operation_id)
                REFERENCES mobile_outbox_operations (client_operation_id)
                ON DELETE CASCADE;

            ALTER TABLE mobile_sync_conflict_resolutions
                DROP COLUMN IF EXISTS mobile_account_id;
            DROP INDEX IF EXISTS ix_mobile_outbox_operations_client_operation_id;
            """);
    }
}
