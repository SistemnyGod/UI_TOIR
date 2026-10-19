using System.Security.Cryptography;
using System.Text.Json;

namespace Patrol360.Api.MobileAppUpdates;

/// <summary>
/// A published Android build. <see cref="MinimumVersionCode"/> is already the
/// effective minimum: the larger of the configured and the manifest value,
/// capped at <see cref="VersionCode"/> so that a phone is never blocked
/// without an APK it could install.
/// </summary>
public sealed record MobileAppRelease(
    string VersionName,
    int VersionCode,
    int MinimumVersionCode,
    string ApkFilePath,
    string ApkFileName,
    long SizeBytes,
    string Sha256,
    string ReleaseNotes,
    DateTimeOffset PublishedAt,
    bool RejectClientsWithoutVersionCode);

public interface IMobileAppReleaseCatalog
{
    MobileAppRelease? GetCurrentRelease();
}

/// <summary>
/// Reads the release published in the configured folder:
/// <c>release.json</c> plus the APK it names. APK files never live in git;
/// operators copy them to the server folder (see the mobile audit doc).
/// The SHA-256 is recomputed only when the APK file changes.
/// </summary>
public sealed class MobileAppReleaseCatalog(
    IConfiguration configuration,
    ILogger<MobileAppReleaseCatalog> logger) : IMobileAppReleaseCatalog
{
    public const string ConfigurationSection = "Patrol360:Mobile:AppUpdates";
    public const string ManifestFileName = "release.json";
    public const int MaxReleaseNotesLength = 2000;

    private static readonly JsonSerializerOptions ManifestJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    private readonly Lock sync = new();
    private ManifestSnapshot? manifestCache;
    private ApkHashSnapshot? hashCache;
    private string? lastReportedProblem;

    public MobileAppRelease? GetCurrentRelease()
    {
        var directory = ResolveReleaseDirectory();
        var manifestFile = new FileInfo(Path.Combine(directory, ManifestFileName));
        if (!manifestFile.Exists)
        {
            ReportProblemOnce(null);
            return null;
        }

        lock (sync)
        {
            try
            {
                var manifest = ReadManifest(manifestFile);
                var apkFile = new FileInfo(Path.Combine(directory, manifest.ApkFileName));
                if (!apkFile.Exists || apkFile.Length <= 0)
                {
                    ReportProblemOnce($"APK file '{manifest.ApkFileName}' named in {manifestFile.FullName} is missing or empty.");
                    return null;
                }

                var sha256 = ReadApkSha256(apkFile);
                if (manifest.Sha256 is not null && !string.Equals(manifest.Sha256, sha256, StringComparison.Ordinal))
                {
                    ReportProblemOnce($"SHA-256 of '{apkFile.FullName}' does not match {ManifestFileName}; the release is not offered.");
                    return null;
                }

                ReportProblemOnce(null);
                var section = configuration.GetSection(ConfigurationSection);
                var configuredMinimum = Math.Max(0, section.GetValue("MinimumVersionCode", 0));
                var effectiveMinimum = Math.Min(Math.Max(configuredMinimum, manifest.MinimumVersionCode), manifest.VersionCode);
                return new MobileAppRelease(
                    manifest.VersionName,
                    manifest.VersionCode,
                    effectiveMinimum,
                    apkFile.FullName,
                    apkFile.Name,
                    apkFile.Length,
                    sha256,
                    manifest.ReleaseNotes,
                    new DateTimeOffset(apkFile.LastWriteTimeUtc, TimeSpan.Zero),
                    section.GetValue("RejectClientsWithoutVersionCode", false));
            }
            catch (Exception error) when (error is InvalidDataException or JsonException or IOException or UnauthorizedAccessException)
            {
                ReportProblemOnce($"Mobile release in {directory} is not offered: {error.Message}");
                return null;
            }
        }
    }

    private string ResolveReleaseDirectory()
    {
        var configured = configuration[$"{ConfigurationSection}:ReleaseDirectory"];
        return Path.GetFullPath(string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(Directory.GetCurrentDirectory(), "mobile-releases")
            : configured);
    }

    private ManifestSnapshot.Values ReadManifest(FileInfo manifestFile)
    {
        var fingerprint = new FileFingerprint(manifestFile.FullName, manifestFile.Length, manifestFile.LastWriteTimeUtc);
        if (manifestCache is not null && manifestCache.Fingerprint == fingerprint)
        {
            return manifestCache.Manifest;
        }

        var raw = JsonSerializer.Deserialize<RawManifest>(File.ReadAllText(manifestFile.FullName), ManifestJsonOptions)
            ?? throw new InvalidDataException($"{ManifestFileName} is empty.");
        var manifest = ValidateManifest(raw);
        manifestCache = new ManifestSnapshot(fingerprint, manifest);
        return manifest;
    }

    internal static ManifestSnapshot.Values ValidateManifest(RawManifest raw)
    {
        var versionName = raw.VersionName?.Trim();
        if (string.IsNullOrEmpty(versionName) || versionName.Length > 40)
        {
            throw new InvalidDataException("versionName is required (at most 40 characters).");
        }

        if (raw.VersionCode is not > 0)
        {
            throw new InvalidDataException("versionCode must be a positive integer.");
        }

        var minimum = raw.MinimumVersionCode ?? 0;
        if (minimum < 0 || minimum > raw.VersionCode)
        {
            throw new InvalidDataException("minimumVersionCode must be between 0 and versionCode.");
        }

        var apkFileName = raw.ApkFileName?.Trim();
        if (string.IsNullOrEmpty(apkFileName)
            || apkFileName != Path.GetFileName(apkFileName)
            || apkFileName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0
            || apkFileName.Contains("..", StringComparison.Ordinal)
            || !apkFileName.EndsWith(".apk", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException("apkFileName must be a plain *.apk file name in the release folder.");
        }

        string? sha256 = null;
        if (!string.IsNullOrWhiteSpace(raw.Sha256))
        {
            sha256 = raw.Sha256.Trim().ToLowerInvariant();
            if (sha256.Length != 64 || !sha256.All(Uri.IsHexDigit))
            {
                throw new InvalidDataException("sha256 must contain 64 hexadecimal characters.");
            }
        }

        var releaseNotes = raw.ReleaseNotes?.Trim() ?? "";
        if (releaseNotes.Length > MaxReleaseNotesLength)
        {
            throw new InvalidDataException($"releaseNotes must not exceed {MaxReleaseNotesLength} characters.");
        }

        return new ManifestSnapshot.Values(versionName, raw.VersionCode.Value, minimum, apkFileName, sha256, releaseNotes);
    }

    private string ReadApkSha256(FileInfo apkFile)
    {
        var fingerprint = new FileFingerprint(apkFile.FullName, apkFile.Length, apkFile.LastWriteTimeUtc);
        if (hashCache is not null && hashCache.Fingerprint == fingerprint)
        {
            return hashCache.Sha256;
        }

        using var stream = new FileStream(apkFile.FullName, FileMode.Open, FileAccess.Read, FileShare.Read, 1024 * 1024);
        var sha256 = Convert.ToHexStringLower(SHA256.HashData(stream));
        hashCache = new ApkHashSnapshot(fingerprint, sha256);
        return sha256;
    }

    private void ReportProblemOnce(string? problem)
    {
        if (problem == lastReportedProblem)
        {
            return;
        }

        lastReportedProblem = problem;
        if (problem is not null)
        {
            logger.LogWarning("{Problem}", problem);
        }
    }

    internal sealed record RawManifest(
        string? VersionName,
        int? VersionCode,
        int? MinimumVersionCode,
        string? ApkFileName,
        string? Sha256,
        string? ReleaseNotes);

    internal sealed record ManifestSnapshot(FileFingerprint Fingerprint, ManifestSnapshot.Values Manifest)
    {
        internal sealed record Values(
            string VersionName,
            int VersionCode,
            int MinimumVersionCode,
            string ApkFileName,
            string? Sha256,
            string ReleaseNotes);
    }

    private sealed record ApkHashSnapshot(FileFingerprint Fingerprint, string Sha256);

    internal sealed record FileFingerprint(string Path, long Length, DateTime LastWriteTimeUtc);
}
