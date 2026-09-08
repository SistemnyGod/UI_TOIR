using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Patrol360.Application;

namespace Patrol360.Worker;

public sealed class Worker(ILogger<Worker> logger, IServiceScopeFactory scopeFactory, WorkerDiagnostics diagnostics) : BackgroundService
{
    private static readonly TimeZoneInfo BusinessTimeZone = ResolveBusinessTimeZone();

    protected override Task ExecuteAsync(CancellationToken stoppingToken) => Task.WhenAll(
        RunCycleAsync("push", TimeSpan.FromSeconds(5), RunPushAsync, stoppingToken),
        RunCycleAsync("perco", TimeSpan.FromMinutes(1), RunPercoAsync, stoppingToken),
        RunEmuAsync(stoppingToken));

    private async Task RunCycleAsync(string direction, TimeSpan interval,
        Func<IServiceProvider, CancellationToken, Task<string>> operation, CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await WorkerAttempt.RunAsync(async token =>
            {
                using var scope = scopeFactory.CreateScope();
                var detail = await operation(scope.ServiceProvider, token);
                RecordDiagnostic(() => diagnostics.RecordSuccess(direction, detail), direction);
            }, exception =>
            {
                RecordDiagnostic(() => diagnostics.RecordFailure(direction, exception), direction);
                logger.LogError(exception, "{Direction} cycle failed; its next attempt remains scheduled.", direction);
            }, stoppingToken);
            await Task.Delay(interval, stoppingToken);
        }
    }

    private async Task RunEmuAsync(CancellationToken stoppingToken)
    {
        DateOnly? lastCarryOverDate = null;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var businessNow = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, BusinessTimeZone);
                var today = DateOnly.FromDateTime(businessNow.DateTime);
                var moved = 0;
                using (var scope = scopeFactory.CreateScope())
                {
                    var service = scope.ServiceProvider.GetRequiredService<IEmuMaintenanceService>();
                    if (businessNow.TimeOfDay >= TimeSpan.FromMinutes(5) && lastCarryOverDate != today)
                    {
                        moved = service.CarryOverForgottenWork(businessNow);
                        lastCarryOverDate = today;
                    }
                }
                int refreshed;
                using (var scope = scopeFactory.CreateScope())
                    refreshed = scope.ServiceProvider.GetRequiredService<IEmuMaintenanceService>().RefreshNotifications(businessNow);
                RecordDiagnostic(() => diagnostics.RecordSuccess("emu", $"moved={moved}; refreshed={refreshed}"), "emu");
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { throw; }
            catch (Exception exception)
            {
                RecordDiagnostic(() => diagnostics.RecordFailure("emu", exception), "emu");
                logger.LogError(exception, "EMU cycle failed; its next attempt remains scheduled.");
            }
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }

    private static async Task<string> RunPushAsync(IServiceProvider services, CancellationToken token) =>
        $"sent={await services.GetRequiredService<IMobilePushDeliveryService>().SendQueuedAsync(token)}";

    private static async Task<string> RunPercoAsync(IServiceProvider services, CancellationToken token)
    {
        var perco = services.GetRequiredService<IPercoIntegrationService>();
        var started = await perco.RunAutomaticSyncIfDueAsync(DateTimeOffset.UtcNow, token);
        var diagnostics = await perco.GetPresenceRebuildDiagnosticsAsync(token);
        return $"started={started}; presenceQueue={diagnostics.PendingEmployees}; oldestPresenceQueueAt={diagnostics.OldestEnqueuedAt:O}; " +
            $"rebuiltEmployees={diagnostics.RebuiltEmployees}; readEvents={diagnostics.ReadEvents}; rebuiltIntervals={diagnostics.RebuiltIntervals}; " +
            $"rebuildDurationMs={diagnostics.DurationMilliseconds}; rebuildLockWaitMs={diagnostics.LockWaitMilliseconds}";
    }

    private void RecordDiagnostic(Action update, string direction)
    {
        WorkerAttempt.RunDiagnostic(update,
            exception => logger.LogWarning(exception, "Could not persist {Direction} worker diagnostics.", direction));
    }

    private static TimeZoneInfo ResolveBusinessTimeZone()
    {
        foreach (var id in new[] { "Asia/Yekaterinburg", "Ekaterinburg Standard Time" })
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (TimeZoneNotFoundException) { }
            catch (InvalidTimeZoneException) { }
        return TimeZoneInfo.Local;
    }
}

public static class WorkerAttempt
{
    public static void RunDiagnostic(Action update, Action<Exception> failure)
    {
        try { update(); }
        catch (Exception exception) { failure(exception); }
    }

    public static async Task<bool> RunAsync(
        Func<CancellationToken, Task> operation,
        Action<Exception> failure,
        CancellationToken stoppingToken)
    {
        try
        {
            await operation(stoppingToken);
            return true;
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { throw; }
        catch (Exception exception)
        {
            failure(exception);
            return false;
        }
    }
}

public sealed class WorkerDiagnostics
{
    private readonly object sync = new();
    private readonly string path;
    private readonly Dictionary<string, DirectionStatus> directions = new(StringComparer.OrdinalIgnoreCase);

    public WorkerDiagnostics() : this(Environment.GetEnvironmentVariable("PATROL360_WORKER_HEARTBEAT_PATH") ??
        Path.Combine(Path.GetTempPath(), "patrol360-worker-heartbeat.json"))
    { }
    public WorkerDiagnostics(string path) => this.path = path;
    public void RecordSuccess(string direction, string detail) => Update(direction, detail, null);
    public void RecordFailure(string direction, Exception exception) => Update(direction, null, exception.Message);

    private void Update(string direction, string? detail, string? error)
    {
        lock (sync)
        {
            var now = DateTimeOffset.UtcNow;
            directions.TryGetValue(direction, out var previous);
            directions[direction] = new(now, error is null ? now : previous?.LastSuccessAt,
                error is null ? previous?.LastErrorAt : now, error ?? previous?.LastError, detail ?? previous?.LastSuccessDetail);
            var temporary = path + ".tmp";
            Directory.CreateDirectory(Path.GetDirectoryName(path) ?? ".");
            File.WriteAllText(temporary, JsonSerializer.Serialize(new { updatedAt = now, directions }));
            File.Move(temporary, path, true);
        }
    }

    private sealed record DirectionStatus(DateTimeOffset LastAttemptAt, DateTimeOffset? LastSuccessAt,
        DateTimeOffset? LastErrorAt, string? LastError, string? LastSuccessDetail);
}
