using System.Collections.Concurrent;
using System.Globalization;

namespace Patrol360.Api.Services;

/// <summary>
/// Clock check for the mobile API. Every mobile response carries the server
/// time (X-Server-Now) so the app can measure its clock offset and warn the
/// guard. The app's own time arrives as X-Client-Now; a large skew is logged.
/// Both headers are optional, so older app versions are unaffected.
/// </summary>
public sealed class MobileClockHeadersMiddleware(
    RequestDelegate next,
    ILogger<MobileClockHeadersMiddleware> logger,
    TimeProvider timeProvider)
{
    public const string ClientNowHeader = "X-Client-Now";
    public const string ServerNowHeader = "X-Server-Now";
    public static readonly TimeSpan SkewWarningThreshold = TimeSpan.FromMinutes(3);
    private static readonly TimeSpan WarningInterval = TimeSpan.FromMinutes(10);
    private const int MaxTrackedClients = 1000;

    // At most one warning per client address per interval: a phone with a
    // wrong clock sends this header on every request.
    private readonly ConcurrentDictionary<string, DateTimeOffset> lastWarningByClient = new(StringComparer.Ordinal);

    public Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Path.StartsWithSegments("/api/v1/mobile", StringComparison.OrdinalIgnoreCase))
        {
            return next(context);
        }

        context.Response.OnStarting(() =>
        {
            context.Response.Headers[ServerNowHeader] = timeProvider.GetUtcNow().ToString("O", CultureInfo.InvariantCulture);
            return Task.CompletedTask;
        });

        if (TryReadClientNow(context.Request.Headers[ClientNowHeader], out var clientNow))
        {
            var serverNow = timeProvider.GetUtcNow();
            var skew = serverNow - clientNow;
            if (skew.Duration() > SkewWarningThreshold && ShouldWarn(context, serverNow))
            {
                logger.LogWarning(
                    "Mobile client clock is off by {SkewSeconds:F0} s (server minus phone) on {Path}.",
                    skew.TotalSeconds,
                    context.Request.Path.Value);
            }
        }

        return next(context);
    }

    public static bool TryReadClientNow(string? value, out DateTimeOffset clientNow)
    {
        clientNow = default;
        return !string.IsNullOrWhiteSpace(value)
            && value.Length <= 64
            && DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out clientNow);
    }

    private bool ShouldWarn(HttpContext context, DateTimeOffset now)
    {
        var client = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        if (lastWarningByClient.TryGetValue(client, out var lastWarning) && now - lastWarning < WarningInterval)
        {
            return false;
        }

        if (lastWarningByClient.Count >= MaxTrackedClients)
        {
            lastWarningByClient.Clear();
        }

        lastWarningByClient[client] = now;
        return true;
    }
}
