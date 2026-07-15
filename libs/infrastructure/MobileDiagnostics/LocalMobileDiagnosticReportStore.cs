using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Infrastructure.MobileDiagnostics;

internal sealed class LocalMobileDiagnosticReportStore : IMobileDiagnosticReportStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
    };

    private readonly string storagePath;

    public LocalMobileDiagnosticReportStore(IConfiguration configuration)
    {
        var configuredPath = configuration["MobileDiagnostics:StoragePath"];
        storagePath = Path.GetFullPath(string.IsNullOrWhiteSpace(configuredPath)
            ? Path.Combine(Directory.GetCurrentDirectory(), "mobile-diagnostics")
            : configuredPath);
        Directory.CreateDirectory(storagePath);
    }

    public MobileDiagnosticReportReceiptDto Save(MobileStoredDiagnosticReport report)
    {
        var reportId = report.Report.ReportId;
        var reportDate = report.Report.GeneratedAt.UtcDateTime;
        var directory = Path.Combine(
            storagePath,
            reportDate.ToString("yyyy"),
            reportDate.ToString("MM"));
        Directory.CreateDirectory(directory);

        var fileName = $"{reportDate:yyyyMMdd}_{report.MobileAccountId:N}_{reportId:N}.json";
        var destination = Path.Combine(directory, fileName);
        if (File.Exists(destination))
        {
            return new MobileDiagnosticReportReceiptDto(reportId, "duplicate", File.GetCreationTimeUtc(destination));
        }

        var tempPath = Path.Combine(directory, $".{fileName}.{Guid.NewGuid():N}.tmp");
        try
        {
            File.WriteAllText(tempPath, JsonSerializer.Serialize(report, JsonOptions));
            try
            {
                File.Move(tempPath, destination, overwrite: false);
            }
            catch (IOException) when (File.Exists(destination))
            {
                return new MobileDiagnosticReportReceiptDto(reportId, "duplicate", File.GetCreationTimeUtc(destination));
            }

            return new MobileDiagnosticReportReceiptDto(reportId, "stored", report.ReceivedAt);
        }
        finally
        {
            if (File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
        }
    }
}
