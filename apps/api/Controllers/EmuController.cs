using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/emu")]
public sealed class EmuController(
    IEmuCatalogService catalogService,
    IEmuWorkService workService,
    IEmuPlanService planService,
    IAuthSessionService authSessionService) : ControllerBase
{
    [HttpGet("dashboard")]
    [RequirePermission("emu.view")]
    public ActionResult<EmuDashboardDto> Dashboard() => Ok(workService.GetDashboard());

    [HttpGet("settings")]
    [RequirePermission("emu.view")]
    public ActionResult<EmuSettingsDto> Settings() => Ok(catalogService.GetSettings());

    [HttpGet("sections")]
    [RequirePermission("emu.view")]
    public ActionResult<IReadOnlyList<EmuReferenceDto>> Sections() => Ok(catalogService.GetSettings().Sections);

    [HttpPost("sections")]
    [RequirePermission("emu.directories.manage")]
    public ActionResult<EmuReferenceDto> CreateSection(EmuCreateReferenceDto request) =>
        ToActionResult(catalogService.CreateSection(request));

    [HttpPatch("sections/{id:guid}")]
    [RequirePermission("emu.directories.manage")]
    public ActionResult<EmuReferenceDto> UpdateSection(Guid id, EmuUpdateReferenceDto request) =>
        ToActionResult(catalogService.UpdateSection(id, request));

    [HttpGet("wait-reasons")]
    [RequirePermission("emu.view")]
    public ActionResult<IReadOnlyList<EmuReferenceDto>> WaitReasons() => Ok(catalogService.GetSettings().WaitReasons);

    [HttpPost("wait-reasons")]
    [RequirePermission("emu.directories.manage")]
    public ActionResult<EmuReferenceDto> CreateWaitReason(EmuCreateReferenceDto request) =>
        ToActionResult(catalogService.CreateWaitReason(request));

    [HttpPatch("wait-reasons/{id:guid}")]
    [RequirePermission("emu.directories.manage")]
    public ActionResult<EmuReferenceDto> UpdateWaitReason(Guid id, EmuUpdateReferenceDto request) =>
        ToActionResult(catalogService.UpdateWaitReason(id, request));

    [HttpGet("not-completed-reasons")]
    [RequirePermission("emu.view")]
    public ActionResult<IReadOnlyList<EmuReferenceDto>> NotCompletedReasons() => Ok(catalogService.GetSettings().NotCompletedReasons);

    [HttpPost("not-completed-reasons")]
    [RequirePermission("emu.directories.manage")]
    public ActionResult<EmuReferenceDto> CreateNotCompletedReason(EmuCreateReferenceDto request) =>
        ToActionResult(catalogService.CreateNotCompletedReason(request));

    [HttpPatch("not-completed-reasons/{id:guid}")]
    [RequirePermission("emu.directories.manage")]
    public ActionResult<EmuReferenceDto> UpdateNotCompletedReason(Guid id, EmuUpdateReferenceDto request) =>
        ToActionResult(catalogService.UpdateNotCompletedReason(id, request));

    [HttpGet("work-templates")]
    [RequirePermission("emu.view")]
    public ActionResult<IReadOnlyList<EmuWorkTemplateDto>> WorkTemplates() => Ok(catalogService.GetSettings().WorkTemplates);

    [HttpPost("work-templates")]
    [RequirePermission("emu.directories.manage")]
    public ActionResult<EmuWorkTemplateDto> CreateWorkTemplate(EmuCreateWorkTemplateDto request) =>
        ToActionResult(catalogService.CreateWorkTemplate(request));

    [HttpPatch("work-templates/{id:guid}")]
    [RequirePermission("emu.directories.manage")]
    public ActionResult<EmuWorkTemplateDto> UpdateWorkTemplate(Guid id, EmuUpdateWorkTemplateDto request) =>
        ToActionResult(catalogService.UpdateWorkTemplate(id, request));

    [HttpGet("favorite-employees")]
    [RequirePermission("emu.view")]
    public ActionResult<IReadOnlyList<EmuFavoriteEmployeeDto>> FavoriteEmployees() => Ok(catalogService.GetFavoriteEmployees());

    [HttpPost("favorite-employees")]
    [RequirePermission("emu.favorite-employees.manage")]
    public ActionResult<EmuFavoriteEmployeeDto> AddFavoriteEmployee(EmuAddFavoriteEmployeeDto request) =>
        ToActionResult(catalogService.AddFavoriteEmployee(request));

    [HttpDelete("favorite-employees/{employeeId:guid}")]
    [RequirePermission("emu.favorite-employees.manage")]
    public ActionResult<EmuFavoriteEmployeeDto> RemoveFavoriteEmployee(Guid employeeId) =>
        ToActionResult(catalogService.RemoveFavoriteEmployee(employeeId));

    [HttpGet("work-sessions")]
    [RequirePermission("emu.view")]
    public ActionResult<EmuListResponseDto<EmuWorkSessionDto>> WorkSessions(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null,
        [FromQuery] Guid? employeeId = null,
        [FromQuery] Guid? sectionId = null,
        [FromQuery] string? status = null,
        [FromQuery] bool includeDeleted = false) =>
        Ok(workService.GetWorkSessions(new EmuWorkSessionQueryDto(
            DateFrom: dateFrom,
            DateTo: dateTo,
            EmployeeId: employeeId,
            SectionId: sectionId,
            Status: status,
            IncludeDeleted: includeDeleted,
            Page: page,
            PageSize: pageSize)));

    [HttpGet("work-sessions/changes")]
    [RequirePermission("emu.view")]
    public ActionResult<EmuWorkSessionChangesDto> WorkSessionChanges([FromQuery] DateTimeOffset since) =>
        Ok(workService.GetWorkSessionChanges(since));

    [HttpGet("work-sessions/{id:guid}")]
    [RequirePermission("emu.view")]
    public ActionResult<EmuWorkSessionDto> WorkSession(Guid id) => ToActionResult(workService.GetWorkSession(id));

    [HttpPost("work-sessions")]
    [RequirePermission("emu.work.create")]
    public ActionResult<EmuWorkSessionDto> CreateWorkSession(EmuCreateWorkSessionDto request)
    {
        var actor = ReadCurrentUser();
        return ToActionResult(workService.CreateWorkSession(request, actor.UserId, actor.DisplayName, actor.CanOverridePlanApproval));
    }

    [HttpPatch("work-sessions/{id:guid}")]
    [RequirePermission("emu.work.update")]
    public ActionResult<EmuWorkSessionDto> UpdateWorkSession(Guid id, EmuUpdateWorkSessionDto request)
    {
        var actor = ReadCurrentUser();
        return ToActionResult(workService.UpdateWorkSession(id, request, actor.UserId, actor.DisplayName));
    }

    [HttpDelete("work-sessions/{id:guid}")]
    [RequirePermission("emu.work.delete")]
    public ActionResult<EmuWorkSessionDto> DeleteWorkSession(Guid id, EmuDeleteWorkSessionDto request)
    {
        var actor = ReadCurrentUser();
        return ToActionResult(workService.DeleteWorkSession(id, request, actor.UserId, actor.DisplayName));
    }

    [HttpPost("work-sessions/{id:guid}/pause")]
    [RequirePermission("emu.work.pause")]
    public ActionResult<EmuWorkSessionDto> PauseWorkSession(Guid id, EmuPauseWorkSessionDto request)
    {
        var actor = ReadCurrentUser();
        return ToActionResult(workService.PauseWorkSession(id, request, actor.UserId, actor.DisplayName));
    }

    [HttpPost("work-sessions/{id:guid}/resume")]
    [RequirePermission("emu.work.pause")]
    public ActionResult<EmuWorkSessionDto> ResumeWorkSession(Guid id, EmuResumeWorkSessionDto request)
    {
        var actor = ReadCurrentUser();
        return ToActionResult(workService.ResumeWorkSession(id, request, actor.UserId, actor.DisplayName));
    }

    [HttpPost("work-sessions/{id:guid}/complete")]
    [RequirePermission("emu.work.complete")]
    public ActionResult<EmuWorkSessionDto> CompleteWorkSession(Guid id, EmuCompleteWorkSessionDto request)
    {
        var actor = ReadCurrentUser();
        return ToActionResult(workService.CompleteWorkSession(id, request, actor.UserId, actor.DisplayName));
    }

    [HttpGet("work-sessions/{id:guid}/audit")]
    [RequirePermission("emu.audit.view")]
    public ActionResult<EmuListResponseDto<EmuAuditEventDto>> WorkSessionAudit(Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 50) =>
        Ok(workService.GetWorkSessionAudit(id, page, pageSize));

    [HttpGet("plan-tasks")]
    [RequirePermission("emu.plan.view")]
    public ActionResult<EmuListResponseDto<EmuPlanTaskDto>> PlanTasks([FromQuery] DateOnly? weekStart = null) =>
        Ok(planService.GetPlanTasks(weekStart));

    [HttpGet("plan-tasks/changes")]
    [RequirePermission("emu.plan.view")]
    public ActionResult<EmuPlanTaskChangesDto> PlanTaskChanges([FromQuery] DateTimeOffset since) =>
        Ok(planService.GetPlanTaskChanges(since));

    [HttpPost("plan-tasks")]
    [RequirePermission("emu.plan.manage")]
    public ActionResult<EmuPlanTaskDto> CreatePlanTask(EmuUpsertPlanTaskDto request)
    {
        var actor = ReadCurrentUser();
        return ToActionResult(planService.CreatePlanTask(request, actor.UserId, actor.DisplayName));
    }

    [HttpPatch("plan-tasks/{id:guid}")]
    [RequirePermission("emu.plan.manage")]
    public ActionResult<EmuPlanTaskDto> UpdatePlanTask(Guid id, EmuUpsertPlanTaskDto request)
    {
        var actor = ReadCurrentUser();
        return ToActionResult(planService.UpdatePlanTask(id, request, actor.UserId, actor.DisplayName));
    }

    [HttpPost("plan-tasks/{id:guid}/approve")]
    [RequirePermission("emu.plan.approve")]
    public ActionResult<EmuPlanTaskDto> ApprovePlanTask(Guid id, EmuApprovePlanTaskDto request)
    {
        var actor = ReadCurrentUser();
        return ToActionResult(planService.ApprovePlanTask(id, request, actor.UserId, actor.DisplayName));
    }

    [HttpPost("plan-tasks/approve-week")]
    [RequirePermission("emu.plan.approve")]
    public ActionResult<IReadOnlyList<EmuPlanTaskDto>> ApproveWeek(EmuApproveWeekDto request)
    {
        var actor = ReadCurrentUser();
        return ToActionResult(planService.ApproveWeek(request, actor.UserId, actor.DisplayName));
    }

    private (Guid? UserId, string DisplayName, bool CanOverridePlanApproval) ReadCurrentUser()
    {
        var token = ReadBearerToken();
        var user = token is null ? null : authSessionService.GetCurrentUser(token);
        return user is null
            ? (null, "system", false)
            : (user.Id, user.DisplayName, user.Permissions.Contains("emu.plan.override-approval", StringComparer.OrdinalIgnoreCase));
    }

    private string? ReadBearerToken()
    {
        if (!Request.Headers.TryGetValue(HeaderNames.Authorization, out var values))
        {
            return null;
        }

        const string bearerPrefix = "Bearer ";
        var value = values.ToString();
        return value.StartsWith(bearerPrefix, StringComparison.OrdinalIgnoreCase)
            ? value[bearerPrefix.Length..].Trim()
            : null;
    }

    private ActionResult<T> ToActionResult<T>(EmuCommandResult<T> result)
    {
        if (result.Succeeded && result.Value is not null)
        {
            return Ok(result.Value);
        }

        return ValidationProblem(new ValidationProblemDetails(result.Errors.ToDictionary(error => error.Key, error => error.Value))
        {
            Title = "EMU command validation failed",
            Status = StatusCodes.Status400BadRequest
        });
    }
}
