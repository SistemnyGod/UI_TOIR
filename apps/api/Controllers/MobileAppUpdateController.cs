using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Patrol360.Api.MobileAppUpdates;

namespace Patrol360.Api.Controllers;

/// <summary>
/// In-app updates for the Android app. Anonymous like health and sign-in:
/// a phone whose version is too old, or whose session expired, must still be
/// able to fetch the update. The contour check keeps a phone from installing
/// a build of another contour.
/// </summary>
[ApiController]
[Route("api/v1/mobile/app-update")]
[AllowAnonymous]
[AllowOutdatedMobileApp]
public sealed class MobileAppUpdateController(
    IMobileAppReleaseCatalog releaseCatalog,
    IConfiguration configuration) : ControllerBase
{
    public const string ApkContentType = "application/vnd.android.package-archive";
    public const string ContourHeader = "X-Patrol360-Contour";
    public const string ApkSha256Header = "X-Patrol360-Apk-Sha256";

    [HttpGet]
    public ActionResult<MobileAppUpdateManifestDto> GetManifest([FromQuery] string? contourId = null)
    {
        if (!IsExpectedContour(contourId))
        {
            return BadRequest(new { code = "wrong_contour" });
        }

        Response.Headers.CacheControl = "no-store";
        var release = releaseCatalog.GetCurrentRelease();
        if (release is null)
        {
            return NotFound(new { code = "app_update_not_published", message = "На сервере не опубликована версия приложения." });
        }

        return Ok(new MobileAppUpdateManifestDto(
            release.VersionName,
            release.VersionCode,
            release.MinimumVersionCode,
            release.SizeBytes,
            release.Sha256,
            release.ReleaseNotes,
            ApkPath(release.VersionCode),
            release.PublishedAt));
    }

    [HttpGet("apk/{versionCode:int}")]
    [EnableRateLimiting(MobileAppUpdateRegistration.ApkDownloadRateLimitPolicy)]
    public IActionResult DownloadApk(int versionCode, [FromQuery] string? contourId = null)
    {
        if (!IsExpectedContour(contourId))
        {
            return BadRequest(new { code = "wrong_contour" });
        }

        var release = releaseCatalog.GetCurrentRelease();
        if (release is null || release.VersionCode != versionCode)
        {
            // The client re-reads the manifest: the published build changed.
            return NotFound(new { code = "app_update_version_unavailable", message = "Эта версия больше не опубликована. Проверьте обновления ещё раз." });
        }

        Response.Headers[ApkSha256Header] = release.Sha256;
        return PhysicalFile(release.ApkFilePath, ApkContentType, release.ApkFileName, enableRangeProcessing: true);
    }

    public static string ApkPath(int versionCode) => $"/api/v1/mobile/app-update/apk/{versionCode}";

    private string MobileContourId => configuration["Patrol360:Mobile:ContourId"]
        ?? Environment.GetEnvironmentVariable("PATROL360_CONTOUR_ID")
        ?? "patrol360-local-enterprise";

    private bool IsExpectedContour(string? queryContourId)
    {
        var contourId = Request.Headers[ContourHeader].ToString();
        if (string.IsNullOrWhiteSpace(contourId))
        {
            contourId = queryContourId ?? "";
        }

        return !string.IsNullOrWhiteSpace(contourId)
            && string.Equals(contourId.Trim(), MobileContourId, StringComparison.Ordinal);
    }
}

public sealed record MobileAppUpdateManifestDto(
    string VersionName,
    int VersionCode,
    int MinimumVersionCode,
    long ApkSizeBytes,
    string Sha256,
    string ReleaseNotes,
    string DownloadUrl,
    DateTimeOffset PublishedAt);
