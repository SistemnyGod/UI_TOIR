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
    private sealed record PercoSession(
        HttpClient HttpClient,
        PercoIntegrationSettingsEntity Settings,
        string AuthMode) : IDisposable
    {
        public void Dispose() => HttpClient.Dispose();
    }

    private sealed record PercoAuthResponse([property: JsonPropertyName("token")] string? Token);

    private sealed record PercoPresenceAnalysis(
        string Reason,
        string SuggestedAction,
        int Confidence);

    private sealed record PercoStaffRow(
        [property: JsonPropertyName("id")] long Id,
        [property: JsonPropertyName("last_name")] string? LastName,
        [property: JsonPropertyName("first_name")] string? FirstName,
        [property: JsonPropertyName("middle_name")] string? MiddleName,
        [property: JsonPropertyName("tabel_number")] string? TabelNumber,
        [property: JsonPropertyName("division_name")] string? DivisionName,
        [property: JsonPropertyName("position_name")] string? PositionName,
        [property: JsonPropertyName("is_active")] int IsActive);

    private sealed record PercoEventsResponse(
        [property: JsonPropertyName("page")] int Page,
        [property: JsonPropertyName("records")] int Records,
        [property: JsonPropertyName("total")] int Total,
        [property: JsonPropertyName("rows")] List<PercoEventRow> Rows);

    private sealed record PercoEventRow(
        [property: JsonPropertyName("id")] long Id,
        [property: JsonPropertyName("time_label")] string? TimeLabel,
        [property: JsonPropertyName("fio")] string? Fio,
        [property: JsonPropertyName("event_name")] string? EventName,
        [property: JsonPropertyName("identifier")] string? Identifier,
        [property: JsonPropertyName("user_id")] long? UserId,
        [property: JsonPropertyName("zone_exit")] string? ZoneExit,
        [property: JsonPropertyName("zone_exit_id")] long? ZoneExitId,
        [property: JsonPropertyName("zone_enter")] string? ZoneEnter,
        [property: JsonPropertyName("zone_enter_id")] long? ZoneEnterId,
        [property: JsonPropertyName("verify_point")] string? VerifyPoint,
        [property: JsonPropertyName("division_name")] string? DivisionName,
        [property: JsonPropertyName("position_name")] string? PositionName);
}
