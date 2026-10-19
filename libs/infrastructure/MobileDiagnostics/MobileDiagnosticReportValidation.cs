using Patrol360.Contracts;

namespace Patrol360.Infrastructure.MobileDiagnostics;

internal static class MobileDiagnosticReportValidation
{
    public static void Validate(MobileDiagnosticReportDto report)
    {
        if (report.ReportId == Guid.Empty
            || report.PeriodEnd < report.PeriodStart
            || report.Entries is null
            || report.Entries.Count is < 1 or > 100
            || report.PendingOutboxCount < 0)
        {
            throw new ArgumentException("Invalid mobile diagnostic report.");
        }

        // A large clock offset is not rejected: it is exactly what the field reports.
        if (report.Context is { } context
            && (string.IsNullOrWhiteSpace(context.Environment)
                || context.Environment.Length > 40
                || string.IsNullOrWhiteSpace(context.ContourId)
                || context.ContourId.Length > 120
                || context.HealthStatus is not ("ok" or "unavailable" or "notChecked")
                || context.HealthFailureKind?.Length > 80
                || context.SchemaMigrationCount is < 0
                || (context.ClockOffsetSeconds is null) != (context.ClockOffsetMeasuredAt is null)))
        {
            throw new ArgumentException("Invalid mobile diagnostic context.");
        }

        if (report.Delivery is { } delivery
            && (delivery.OldestUndeliveredCommandAgeSeconds is < 0
                || delivery.DeliveredReportCount < 0
                || delivery.ReportDeliveryMedianSeconds is < 0
                || delivery.ReportDeliveryMaxSeconds is < 0
                || (delivery.DeliveredReportCount == 0) != (delivery.ReportDeliveryMaxSeconds is null)
                || (delivery.ReportDeliveryMedianSeconds is null) != (delivery.ReportDeliveryMaxSeconds is null)
                || delivery.ReportDeliveryMedianSeconds > delivery.ReportDeliveryMaxSeconds))
        {
            throw new ArgumentException("Invalid mobile diagnostic delivery metrics.");
        }

        if (report.Entries.Any(entry =>
                string.IsNullOrWhiteSpace(entry.EventType)
                || entry.EventType.Length > 120
                || string.IsNullOrWhiteSpace(entry.Message)
                || entry.Message.Length > 500
                || entry.Count < 1
                || entry.LastSeenAt < entry.FirstSeenAt))
        {
            throw new ArgumentException("Invalid mobile diagnostic report entries.");
        }
    }
}
