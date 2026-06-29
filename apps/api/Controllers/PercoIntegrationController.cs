using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/integrations/perco")]
public sealed class PercoIntegrationController(
    IPercoIntegrationService percoIntegrationService,
    IAuthSessionService authSessionService) : ControllerBase
{
    [HttpGet("settings")]
    [RequirePermission("integrations.perco.view")]
    public async Task<ActionResult<PercoIntegrationSettingsDto>> GetSettings(CancellationToken cancellationToken) =>
        Ok(await percoIntegrationService.GetSettingsAsync(cancellationToken));

    [HttpPut("settings")]
    [RequirePermission("integrations.perco.manage")]
    public async Task<ActionResult<PercoIntegrationSettingsDto>> UpdateSettings(
        UpdatePercoIntegrationSettingsDto request,
        CancellationToken cancellationToken)
    {
        var actor = ReadCurrentUser();
        return Ok(await percoIntegrationService.UpdateSettingsAsync(request, actor.UserId, cancellationToken));
    }

    [HttpPost("test-connection")]
    [RequirePermission("integrations.perco.manage")]
    public async Task<ActionResult<PercoConnectionTestResultDto>> TestConnection(CancellationToken cancellationToken)
    {
        var actor = ReadCurrentUser();
        return Ok(await percoIntegrationService.TestConnectionAsync(actor.UserId, cancellationToken));
    }

    [HttpPost("check-secret")]
    [RequirePermission("integrations.perco.manage")]
    public async Task<ActionResult<PercoSecretStatusDto>> CheckSecret(CancellationToken cancellationToken) =>
        Ok(await percoIntegrationService.CheckSecretStatusAsync("api", cancellationToken));

    [HttpPost("sync-employees")]
    [RequirePermission("integrations.perco.sync")]
    public async Task<ActionResult<PercoSyncResultDto>> SyncEmployees(CancellationToken cancellationToken)
    {
        var actor = ReadCurrentUser();
        return Ok(await percoIntegrationService.SyncEmployeesAsync(actor.UserId, cancellationToken));
    }

    [HttpPost("sync-events")]
    [RequirePermission("integrations.perco.sync")]
    public async Task<ActionResult<PercoSyncResultDto>> SyncEvents(CancellationToken cancellationToken)
    {
        var actor = ReadCurrentUser();
        return Ok(await percoIntegrationService.SyncEventsAsync(actor.UserId, cancellationToken));
    }

    [HttpGet("unmatched-employees")]
    [RequirePermission("integrations.perco.match")]
    public async Task<ActionResult<IReadOnlyList<PercoUnmatchedEmployeeDto>>> GetUnmatchedEmployees(CancellationToken cancellationToken) =>
        Ok(await percoIntegrationService.GetUnmatchedEmployeesAsync(cancellationToken));

    [HttpPost("match-employee")]
    [RequirePermission("integrations.perco.match")]
    public async Task<ActionResult<PercoSyncResultDto>> MatchEmployee(
        MatchPercoEmployeeDto request,
        CancellationToken cancellationToken)
    {
        var actor = ReadCurrentUser();
        return Ok(await percoIntegrationService.MatchEmployeeAsync(request, actor.UserId, cancellationToken));
    }

    [HttpGet("logs")]
    [RequirePermission("integrations.perco.logs.view")]
    public async Task<ActionResult<IReadOnlyList<PercoIntegrationLogDto>>> GetLogs(
        [FromQuery] int take = 100,
        CancellationToken cancellationToken = default) =>
        Ok(await percoIntegrationService.GetLogsAsync(take, cancellationToken));

    [HttpGet("diagnostics")]
    [RequirePermission("integrations.perco.view")]
    public async Task<ActionResult<PercoDiagnosticsDto>> GetDiagnostics(
        [FromQuery] int take = 100,
        CancellationToken cancellationToken = default) =>
        Ok(await percoIntegrationService.GetDiagnosticsAsync(take, cancellationToken));

    [HttpPatch("presence-intervals/{intervalId:guid}/close")]
    [RequirePermission("integrations.perco.manage")]
    public async Task<ActionResult<PercoSyncResultDto>> ClosePresenceInterval(
        Guid intervalId,
        ClosePercoPresenceIntervalDto request,
        CancellationToken cancellationToken)
    {
        var actor = ReadCurrentUser();
        return Ok(await percoIntegrationService.ClosePresenceIntervalAsync(intervalId, request, actor.UserId, cancellationToken));
    }

    private (Guid? UserId, string DisplayName) ReadCurrentUser()
    {
        var token = ReadBearerToken();
        var user = token is null ? null : authSessionService.GetCurrentUser(token);
        return user is null ? (null, "system") : (user.Id, user.DisplayName);
    }

    private string? ReadBearerToken()
    {
        if (!Request.Headers.TryGetValue(HeaderNames.Authorization, out var values))
        {
            return null;
        }

        var header = values.FirstOrDefault();
        if (header is null || !header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return header["Bearer ".Length..].Trim();
    }
}
