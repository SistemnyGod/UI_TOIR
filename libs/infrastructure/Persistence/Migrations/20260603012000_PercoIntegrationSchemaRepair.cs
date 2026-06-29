using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260603012000_PercoIntegrationSchemaRepair")]
public partial class PercoIntegrationSchemaRepair : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS perco_integration_settings (
                id uuid NOT NULL PRIMARY KEY,
                is_enabled boolean NOT NULL DEFAULT false,
                base_url text NOT NULL DEFAULT '',
                username text NOT NULL DEFAULT '',
                password_encrypted text NOT NULL DEFAULT '',
                token_encrypted text NOT NULL DEFAULT '',
                timezone text NOT NULL DEFAULT 'Asia/Yekaterinburg',
                employees_sync_minutes integer NOT NULL DEFAULT 60,
                events_sync_minutes integer NOT NULL DEFAULT 5,
                shift_start_tolerance_minutes integer NOT NULL DEFAULT 120,
                shift_end_tolerance_minutes integer NOT NULL DEFAULT 240,
                dev_path text NOT NULL DEFAULT '/dev',
                employees_endpoint text NOT NULL DEFAULT '/api/users/staff/fullList',
                events_endpoint text NOT NULL DEFAULT '/api/verify/events',
                last_discovery_summary text NOT NULL DEFAULT '',
                last_connection_check_at timestamp with time zone NULL,
                last_connection_status text NOT NULL DEFAULT '',
                last_connection_error text NOT NULL DEFAULT '',
                created_at timestamp with time zone NOT NULL,
                updated_at timestamp with time zone NULL
            );

            ALTER TABLE perco_integration_settings
                ADD COLUMN IF NOT EXISTS employees_endpoint text NOT NULL DEFAULT '/api/users/staff/fullList';

            ALTER TABLE perco_integration_settings
                ADD COLUMN IF NOT EXISTS events_endpoint text NOT NULL DEFAULT '/api/verify/events';

            ALTER TABLE perco_integration_settings
                ADD COLUMN IF NOT EXISTS last_discovery_summary text NOT NULL DEFAULT '';

            CREATE TABLE IF NOT EXISTS perco_integration_logs (
                id uuid NOT NULL PRIMARY KEY,
                operation text NOT NULL DEFAULT '',
                status text NOT NULL DEFAULT '',
                message text NOT NULL DEFAULT '',
                details text NOT NULL DEFAULT '',
                started_at timestamp with time zone NOT NULL,
                finished_at timestamp with time zone NULL,
                created_by_user_id uuid NULL
            );

            CREATE TABLE IF NOT EXISTS perco_sync_state (
                id uuid NOT NULL PRIMARY KEY,
                sync_type text NOT NULL DEFAULT '',
                last_success_at timestamp with time zone NULL,
                last_cursor text NOT NULL DEFAULT '',
                last_error text NOT NULL DEFAULT '',
                updated_at timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS perco_employee_links (
                id uuid NOT NULL PRIMARY KEY,
                perco_employee_id text NOT NULL DEFAULT '',
                employee_id uuid NULL,
                full_name text NOT NULL DEFAULT '',
                personnel_no text NOT NULL DEFAULT '',
                card_number text NOT NULL DEFAULT '',
                department text NOT NULL DEFAULT '',
                matched_by_user_id uuid NULL,
                matched_at timestamp with time zone NULL,
                match_status text NOT NULL DEFAULT 'UNMATCHED',
                created_at timestamp with time zone NOT NULL,
                updated_at timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS perco_access_events (
                id uuid NOT NULL PRIMARY KEY,
                perco_event_id text NOT NULL DEFAULT '',
                perco_employee_id text NOT NULL DEFAULT '',
                employee_id uuid NULL,
                device_id text NOT NULL DEFAULT '',
                device_name text NOT NULL DEFAULT '',
                direction text NOT NULL DEFAULT 'UNKNOWN',
                event_at timestamp with time zone NOT NULL,
                raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
                created_at timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS employee_presence_intervals (
                id uuid NOT NULL PRIMARY KEY,
                employee_id uuid NOT NULL,
                opened_by_event_id uuid NULL,
                closed_by_event_id uuid NULL,
                started_at timestamp with time zone NOT NULL,
                ended_at timestamp with time zone NULL,
                duration_minutes integer NOT NULL DEFAULT 0,
                source text NOT NULL DEFAULT 'PERCO',
                created_at timestamp with time zone NOT NULL
            );

            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_perco_integration_logs_site_users_created_by_user_id') THEN
                    ALTER TABLE perco_integration_logs
                        ADD CONSTRAINT fk_perco_integration_logs_site_users_created_by_user_id
                        FOREIGN KEY (created_by_user_id) REFERENCES site_users(id) ON DELETE SET NULL;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_perco_employee_links_employees_employee_id') THEN
                    ALTER TABLE perco_employee_links
                        ADD CONSTRAINT fk_perco_employee_links_employees_employee_id
                        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_perco_employee_links_site_users_matched_by_user_id') THEN
                    ALTER TABLE perco_employee_links
                        ADD CONSTRAINT fk_perco_employee_links_site_users_matched_by_user_id
                        FOREIGN KEY (matched_by_user_id) REFERENCES site_users(id) ON DELETE SET NULL;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_perco_access_events_employees_employee_id') THEN
                    ALTER TABLE perco_access_events
                        ADD CONSTRAINT fk_perco_access_events_employees_employee_id
                        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_presence_intervals_employees_employee_id') THEN
                    ALTER TABLE employee_presence_intervals
                        ADD CONSTRAINT fk_employee_presence_intervals_employees_employee_id
                        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_presence_intervals_opened_event_id') THEN
                    ALTER TABLE employee_presence_intervals
                        ADD CONSTRAINT fk_employee_presence_intervals_opened_event_id
                        FOREIGN KEY (opened_by_event_id) REFERENCES perco_access_events(id) ON DELETE SET NULL;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_presence_intervals_closed_event_id') THEN
                    ALTER TABLE employee_presence_intervals
                        ADD CONSTRAINT fk_employee_presence_intervals_closed_event_id
                        FOREIGN KEY (closed_by_event_id) REFERENCES perco_access_events(id) ON DELETE SET NULL;
                END IF;
            END $$;

            CREATE INDEX IF NOT EXISTS ix_perco_integration_logs_operation ON perco_integration_logs(operation);
            CREATE INDEX IF NOT EXISTS ix_perco_integration_logs_started_at ON perco_integration_logs(started_at);
            CREATE INDEX IF NOT EXISTS ix_perco_integration_logs_status ON perco_integration_logs(status);
            CREATE UNIQUE INDEX IF NOT EXISTS ix_perco_sync_state_sync_type ON perco_sync_state(sync_type);
            CREATE INDEX IF NOT EXISTS ix_perco_employee_links_employee_id ON perco_employee_links(employee_id);
            CREATE INDEX IF NOT EXISTS ix_perco_employee_links_match_status ON perco_employee_links(match_status);
            CREATE UNIQUE INDEX IF NOT EXISTS ix_perco_employee_links_perco_employee_id ON perco_employee_links(perco_employee_id);
            CREATE INDEX IF NOT EXISTS ix_perco_access_events_employee_id ON perco_access_events(employee_id);
            CREATE INDEX IF NOT EXISTS ix_perco_access_events_event_at ON perco_access_events(event_at);
            CREATE UNIQUE INDEX IF NOT EXISTS ix_perco_access_events_perco_event_id ON perco_access_events(perco_event_id);
            CREATE INDEX IF NOT EXISTS ix_employee_presence_intervals_employee_id ON employee_presence_intervals(employee_id);
            CREATE INDEX IF NOT EXISTS ix_employee_presence_intervals_started_at ON employee_presence_intervals(started_at);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
    }
}
