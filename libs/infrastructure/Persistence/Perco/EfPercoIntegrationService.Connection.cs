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
    public async Task<PercoConnectionTestResultDto> TestConnectionAsync(
        Guid? actorUserId,
        CancellationToken cancellationToken = default)
    {
        var settings = await GetOrCreateSettingsAsync(cancellationToken);
        var startedAt = DateTimeOffset.UtcNow;

        if (string.IsNullOrWhiteSpace(settings.BaseUrl))
        {
            return await SaveConnectionResultAsync(
                settings,
                actorUserId,
                startedAt,
                false,
                false,
                [],
                "Адрес сервера PERCo-Web не заполнен.",
                "BaseUrl is empty.",
                cancellationToken);
        }

        try
        {
            using var session = await CreateAuthenticatedSessionAsync(settings, cancellationToken);
            using var devResponse = await GetAsyncWithReauthAsync(session, settings.DevPath, cancellationToken);
            var bodyPreview = await ReadBodyPreviewAsync(devResponse, cancellationToken);
            var discovered = await DiscoverEndpointsAsync(session, settings, cancellationToken);
            var success = devResponse.IsSuccessStatusCode;
            var message = success
                ? "Подключение к PERCo-Web проверено. API сотрудников и проходов обнаружены."
                : $"PERCo-Web /dev ответил статусом {(int)devResponse.StatusCode}.";

            settings.LastDiscoverySummary = string.Join("; ", discovered.Select(item => $"{item.Kind}: {item.Url} ({item.Status})"));

            return await SaveConnectionResultAsync(
                settings,
                actorUserId,
                startedAt,
                success,
                discovered.Any(item => item.Status == "available"),
                discovered,
                message,
                string.IsNullOrWhiteSpace(bodyPreview) ? settings.LastDiscoverySummary : $"{settings.LastDiscoverySummary}\n{bodyPreview}",
                cancellationToken);
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException or UriFormatException or InvalidOperationException)
        {
            return await SaveConnectionResultAsync(
                settings,
                actorUserId,
                startedAt,
                false,
                false,
                [],
                "Ошибка подключения к PERCo-Web.",
                exception.Message,
                cancellationToken);
        }
    }

    private async Task<IReadOnlyList<PercoDiscoveredEndpointDto>> DiscoverEndpointsAsync(
        PercoSession session,
        PercoIntegrationSettingsEntity settings,
        CancellationToken cancellationToken)
    {
        var endpoints = new List<PercoDiscoveredEndpointDto>();
        endpoints.Add(await ProbeEndpointAsync(session, "employees", settings.EmployeesEndpoint, settings, cancellationToken));
        endpoints.Add(await ProbeEndpointAsync(session, "events", settings.EventsEndpoint, settings, cancellationToken));
        return endpoints;
    }

    private async Task<PercoDiscoveredEndpointDto> ProbeEndpointAsync(
        PercoSession session,
        string kind,
        string endpoint,
        PercoIntegrationSettingsEntity settings,
        CancellationToken cancellationToken)
    {
        try
        {
            var probeEndpoint = BuildProbeEndpoint(endpoint, settings);
            using var response = await GetAsyncWithReauthAsync(session, probeEndpoint, cancellationToken);
            return new PercoDiscoveredEndpointDto(kind, endpoint, response.IsSuccessStatusCode ? "available" : $"http_{(int)response.StatusCode}");
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            return new PercoDiscoveredEndpointDto(kind, endpoint, "error");
        }
    }

    private async Task<PercoConnectionTestResultDto> SaveConnectionResultAsync(
        PercoIntegrationSettingsEntity settings,
        Guid? actorUserId,
        DateTimeOffset startedAt,
        bool devAvailable,
        bool authAvailable,
        IReadOnlyList<PercoDiscoveredEndpointDto> discoveredEndpoints,
        string message,
        string details,
        CancellationToken cancellationToken)
    {
        var finishedAt = DateTimeOffset.UtcNow;
        var status = devAvailable && authAvailable ? "SUCCESS" : "ERROR";
        settings.LastConnectionCheckAt = finishedAt;
        settings.LastConnectionStatus = status;
        settings.LastConnectionError = status == "SUCCESS" ? string.Empty : SanitizeDbText(details, 2000);
        settings.LastDiscoverySummary = SanitizeDbText(settings.LastDiscoverySummary, 2000);
        settings.UpdatedAt = finishedAt;

        await AddLogAsync(
            "TEST_CONNECTION",
            status,
            message,
            details,
            actorUserId,
            startedAt,
            finishedAt,
            cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new PercoConnectionTestResultDto(
            status == "SUCCESS",
            message,
            devAvailable,
            authAvailable,
            discoveredEndpoints,
            finishedAt);
    }
}
