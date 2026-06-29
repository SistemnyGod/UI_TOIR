using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfPercoIntegrationService
{
    public async Task<PercoIntegrationSettingsDto> GetSettingsAsync(CancellationToken cancellationToken = default)
    {
        var settings = await GetOrCreateSettingsAsync(cancellationToken);
        return ToDto(settings);
    }

    public async Task<PercoIntegrationSettingsDto> UpdateSettingsAsync(
        UpdatePercoIntegrationSettingsDto request,
        Guid? actorUserId,
        CancellationToken cancellationToken = default)
    {
        var settings = await GetOrCreateSettingsAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;

        settings.IsEnabled = request.IsEnabled;
        var previousAuthMode = NormalizeAuthMode(settings.AuthMode);
        var authMode = NormalizeAuthMode(request.AuthMode);
        settings.AuthMode = authMode;
        settings.BaseUrl = NormalizeBaseUrl(request.BaseUrl);
        settings.Username = (request.Username ?? string.Empty).Trim();
        settings.Timezone = NormalizeTimezone(request.Timezone);
        settings.EmployeesSyncMinutes = Clamp(request.EmployeesSyncMinutes, 5, 1440);
        settings.EventsSyncMinutes = Clamp(request.EventsSyncMinutes, 1, 1440);
        settings.ShiftStartToleranceMinutes = Clamp(request.ShiftStartToleranceMinutes, 0, 1440);
        settings.ShiftEndToleranceMinutes = Clamp(request.ShiftEndToleranceMinutes, 0, 1440);
        settings.DevPath = NormalizePath(request.DevPath, "/dev");
        settings.EmployeesEndpoint = NormalizePath(request.EmployeesEndpoint, DefaultEmployeesEndpoint);
        settings.EventsEndpoint = NormalizeEventsEndpoint(request.EventsEndpoint);
        settings.UpdatedAt = now;

        if (!string.IsNullOrWhiteSpace(request.Password))
        {
            settings.PasswordEncrypted = Protect(request.Password);
        }

        if (!string.IsNullOrWhiteSpace(request.Token))
        {
            settings.TokenEncrypted = Protect(request.Token);
        }

        if (previousAuthMode != authMode || !string.IsNullOrWhiteSpace(request.Password) || !string.IsNullOrWhiteSpace(request.Token))
        {
            ClearSessionToken(settings);
        }

        await AddLogAsync(
            "UPDATE_SETTINGS",
            "SUCCESS",
            "Настройки PERCo-Web сохранены.",
            string.Empty,
            actorUserId,
            now,
            now,
            cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        return ToDto(settings);
    }

    private async Task<PercoIntegrationSettingsEntity> GetOrCreateSettingsAsync(CancellationToken cancellationToken)
    {
        var settings = await dbContext.PercoIntegrationSettings.FirstOrDefaultAsync(cancellationToken);
        if (settings is not null)
        {
            var changed = false;
            var normalizedAuthMode = NormalizeAuthMode(settings.AuthMode);
            if (settings.AuthMode != normalizedAuthMode)
            {
                settings.AuthMode = normalizedAuthMode;
                changed = true;
            }

            if (string.IsNullOrWhiteSpace(settings.EmployeesEndpoint))
            {
                settings.EmployeesEndpoint = DefaultEmployeesEndpoint;
                changed = true;
            }

            if (string.IsNullOrWhiteSpace(settings.EventsEndpoint) || IsPercoWebPageEndpoint(settings.EventsEndpoint))
            {
                settings.EventsEndpoint = DefaultEventsEndpoint;
                changed = true;
            }

            if (changed)
            {
                settings.UpdatedAt = DateTimeOffset.UtcNow;
                await dbContext.SaveChangesAsync(cancellationToken);
            }

            return settings;
        }

        settings = new PercoIntegrationSettingsEntity
        {
            Id = SingletonSettingsId,
            AuthMode = AuthModeLoginPassword,
            BaseUrl = "http://192.168.2.76",
            Username = "patrol",
            DevPath = "/dev",
            EmployeesEndpoint = DefaultEmployeesEndpoint,
            EventsEndpoint = DefaultEventsEndpoint,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.PercoIntegrationSettings.Add(settings);
        await dbContext.SaveChangesAsync(cancellationToken);
        return settings;
    }

    private PercoIntegrationSettingsDto ToDto(PercoIntegrationSettingsEntity settings)
    {
        var passwordReadable = CanUnprotect(settings.PasswordEncrypted);
        var tokenReadable = CanUnprotect(settings.TokenEncrypted);
        var authMode = NormalizeAuthMode(settings.AuthMode);
        var hasUnreadablePassword = authMode == AuthModeLoginPassword && !string.IsNullOrWhiteSpace(settings.PasswordEncrypted) && !passwordReadable;
        var hasUnreadableToken = authMode == AuthModeToken && !string.IsNullOrWhiteSpace(settings.TokenEncrypted) && !tokenReadable;
        var secretError = hasUnreadablePassword
            ? "Сохраненный пароль PERCo-Web не удалось расшифровать. Введите пароль заново и сохраните настройки."
            : hasUnreadableToken
                ? "Сохраненный токен PERCo-Web не удалось расшифровать. Введите токен заново и сохраните настройки."
                : null;

        return new(
            settings.IsEnabled,
            authMode,
            settings.BaseUrl,
            string.IsNullOrWhiteSpace(settings.Username) ? null : settings.Username,
            passwordReadable,
            tokenReadable,
            settings.Timezone,
            settings.EmployeesSyncMinutes,
            settings.EventsSyncMinutes,
            settings.ShiftStartToleranceMinutes,
            settings.ShiftEndToleranceMinutes,
            settings.DevPath,
            settings.EmployeesEndpoint,
            settings.EventsEndpoint,
            settings.LastDiscoverySummary,
            settings.LastConnectionCheckAt,
            secretError is null ? (string.IsNullOrWhiteSpace(settings.LastConnectionStatus) ? null : settings.LastConnectionStatus) : "ERROR",
            secretError ?? (string.IsNullOrWhiteSpace(settings.LastConnectionError) ? null : settings.LastConnectionError),
            BuildSecretStatus(settings));
    }

    private string Protect(string value) => secretProtector.Protect(value.Trim());

    private static string NormalizeAuthMode(string? value) =>
        string.Equals(value, AuthModeToken, StringComparison.OrdinalIgnoreCase)
            ? AuthModeToken
            : AuthModeLoginPassword;

    private (string Status, string Error) EvaluatePrimarySecret(PercoIntegrationSettingsEntity settings)
    {
        var authMode = NormalizeAuthMode(settings.AuthMode);
        if (authMode == AuthModeToken)
        {
            if (string.IsNullOrWhiteSpace(settings.TokenEncrypted))
            {
                return ("ERROR", "Для режима Token не сохранен Bearer token PERCo-Web.");
            }

            return TryUnprotect(settings.TokenEncrypted, out var token) && !string.IsNullOrWhiteSpace(token)
                ? ("OK", string.Empty)
                : ("ERROR", "Сохраненный токен PERCo-Web не удалось расшифровать. Введите токен заново и сохраните настройки.");
        }

        if (string.IsNullOrWhiteSpace(settings.Username))
        {
            return ("ERROR", "Для режима LoginPassword не указан логин PERCo-Web.");
        }

        if (string.IsNullOrWhiteSpace(settings.PasswordEncrypted))
        {
            return ("ERROR", "Для режима LoginPassword не сохранен пароль PERCo-Web.");
        }

        return TryUnprotect(settings.PasswordEncrypted, out var password) && !string.IsNullOrWhiteSpace(password)
            ? ("OK", string.Empty)
            : ("ERROR", "Сохраненный пароль PERCo-Web не удалось расшифровать. Введите пароль заново и сохраните настройки.");
    }

    private static void UpdateSecretCheck(
        PercoIntegrationSettingsEntity settings,
        string component,
        string status,
        string error,
        DateTimeOffset checkedAt)
    {
        if (string.Equals(component, "worker", StringComparison.OrdinalIgnoreCase))
        {
            settings.LastWorkerSecretCheckAt = checkedAt;
            settings.LastWorkerSecretStatus = status;
            settings.LastWorkerSecretError = SanitizeDbText(error, 1000);
            settings.UpdatedAt = checkedAt;
            return;
        }

        settings.LastApiSecretCheckAt = checkedAt;
        settings.LastApiSecretStatus = status;
        settings.LastApiSecretError = SanitizeDbText(error, 1000);
        settings.UpdatedAt = checkedAt;
    }

    private static PercoSecretStatusDto BuildSecretStatus(PercoIntegrationSettingsEntity settings) =>
        new(
            string.IsNullOrWhiteSpace(settings.LastApiSecretStatus) ? "UNKNOWN" : settings.LastApiSecretStatus,
            settings.LastApiSecretCheckAt,
            string.IsNullOrWhiteSpace(settings.LastApiSecretError) ? null : settings.LastApiSecretError,
            string.IsNullOrWhiteSpace(settings.LastWorkerSecretStatus) ? "UNKNOWN" : settings.LastWorkerSecretStatus,
            settings.LastWorkerSecretCheckAt,
            string.IsNullOrWhiteSpace(settings.LastWorkerSecretError) ? null : settings.LastWorkerSecretError);

    private static void ClearSessionToken(PercoIntegrationSettingsEntity settings)
    {
        settings.SessionTokenEncrypted = string.Empty;
        settings.SessionTokenExpiresAt = null;
    }

    private bool CanUnprotect(string value) => TryUnprotect(value, out var _);

    private bool TryUnprotect(string value, out string unprotected)
    {
        unprotected = string.Empty;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        try
        {
            unprotected = secretProtector.Unprotect(value);
            return true;
        }
        catch
        {
            unprotected = string.Empty;
            return false;
        }
    }

    private static string NormalizeBaseUrl(string value)
    {
        var trimmed = value.Trim();
        return trimmed.Length == 0 ? "http://192.168.2.76" : trimmed.TrimEnd('/');
    }

    private static string NormalizeTimezone(string value)
    {
        var trimmed = value.Trim();
        return trimmed.Length == 0 ? "Asia/Yekaterinburg" : trimmed;
    }

    private static string NormalizePath(string? value, string fallback)
    {
        var trimmed = string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
        return trimmed.StartsWith('/') ? trimmed : "/" + trimmed;
    }

    private static string NormalizeEventsEndpoint(string? value)
    {
        var normalized = NormalizePath(value, DefaultEventsEndpoint);
        return IsPercoWebPageEndpoint(normalized) ? DefaultEventsEndpoint : normalized;
    }

    private static bool IsSyncDue(DateTimeOffset lastSuccessAt, DateTimeOffset now, int intervalMinutes)
    {
        var safeInterval = Math.Max(intervalMinutes, 1);
        return now - lastSuccessAt >= TimeSpan.FromMinutes(safeInterval);
    }

    private static string NormalizeName(string value) =>
        string.Join(' ', value.Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries));

    private static string JoinName(string? lastName, string? firstName, string? middleName) =>
        string.Join(' ', new[] { lastName, firstName, middleName }.Where(part => !string.IsNullOrWhiteSpace(part)).Select(part => part!.Trim()));

    private static int Clamp(int value, int min, int max) => Math.Min(Math.Max(value, min), max);
}
