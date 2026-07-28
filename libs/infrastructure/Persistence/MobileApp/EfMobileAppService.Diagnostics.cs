using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    public MobileDiagnosticReportReceiptDto? SaveDiagnosticReport(
        string accessToken,
        MobileDiagnosticReportDto request)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null)
        {
            return null;
        }

        ValidateDiagnosticReport(request);
        TouchSession(session);
        dbContext.SaveChanges();

        return diagnosticReportStore.Save(new MobileStoredDiagnosticReport(
            request,
            DateTimeOffset.UtcNow));
    }

    private static void ValidateDiagnosticReport(MobileDiagnosticReportDto report)
    {
        if (report.ReportId == Guid.Empty
            || report.PeriodEnd < report.PeriodStart
            || report.Entries.Count is < 1 or > 100
            || report.PendingOutboxCount < 0)
        {
            throw new ArgumentException("Invalid mobile diagnostic report.");
        }

        if (report.Context is { } context
            && (string.IsNullOrWhiteSpace(context.Environment)
                || context.Environment.Length > 40
                || string.IsNullOrWhiteSpace(context.ContourId)
                || context.ContourId.Length > 120
                || context.HealthStatus is not ("ok" or "unavailable" or "notChecked")
                || context.HealthFailureKind?.Length > 80
                || context.SchemaMigrationCount is < 0))
        {
            throw new ArgumentException("Invalid mobile diagnostic context.");
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
