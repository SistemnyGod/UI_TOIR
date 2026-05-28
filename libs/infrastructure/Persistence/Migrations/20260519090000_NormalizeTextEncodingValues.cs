using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Patrol360.Infrastructure.Persistence;
using System.Text;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(Patrol360DbContext))]
    [Migration("20260519090000_NormalizeTextEncodingValues")]
    public partial class NormalizeTextEncodingValues : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            NormalizeColumn(
                migrationBuilder,
                "assignments",
                "status",
                [
                    "\u041d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0430",
                    "\u041e\u0436\u0438\u0434\u0430\u0435\u0442",
                    "\u0412 \u043f\u0443\u0442\u0438",
                    "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u043e",
                    "\u041e\u0442\u043c\u0435\u043d\u0435\u043d\u043e",
                    "\u041f\u0440\u043e\u0441\u0440\u043e\u0447\u0435\u043d\u0430",
                    "\u0417\u0430\u0434\u0435\u0440\u0436\u043a\u0430"
                ]);
            NormalizeColumn(migrationBuilder, "assignments", "shift", ["\u0414\u0435\u043d\u044c", "\u041d\u043e\u0447\u044c"]);

            NormalizeColumn(
                migrationBuilder,
                "patrol_requests",
                "status",
                [
                    "\u041d\u043e\u0432\u0430\u044f",
                    "\u0412 \u0440\u0430\u0431\u043e\u0442\u0435",
                    "\u041d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0430",
                    "\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0430",
                    "\u0417\u0430\u043a\u0440\u044b\u0442\u0430"
                ]);

            NormalizeColumn(
                migrationBuilder,
                "employees",
                "status",
                [
                    "\u0410\u043a\u0442\u0438\u0432\u0435\u043d",
                    "\u041d\u0430 \u0441\u043c\u0435\u043d\u0435",
                    "\u041e\u0444\u043b\u0430\u0439\u043d",
                    "\u041e\u0442\u043f\u0443\u0441\u043a"
                ]);
            NormalizeColumn(migrationBuilder, "employees", "shift", ["\u0414\u0435\u043d\u044c", "\u041d\u043e\u0447\u044c"]);

            NormalizeColumn(
                migrationBuilder,
                "routes",
                "status",
                ["\u0410\u043a\u0442\u0438\u0432\u0435\u043d", "\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a", "\u0410\u0440\u0445\u0438\u0432"]);

            NormalizeColumn(
                migrationBuilder,
                "route_points",
                "status",
                ["\u0410\u043a\u0442\u0438\u0432\u043d\u0430", "\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a"]);
            NormalizeColumn(
                migrationBuilder,
                "route_points",
                "point_type",
                ["NFC", "QR-\u043a\u043e\u0434", "\u0420\u0443\u0447\u043d\u043e\u0439 \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c"]);

            NormalizeColumn(
                migrationBuilder,
                "mobile_accounts",
                "status",
                ["\u0410\u043a\u0442\u0438\u0432\u0435\u043d", "\u041d\u0435 \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u043d", "\u0417\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d"]);
            NormalizeColumn(
                migrationBuilder,
                "mobile_accounts",
                "session",
                ["\u041e\u043d\u043b\u0430\u0439\u043d", "\u041e\u0444\u043b\u0430\u0439\u043d", "-"]);
            NormalizeColumn(
                migrationBuilder,
                "mobile_accounts",
                "role",
                ["\u041c\u0430\u0440\u0448\u0440\u0443\u0442\u043d\u044b\u0439 \u043e\u0431\u0445\u043e\u0434\u0447\u0438\u043a", "\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440"]);

            NormalizeColumn(
                migrationBuilder,
                "patrol_results",
                "status",
                [
                    "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043e",
                    "\u0417\u0430\u043c\u0435\u0447\u0430\u043d\u0438\u0435",
                    "\u041f\u0440\u043e\u0441\u0440\u043e\u0447\u0435\u043d\u043e",
                    "\u041d\u0435 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043e"
                ]);
            NormalizeColumn(migrationBuilder, "patrol_results", "shift", ["\u0414\u0435\u043d\u044c", "\u041d\u043e\u0447\u044c"]);
            NormalizeColumn(
                migrationBuilder,
                "patrol_results",
                "severity",
                ["\u041d\u0438\u0437\u043a\u0430\u044f", "\u0421\u0440\u0435\u0434\u043d\u044f\u044f", "\u0412\u044b\u0441\u043e\u043a\u0430\u044f", "-"]);

            NormalizeColumn(
                migrationBuilder,
                "patrol_result_issues",
                "severity",
                ["\u041d\u0438\u0437\u043a\u0430\u044f", "\u0421\u0440\u0435\u0434\u043d\u044f\u044f", "\u0412\u044b\u0441\u043e\u043a\u0430\u044f"]);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }

        private static void NormalizeColumn(
            MigrationBuilder migrationBuilder,
            string table,
            string column,
            IReadOnlyList<string> values)
        {
            foreach (var value in values)
            {
                var legacyValues = LegacyMojibakeValues(value);
                migrationBuilder.Sql($"""
                    UPDATE "{table}"
                    SET "{column}" = {SqlLiteral(value)}
                    WHERE "{column}" IN ({string.Join(", ", legacyValues.Select(SqlLiteral))});
                    """);
            }
        }

        private static string SqlLiteral(string value) => "'" + value.Replace("'", "''", StringComparison.Ordinal) + "'";

        private static IReadOnlyList<string> LegacyMojibakeValues(string value)
        {
            var once = DecodeUtf8BytesAsWindows1251(value);
            var twice = DecodeUtf8BytesAsWindows1251(once);
            return once == twice ? [once] : [once, twice];
        }

        private static string DecodeUtf8BytesAsWindows1251(string value)
        {
            var builder = new StringBuilder();
            foreach (var item in Encoding.UTF8.GetBytes(value))
            {
                builder.Append(DecodeWindows1251Byte(item));
            }

            return builder.ToString();
        }

        private static char DecodeWindows1251Byte(byte value) =>
            value switch
            {
                < 0x80 => (char)value,
                >= 0xC0 => (char)(0x0410 + value - 0xC0),
                0x80 => '\u0402',
                0x81 => '\u0403',
                0x82 => '\u201A',
                0x83 => '\u0453',
                0x84 => '\u201E',
                0x85 => '\u2026',
                0x86 => '\u2020',
                0x87 => '\u2021',
                0x88 => '\u20AC',
                0x89 => '\u2030',
                0x8A => '\u0409',
                0x8B => '\u2039',
                0x8C => '\u040A',
                0x8D => '\u040C',
                0x8E => '\u040B',
                0x8F => '\u040F',
                0x90 => '\u0452',
                0x91 => '\u2018',
                0x92 => '\u2019',
                0x93 => '\u201C',
                0x94 => '\u201D',
                0x95 => '\u2022',
                0x96 => '\u2013',
                0x97 => '\u2014',
                0x98 => '\u0098',
                0x99 => '\u2122',
                0x9A => '\u0459',
                0x9B => '\u203A',
                0x9C => '\u045A',
                0x9D => '\u045C',
                0x9E => '\u045B',
                0x9F => '\u045F',
                0xA0 => '\u00A0',
                0xA1 => '\u040E',
                0xA2 => '\u045E',
                0xA3 => '\u0408',
                0xA4 => '\u00A4',
                0xA5 => '\u0490',
                0xA6 => '\u00A6',
                0xA7 => '\u00A7',
                0xA8 => '\u0401',
                0xA9 => '\u00A9',
                0xAA => '\u0404',
                0xAB => '\u00AB',
                0xAC => '\u00AC',
                0xAD => '\u00AD',
                0xAE => '\u00AE',
                0xAF => '\u0407',
                0xB0 => '\u00B0',
                0xB1 => '\u00B1',
                0xB2 => '\u0406',
                0xB3 => '\u0456',
                0xB4 => '\u0491',
                0xB5 => '\u00B5',
                0xB6 => '\u00B6',
                0xB7 => '\u00B7',
                0xB8 => '\u0451',
                0xB9 => '\u2116',
                0xBA => '\u0454',
                0xBB => '\u00BB',
                0xBC => '\u0458',
                0xBD => '\u0405',
                0xBE => '\u0455',
                0xBF => '\u0457'
            };
    }
}
