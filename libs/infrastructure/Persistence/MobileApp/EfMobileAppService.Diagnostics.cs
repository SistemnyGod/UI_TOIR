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

        ValidateDiagnosticReport(request, session.DeviceId);
        TouchSession(session);
        dbContext.SaveChanges();

        return diagnosticReportStore.Save(new MobileStoredDiagnosticReport(
            session.MobileAccountId,
            session.MobileAccount.Login,
            session.DeviceId,
            request,
            DateTimeOffset.UtcNow,
            session.IpAddress));
    }

    private static void ValidateDiagnosticReport(MobileDiagnosticReportDto report, string sessionDeviceId)
    {
        if (report.ReportId == Guid.Empty
            || string.IsNullOrWhiteSpace(report.DeviceId)
            || !report.DeviceId.Equals(sessionDeviceId, StringComparison.Ordinal)
            || report.PeriodEnd < report.PeriodStart
            || report.Entries.Count is < 1 or > 100
            || report.PendingOutboxCount < 0)
        {
            throw new ArgumentException("Invalid mobile diagnostic report.");
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
