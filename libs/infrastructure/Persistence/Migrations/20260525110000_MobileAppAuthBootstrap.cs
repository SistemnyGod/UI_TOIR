using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(Patrol360DbContext))]
    [Migration("20260525110000_MobileAppAuthBootstrap")]
    public partial class MobileAppAuthBootstrap : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE mobile_account_sessions
                    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone,
                    ADD COLUMN IF NOT EXISTS device_id character varying(120),
                    ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
                    ADD COLUMN IF NOT EXISTS refresh_expires_at timestamp with time zone,
                    ADD COLUMN IF NOT EXISTS refresh_token_hash character varying(128),
                    ADD COLUMN IF NOT EXISTS revoked_at timestamp with time zone NULL,
                    ADD COLUMN IF NOT EXISTS token_hash character varying(128);

                UPDATE mobile_account_sessions
                SET
                    created_at = COALESCE(created_at, last_seen_at, now()),
                    device_id = COALESCE(NULLIF(device_id, ''), device),
                    expires_at = COALESCE(expires_at, now() + INTERVAL '8 hours'),
                    refresh_expires_at = COALESCE(refresh_expires_at, now() + INTERVAL '14 days'),
                    refresh_token_hash = COALESCE(refresh_token_hash, ''),
                    token_hash = COALESCE(token_hash, '');

                ALTER TABLE mobile_account_sessions
                    ALTER COLUMN created_at SET DEFAULT now(),
                    ALTER COLUMN created_at SET NOT NULL,
                    ALTER COLUMN device_id SET DEFAULT '',
                    ALTER COLUMN device_id SET NOT NULL,
                    ALTER COLUMN expires_at SET DEFAULT (now() + INTERVAL '8 hours'),
                    ALTER COLUMN expires_at SET NOT NULL,
                    ALTER COLUMN refresh_expires_at SET DEFAULT (now() + INTERVAL '14 days'),
                    ALTER COLUMN refresh_expires_at SET NOT NULL,
                    ALTER COLUMN refresh_token_hash SET DEFAULT '',
                    ALTER COLUMN refresh_token_hash SET NOT NULL,
                    ALTER COLUMN token_hash SET DEFAULT '',
                    ALTER COLUMN token_hash SET NOT NULL;

                CREATE TABLE IF NOT EXISTS mobile_outbox_operations (
                    client_operation_id character varying(80) NOT NULL,
                    mobile_account_id uuid NOT NULL,
                    command_type character varying(80) NOT NULL,
                    entity_type character varying(80) NOT NULL,
                    entity_local_id character varying(120) NULL,
                    entity_server_id character varying(120) NULL,
                    payload_json jsonb NOT NULL,
                    created_at_local timestamp with time zone NOT NULL,
                    created_at_server timestamp with time zone NOT NULL,
                    attempt_count integer NOT NULL,
                    status character varying(40) NOT NULL,
                    response_json jsonb NOT NULL,
                    CONSTRAINT "PK_mobile_outbox_operations" PRIMARY KEY (client_operation_id)
                );

                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'FK_mobile_outbox_operations_mobile_accounts_mobile_account_id'
                    ) THEN
                        ALTER TABLE mobile_outbox_operations
                            ADD CONSTRAINT "FK_mobile_outbox_operations_mobile_accounts_mobile_account_id"
                            FOREIGN KEY (mobile_account_id)
                            REFERENCES mobile_accounts (id)
                            ON DELETE CASCADE;
                    END IF;
                END $$;

                CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_account_sessions_refresh_token_hash
                    ON mobile_account_sessions (refresh_token_hash)
                    WHERE refresh_token_hash <> '';

                CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_account_sessions_token_hash
                    ON mobile_account_sessions (token_hash)
                    WHERE token_hash <> '';

                CREATE INDEX IF NOT EXISTS ix_mobile_outbox_operations_account_created
                    ON mobile_outbox_operations (mobile_account_id, created_at_server);

                CREATE INDEX IF NOT EXISTS ix_mobile_outbox_operations_status
                    ON mobile_outbox_operations (status);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "mobile_outbox_operations");

            migrationBuilder.DropIndex(
                name: "ux_mobile_account_sessions_refresh_token_hash",
                table: "mobile_account_sessions");

            migrationBuilder.DropIndex(
                name: "ux_mobile_account_sessions_token_hash",
                table: "mobile_account_sessions");

            migrationBuilder.DropColumn(
                name: "created_at",
                table: "mobile_account_sessions");

            migrationBuilder.DropColumn(
                name: "device_id",
                table: "mobile_account_sessions");

            migrationBuilder.DropColumn(
                name: "expires_at",
                table: "mobile_account_sessions");

            migrationBuilder.DropColumn(
                name: "refresh_expires_at",
                table: "mobile_account_sessions");

            migrationBuilder.DropColumn(
                name: "refresh_token_hash",
                table: "mobile_account_sessions");

            migrationBuilder.DropColumn(
                name: "revoked_at",
                table: "mobile_account_sessions");

            migrationBuilder.DropColumn(
                name: "token_hash",
                table: "mobile_account_sessions");
        }
    }
}
