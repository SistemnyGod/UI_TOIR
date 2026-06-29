using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;

namespace Patrol360.Worker;

public class Worker(ILogger<Worker> logger, IServiceProvider serviceProvider) : BackgroundService
{
    private static readonly TimeZoneInfo EmuBusinessTimeZone = ResolveEmuBusinessTimeZone();
    private static readonly TimeSpan EmuCarryOverStart = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan MobilePushInterval = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan MaintenanceInterval = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        DateOnly? lastCarryOverDate = null;
        var nextMaintenanceAt = DateTimeOffset.MinValue;
        var nextMobilePushAt = DateTimeOffset.MinValue;

        while (!stoppingToken.IsCancellationRequested)
        {
            var now = DateTimeOffset.UtcNow;
            var businessNow = TimeZoneInfo.ConvertTime(now, EmuBusinessTimeZone);
            var today = DateOnly.FromDateTime(businessNow.DateTime);

            if (now >= nextMaintenanceAt)
            {
                nextMaintenanceAt = now.Add(MaintenanceInterval);

                if (businessNow.TimeOfDay >= EmuCarryOverStart && lastCarryOverDate != today)
                {
                    using var scope = serviceProvider.CreateScope();
                    var maintenance = scope.ServiceProvider.GetRequiredService<IEmuMaintenanceService>();
                    var count = maintenance.CarryOverForgottenWork(businessNow);
                    lastCarryOverDate = today;
                    logger.LogInformation("EMU carry-over checked at {Time}. Moved {Count} unfinished work sessions.", businessNow, count);
                }

                using (var scope = serviceProvider.CreateScope())
                {
                    var maintenance = scope.ServiceProvider.GetRequiredService<IEmuMaintenanceService>();
                    var count = maintenance.RefreshNotifications(businessNow);
                    if (count > 0)
                    {
                        logger.LogInformation("EMU notifications refreshed at {Time}. Changed {Count} notifications.", businessNow, count);
                    }
                }

                using (var scope = serviceProvider.CreateScope())
                {
                    var percoIntegration = scope.ServiceProvider.GetRequiredService<IPercoIntegrationService>();
                    var startedCount = await percoIntegration.RunAutomaticSyncIfDueAsync(now, stoppingToken);
                    if (startedCount > 0)
                    {
                        logger.LogInformation("PERCo automatic sync started {Count} operation(s).", startedCount);
                    }
                }
            }

            if (now >= nextMobilePushAt)
            {
                nextMobilePushAt = now.Add(MobilePushInterval);

                using var scope = serviceProvider.CreateScope();
                var mobilePush = scope.ServiceProvider.GetRequiredService<IMobilePushDeliveryService>();
                var sentCount = await mobilePush.SendQueuedAsync(stoppingToken);
                if (sentCount > 0)
                {
                    logger.LogInformation("Sent {Count} mobile push notifications.", sentCount);
                }
            }

            await Task.Delay(MobilePushInterval, stoppingToken);
        }
    }

    private static TimeZoneInfo ResolveEmuBusinessTimeZone()
    {
        foreach (var id in new[] { "Asia/Yekaterinburg", "Ekaterinburg Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
            }
            catch (InvalidTimeZoneException)
            {
            }
        }

        return TimeZoneInfo.Local;
    }
}
