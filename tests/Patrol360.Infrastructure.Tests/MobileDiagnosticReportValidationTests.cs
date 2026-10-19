using System.Text.Json;
using Patrol360.Contracts;
using Patrol360.Infrastructure.MobileDiagnostics;

namespace Patrol360.Infrastructure.Tests;

public sealed class MobileDiagnosticReportValidationTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 19, 9, 0, 0, TimeSpan.Zero);

    [Fact]
    public void ReportFromAnOlderAppWithoutNewFieldsIsAccepted()
    {
        const string legacyJson = """
            {
              "reportId": "0b9f3a3e-8a43-4f8b-9a4e-1f9e8f0f6a11",
              "appVersion": "0.1.51",
              "platform": "android 16",
              "periodStart": "2026-10-18T09:00:00Z",
              "periodEnd": "2026-10-19T09:00:00Z",
              "generatedAt": "2026-10-19T09:00:00Z",
              "pendingOutboxCount": 0,
              "entries": [{ "eventType": "sync.failed", "message": "Server unavailable", "count": 1, "firstSeenAt": "2026-10-19T08:00:00Z", "lastSeenAt": "2026-10-19T08:00:00Z" }],
              "context": {
                "environment": "production", "contourId": "patrol360", "networkConnected": true, "internetReachable": true,
                "healthStatus": "ok", "healthFailureKind": null, "lastBackgroundAttemptAt": null, "lastServerContactAt": null,
                "lastCompleteQueueSyncAt": null, "lastReportDeliveredAt": null, "schemaMigrationCount": 12
              }
            }
            """;

        var report = JsonSerializer.Deserialize<MobileDiagnosticReportDto>(legacyJson, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;

        MobileDiagnosticReportValidation.Validate(report);
        Assert.Null(report.Delivery);
        Assert.Null(report.Context!.ClockOffsetSeconds);
    }

    [Fact]
    public void ReportWithCrashesDeliveryMetricsAndClockOffsetIsAccepted()
    {
        var report = ValidReport() with
        {
            Entries = [new MobileDiagnosticEntryDto("app.crash.js.fatal", "TypeError: undefined is not a function @ PointFillScreen", 2, Now.AddHours(-3), Now.AddHours(-1))],
            Context = ValidContext() with { ClockOffsetSeconds = -420, ClockOffsetMeasuredAt = Now.AddMinutes(-5) },
            Delivery = new MobileDiagnosticDeliveryDto(3_600, 4, 95, 1_800),
        };

        MobileDiagnosticReportValidation.Validate(report);
    }

    [Fact]
    public void PeriodWithoutDeliveredReportsIsAccepted()
    {
        MobileDiagnosticReportValidation.Validate(ValidReport() with { Delivery = new MobileDiagnosticDeliveryDto(null, 0, null, null) });
    }

    [Theory]
    [InlineData(-1, 1, 10, 20)]
    [InlineData(null, -1, null, null)]
    [InlineData(null, 2, 30, 20)]
    [InlineData(null, 2, null, 20)]
    [InlineData(null, 0, 10, 10)]
    [InlineData(null, 3, null, null)]
    public void InconsistentDeliveryMetricsAreRejected(int? oldestAge, int count, int? median, int? max)
    {
        var report = ValidReport() with { Delivery = new MobileDiagnosticDeliveryDto(oldestAge, count, median, max) };

        Assert.Throws<ArgumentException>(() => MobileDiagnosticReportValidation.Validate(report));
    }

    [Fact]
    public void ClockOffsetWithoutMeasurementTimeIsRejected()
    {
        var report = ValidReport() with { Context = ValidContext() with { ClockOffsetSeconds = 30 } };

        Assert.Throws<ArgumentException>(() => MobileDiagnosticReportValidation.Validate(report));
    }

    private static MobileDiagnosticReportDto ValidReport() => new(
        Guid.NewGuid(),
        "0.1.52",
        "android 16",
        Now.AddDays(-1),
        Now,
        Now,
        0,
        [new MobileDiagnosticEntryDto("sync.failed", "Server unavailable", 1, Now.AddHours(-1), Now)],
        ValidContext());

    private static MobileDiagnosticContextDto ValidContext() => new(
        "production",
        "patrol360",
        true,
        true,
        "ok",
        null,
        null,
        null,
        null,
        null,
        12);
}
