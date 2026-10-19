using System.Globalization;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;

namespace Patrol360.Api.MobileAppUpdates;

/// <summary>
/// Marks a mobile endpoint that an outdated app may still call: health,
/// sign-in, updates themselves and everything needed to drain the local
/// outbox. A phone below the minimum version must be able to deliver its
/// queued reports before (or instead of) losing them.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class AllowOutdatedMobileAppAttribute : Attribute;

/// <summary>
/// Rejects mobile API calls from an app whose versionCode is below the
/// published minimum with a typed <c>426 app_update_required</c> response.
/// </summary>
public sealed class MobileAppVersionGateMiddleware(RequestDelegate next, IMobileAppReleaseCatalog catalog)
{
    public const string VersionCodeHeader = "X-Mobile-App-Version-Code";
    public const string UpdateRequiredCode = "app_update_required";

    public async Task InvokeAsync(HttpContext context)
    {
        var endpoint = context.GetEndpoint();
        if (endpoint is null
            || !IsMobileApiPath(context.Request.Path)
            || endpoint.Metadata.GetMetadata<AllowOutdatedMobileAppAttribute>() is not null)
        {
            await next(context);
            return;
        }

        var release = catalog.GetCurrentRelease();
        if (release is null || release.MinimumVersionCode <= 0)
        {
            await next(context);
            return;
        }

        var installedVersionCode = TryReadVersionCode(context.Request.Headers[VersionCodeHeader]);
        var allowed = installedVersionCode is null
            ? !release.RejectClientsWithoutVersionCode
            : installedVersionCode.Value >= release.MinimumVersionCode;
        if (allowed)
        {
            await next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status426UpgradeRequired;
        context.Response.Headers.CacheControl = "no-store";
        await context.Response.WriteAsJsonAsync(new MobileAppUpdateRequiredDto(
            UpdateRequiredCode,
            $"Требуется обновление приложения Patrol360 до версии {release.VersionName}. "
                + "Неотправленные данные на телефоне сохранены: установите обновление, и они будут отправлены.",
            installedVersionCode,
            release.MinimumVersionCode,
            release.VersionCode,
            release.VersionName), context.RequestAborted);
    }

    public static int? TryReadVersionCode(string? value) =>
        int.TryParse(value?.Trim(), NumberStyles.None, CultureInfo.InvariantCulture, out var versionCode) && versionCode > 0
            ? versionCode
            : null;

    private static bool IsMobileApiPath(PathString path) =>
        path.StartsWithSegments("/api/v1/mobile", StringComparison.OrdinalIgnoreCase)
        || path.StartsWithSegments("/api/v2/mobile", StringComparison.OrdinalIgnoreCase);
}

public sealed record MobileAppUpdateRequiredDto(
    string Code,
    string Message,
    int? InstalledVersionCode,
    int MinimumVersionCode,
    int LatestVersionCode,
    string LatestVersionName);

public static class MobileAppUpdateRegistration
{
    public const string ApkDownloadRateLimitPolicy = "mobile-apk-download";

    public static IServiceCollection AddMobileAppUpdates(this IServiceCollection services)
    {
        services.AddSingleton<IMobileAppReleaseCatalog, MobileAppReleaseCatalog>();
        return services;
    }

    /// <summary>
    /// A whole shift may tap "Обновить" at once; keep the APK stream from
    /// saturating the server and queue the rest instead of failing them.
    /// </summary>
    public static RateLimiterOptions AddMobileApkDownloadLimiter(this RateLimiterOptions options)
    {
        options.AddConcurrencyLimiter(ApkDownloadRateLimitPolicy, limiter =>
        {
            limiter.PermitLimit = 16;
            limiter.QueueLimit = 128;
            limiter.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        });
        return options;
    }

    public static IApplicationBuilder UseMobileAppVersionGate(this IApplicationBuilder app) =>
        app.UseMiddleware<MobileAppVersionGateMiddleware>();
}
