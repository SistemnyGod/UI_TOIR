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
    private readonly TimeSpan retention;

    public LocalMobileDiagnosticReportStore(IConfiguration configuration)
    {
        var configuredPath = configuration["MobileDiagnostics:StoragePath"];
        storagePath = Path.GetFullPath(string.IsNullOrWhiteSpace(configuredPath)
            ? Path.Combine(Directory.GetCurrentDirectory(), "mobile-diagnostics")
            : configuredPath);
        Directory.CreateDirectory(storagePath);
        retention = TimeSpan.FromDays(Math.Clamp(configuration.GetValue("MobileDiagnostics:RetentionDays", 90), 7, 365));
    }

    public MobileDiagnosticReportReceiptDto Save(MobileStoredDiagnosticReport report)
    {
        DeleteExpiredReports();
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

    private void DeleteExpiredReports()
    {
        var cutoff = DateTime.UtcNow.Subtract(retention);
        foreach (var file in Directory.EnumerateFiles(storagePath, "*.json", SearchOption.AllDirectories))
        {
            try
            {
                if (File.GetLastWriteTimeUtc(file) < cutoff) File.Delete(file);
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }
}
