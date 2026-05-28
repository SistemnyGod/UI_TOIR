using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260525152000_MobileNotifications")]
public partial class MobileNotifications : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE mobile_account_sessions
                ADD COLUMN IF NOT EXISTS push_token character varying(512) NOT NULL DEFAULT '';

            ALTER TABLE mobile_account_sessions
                ADD COLUMN IF NOT EXISTS push_token_registered_at timestamp with time zone NULL;

            ALTER TABLE mobile_account_sessions
                ADD COLUMN IF NOT EXISTS push_token_revoked_at timestamp with time zone NULL;

            CREATE TABLE IF NOT EXISTS mobile_notifications (
                id uuid NOT NULL,
                mobile_account_id uuid NOT NULL,
                employee_id uuid NULL,
                notification_type character varying(80) NOT NULL,
                title character varying(220) NOT NULL,
                message character varying(1200) NOT NULL,
                entity_type character varying(80) NULL,
                entity_id character varying(120) NULL,
                idempotency_key character varying(160) NOT NULL,
                push_status character varying(40) NOT NULL,
                push_token_snapshot character varying(512) NOT NULL,
                created_at timestamp with time zone NOT NULL,
                read_at timestamp with time zone NULL,
                CONSTRAINT "PK_mobile_notifications" PRIMARY KEY (id)
            );

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'FK_mobile_notifications_mobile_accounts_mobile_account_id'
                ) THEN
                    ALTER TABLE mobile_notifications
                        ADD CONSTRAINT "FK_mobile_notifications_mobile_accounts_mobile_account_id"
                        FOREIGN KEY (mobile_account_id)
                        REFERENCES mobile_accounts (id)
                        ON DELETE CASCADE;
                END IF;
            END $$;

            CREATE INDEX IF NOT EXISTS ix_mobile_notifications_account_created
                ON mobile_notifications (mobile_account_id, created_at);

            CREATE INDEX IF NOT EXISTS ix_mobile_notifications_read_at
                ON mobile_notifications (read_at);

            CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_notifications_account_idempotency
                ON mobile_notifications (mobile_account_id, idempotency_key);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TABLE IF EXISTS mobile_notifications;

            ALTER TABLE mobile_account_sessions
                DROP COLUMN IF EXISTS push_token_revoked_at,
                DROP COLUMN IF EXISTS push_token_registered_at,
                DROP COLUMN IF EXISTS push_token;
            """);
    }
}
