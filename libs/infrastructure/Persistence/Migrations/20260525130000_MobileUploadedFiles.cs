using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(Patrol360DbContext))]
    [Migration("20260525130000_MobileUploadedFiles")]
    public partial class MobileUploadedFiles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE TABLE IF NOT EXISTS mobile_uploaded_files (
                    id uuid NOT NULL,
                    mobile_account_id uuid NOT NULL,
                    client_file_id character varying(80) NOT NULL,
                    assignment_id uuid NOT NULL,
                    point_id uuid NOT NULL,
                    storage_file_name character varying(260) NOT NULL,
                    original_file_name character varying(260) NOT NULL,
                    content_type character varying(120) NOT NULL,
                    sha256 character varying(128) NOT NULL,
                    size_bytes bigint NOT NULL,
                    captured_at_local timestamp with time zone NOT NULL,
                    uploaded_at timestamp with time zone NOT NULL,
                    CONSTRAINT "PK_mobile_uploaded_files" PRIMARY KEY (id)
                );

                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'FK_mobile_uploaded_files_assignments_assignment_id'
                    ) THEN
                        ALTER TABLE mobile_uploaded_files
                            ADD CONSTRAINT "FK_mobile_uploaded_files_assignments_assignment_id"
                            FOREIGN KEY (assignment_id)
                            REFERENCES assignments (id)
                            ON DELETE CASCADE;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'FK_mobile_uploaded_files_mobile_accounts_mobile_account_id'
                    ) THEN
                        ALTER TABLE mobile_uploaded_files
                            ADD CONSTRAINT "FK_mobile_uploaded_files_mobile_accounts_mobile_account_id"
                            FOREIGN KEY (mobile_account_id)
                            REFERENCES mobile_accounts (id)
                            ON DELETE CASCADE;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'FK_mobile_uploaded_files_route_points_point_id'
                    ) THEN
                        ALTER TABLE mobile_uploaded_files
                            ADD CONSTRAINT "FK_mobile_uploaded_files_route_points_point_id"
                            FOREIGN KEY (point_id)
                            REFERENCES route_points (id)
                            ON DELETE CASCADE;
                    END IF;
                END $$;

                CREATE INDEX IF NOT EXISTS ix_mobile_uploaded_files_assignment_point
                    ON mobile_uploaded_files (assignment_id, point_id);

                CREATE INDEX IF NOT EXISTS "IX_mobile_uploaded_files_point_id"
                    ON mobile_uploaded_files (point_id);

                CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_uploaded_files_account_client_file
                    ON mobile_uploaded_files (mobile_account_id, client_file_id);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "mobile_uploaded_files");
        }
    }
}
