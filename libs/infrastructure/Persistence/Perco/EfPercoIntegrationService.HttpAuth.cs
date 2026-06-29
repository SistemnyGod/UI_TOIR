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
    private async Task<PercoSession> CreateAuthenticatedSessionAsync(
        PercoIntegrationSettingsEntity settings,
        CancellationToken cancellationToken)
    {
        var cookieContainer = new CookieContainer();
        var handler = new HttpClientHandler
        {
            CookieContainer = cookieContainer,
            AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate | DecompressionMethods.Brotli
        };
        var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri(settings.BaseUrl.TrimEnd('/') + "/"),
            Timeout = TimeSpan.FromSeconds(30)
        };

        var authMode = NormalizeAuthMode(settings.AuthMode);
        if (authMode == AuthModeToken)
        {
            var tokenCanBeRead = TryUnprotect(settings.TokenEncrypted, out var token);
            if (!tokenCanBeRead && !string.IsNullOrWhiteSpace(settings.TokenEncrypted))
            {
                throw new InvalidOperationException("Сохраненный токен PERCo-Web не удалось расшифровать. Введите токен заново и сохраните настройки.");
            }

            if (string.IsNullOrWhiteSpace(token))
            {
                throw new InvalidOperationException("Для режима Token укажите Bearer token PERCo-Web.");
            }

            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return new PercoSession(httpClient, settings, authMode);
        }

        if (TryGetValidSessionToken(settings, out var sessionToken))
        {
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", sessionToken);
            return new PercoSession(httpClient, settings, authMode);
        }

        await AuthenticateWithLoginPasswordAsync(settings, httpClient, cancellationToken);
        return new PercoSession(httpClient, settings, authMode);
    }

    private async Task AuthenticateWithLoginPasswordAsync(
        PercoIntegrationSettingsEntity settings,
        HttpClient httpClient,
        CancellationToken cancellationToken)
    {
        var passwordCanBeRead = TryUnprotect(settings.PasswordEncrypted, out var password);
        if (!passwordCanBeRead && !string.IsNullOrWhiteSpace(settings.PasswordEncrypted))
        {
            throw new InvalidOperationException("Сохраненный пароль PERCo-Web не удалось расшифровать. Введите пароль заново и сохраните настройки.");
        }

        if (string.IsNullOrWhiteSpace(settings.Username) || string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException("Для режима LoginPassword укажите логин и пароль PERCo-Web.");
        }

        using var response = await httpClient.PostAsJsonAsync(
            "/api/system/auth",
            new { login = settings.Username, password },
            JsonOptions,
            cancellationToken);
        response.EnsureSuccessStatusCode();
        var auth = await response.Content.ReadFromJsonAsync<PercoAuthResponse>(JsonOptions, cancellationToken);
        if (string.IsNullOrWhiteSpace(auth?.Token))
        {
            throw new InvalidOperationException("PERCo-Web не вернул session token после авторизации.");
        }

        settings.SessionTokenEncrypted = Protect(auth.Token);
        settings.SessionTokenExpiresAt = DateTimeOffset.UtcNow.Add(SessionTokenTtl);
        settings.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
    }

    private bool TryGetValidSessionToken(PercoIntegrationSettingsEntity settings, out string token)
    {
        token = string.Empty;
        if (settings.SessionTokenExpiresAt is null || settings.SessionTokenExpiresAt <= DateTimeOffset.UtcNow.AddMinutes(1))
        {
            return false;
        }

        if (TryUnprotect(settings.SessionTokenEncrypted, out var candidate) && !string.IsNullOrWhiteSpace(candidate))
        {
            token = candidate;
            return true;
        }

        ClearSessionToken(settings);
        return false;
    }

    private async Task<bool> RefreshLoginSessionAsync(PercoSession session, CancellationToken cancellationToken)
    {
        if (session.AuthMode != AuthModeLoginPassword)
        {
            return false;
        }

        ClearSessionToken(session.Settings);
        await AuthenticateWithLoginPasswordAsync(session.Settings, session.HttpClient, cancellationToken);
        return true;
    }

    private static string BuildEventsEndpoint(
        PercoIntegrationSettingsEntity settings,
        PercoSyncStateEntity syncState,
        int page,
        int rows,
        DateTimeOffset nowUtc)
    {
        var endpoint = settings.EventsEndpoint;
        if (IsAccessReportEventsEndpoint(endpoint))
        {
            var zone = ResolveTimezone(settings.Timezone);
            var localToday = TimeZoneInfo.ConvertTime(nowUtc, zone).Date;
            var localStart = syncState.LastSuccessAt is null
                ? localToday.AddDays(-7)
                : TimeZoneInfo.ConvertTime(syncState.LastSuccessAt.Value, zone).Date.AddDays(-1);

            if (!HasQueryParameter(endpoint, "dateBegin"))
            {
                endpoint = AppendQueryParameter(endpoint, "dateBegin", localStart.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
            }

            if (!HasQueryParameter(endpoint, "dateEnd"))
            {
                endpoint = AppendQueryParameter(endpoint, "dateEnd", localToday.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
            }
        }

        if (!HasQueryParameter(endpoint, "page"))
        {
            endpoint = AppendQueryParameter(endpoint, "page", page.ToString(CultureInfo.InvariantCulture));
        }

        if (!HasQueryParameter(endpoint, "rows"))
        {
            endpoint = AppendQueryParameter(endpoint, "rows", rows.ToString(CultureInfo.InvariantCulture));
        }

        return endpoint;
    }

    private static string BuildProbeEndpoint(string endpoint, PercoIntegrationSettingsEntity settings)
    {
        var probeEndpoint = endpoint;
        if (IsAccessReportEventsEndpoint(probeEndpoint))
        {
            var zone = ResolveTimezone(settings.Timezone);
            var localToday = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, zone).Date;
            var localStart = localToday.AddDays(-1);

            if (!HasQueryParameter(probeEndpoint, "dateBegin"))
            {
                probeEndpoint = AppendQueryParameter(probeEndpoint, "dateBegin", localStart.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
            }

            if (!HasQueryParameter(probeEndpoint, "dateEnd"))
            {
                probeEndpoint = AppendQueryParameter(probeEndpoint, "dateEnd", localToday.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
            }
        }

        if (!HasQueryParameter(probeEndpoint, "page"))
        {
            probeEndpoint = AppendQueryParameter(probeEndpoint, "page", "1");
        }

        if (!HasQueryParameter(probeEndpoint, "rows"))
        {
            probeEndpoint = AppendQueryParameter(probeEndpoint, "rows", "1");
        }

        return probeEndpoint;
    }

    private static bool IsAccessReportEventsEndpoint(string endpoint) =>
        endpoint.Contains("/accessReports/events", StringComparison.OrdinalIgnoreCase);

    private static bool IsPercoWebPageEndpoint(string endpoint)
    {
        var normalized = endpoint.Trim().TrimEnd('/');
        return normalized.Contains("/controlaccess/premisesaccess", StringComparison.OrdinalIgnoreCase)
            || string.Equals(normalized, "/dev", StringComparison.OrdinalIgnoreCase)
            || string.Equals(normalized, "/api", StringComparison.OrdinalIgnoreCase);
    }

    private static bool HasQueryParameter(string endpoint, string name)
    {
        var queryStart = endpoint.IndexOf('?', StringComparison.Ordinal);
        if (queryStart < 0 || queryStart == endpoint.Length - 1)
        {
            return false;
        }

        var query = endpoint[(queryStart + 1)..];
        foreach (var part in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var equals = part.IndexOf('=', StringComparison.Ordinal);
            var key = equals < 0 ? part : part[..equals];
            if (string.Equals(Uri.UnescapeDataString(key), name, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static string AppendQueryParameter(string endpoint, string name, string value)
    {
        var separator = endpoint.Contains('?') ? "&" : "?";
        return $"{endpoint}{separator}{Uri.EscapeDataString(name)}={Uri.EscapeDataString(value)}";
    }

    private static TimeZoneInfo ResolveTimezone(string timezone)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(timezone);
        }
        catch
        {
            return TimeZoneInfo.Local;
        }
    }

    private async Task<T?> GetJsonAsync<T>(
        PercoSession session,
        string endpoint,
        CancellationToken cancellationToken)
    {
        using var response = await GetAsyncWithReauthAsync(session, endpoint, cancellationToken);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<T>(JsonOptions, cancellationToken);
    }

    private async Task<HttpResponseMessage> GetAsyncWithReauthAsync(
        PercoSession session,
        string endpoint,
        CancellationToken cancellationToken)
    {
        var response = await session.HttpClient.GetAsync(endpoint, cancellationToken);
        if (response.StatusCode != HttpStatusCode.Unauthorized || !await RefreshLoginSessionAsync(session, cancellationToken))
        {
            return response;
        }

        response.Dispose();
        return await session.HttpClient.GetAsync(endpoint, cancellationToken);
    }

    private static async Task<string> ReadBodyPreviewAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (body.Length <= 1000)
        {
            return body;
        }

        return body[..1000];
    }
}
