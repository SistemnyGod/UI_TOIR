using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260727121000_MobileRefreshTokenHistory")]
public partial class MobileRefreshTokenHistory : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "mobile_refresh_token_histories",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                mobile_account_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                token_hash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                generation = table.Column<int>(type: "integer", nullable: false),
                rotated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                replay_valid_until = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_mobile_refresh_token_histories", x => x.id);
                table.ForeignKey(
                    name: "fk_mobile_refresh_token_histories_mobile_account_sessions_mobile_account_session_id",
                    column: x => x.mobile_account_session_id,
                    principalTable: "mobile_account_sessions",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "ix_mobile_refresh_token_histories_session",
            table: "mobile_refresh_token_histories",
            column: "mobile_account_session_id");

        migrationBuilder.CreateIndex(
            name: "ux_mobile_refresh_token_histories_token_hash",
            table: "mobile_refresh_token_histories",
            column: "token_hash",
            unique: true);

        migrationBuilder.Sql(@"
            INSERT INTO mobile_refresh_token_histories (id, mobile_account_session_id, token_hash, generation, rotated_at, replay_valid_until)
            SELECT gen_random_uuid(), id, previous_refresh_token_hash, GREATEST(refresh_generation - 1, 0), COALESCE(last_seen_at, NOW()), COALESCE(previous_refresh_token_valid_until, NOW())
            FROM mobile_account_sessions
            WHERE previous_refresh_token_hash IS NOT NULL
              AND previous_refresh_token_hash <> ''
            ON CONFLICT (token_hash) DO NOTHING;");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "mobile_refresh_token_histories");
    }
}
