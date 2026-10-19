using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.MobileDiagnostics;

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

        MobileDiagnosticReportValidation.Validate(request);
        TouchSession(session);
        dbContext.SaveChanges();

        return diagnosticReportStore.Save(new MobileStoredDiagnosticReport(
            request,
            DateTimeOffset.UtcNow));
    }
}
