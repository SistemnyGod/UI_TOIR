using System.Text;
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
    IEmuShiftService shiftService,
    IEmuPlanService planService,
    IAuthSessionService authSessionService,
    ISiteUserAdminService siteUserAdminService) : ControllerBase
{
    [HttpGet("dashboard")]
    [RequirePermission("emu.dashboard.view")]
    public ActionResult<EmuDashboardDto> Dashboard()
    {
        var actor = ReadCurrentUser();
        return Ok(workService.GetDashboard(GetAllowedEmuSectionIds(actor)));
    }

    [HttpGet("settings")]
    [RequirePermission("emu.view")]
    public ActionResult<EmuSettingsDto> Settings()
    {
        var actor = ReadCurrentUser();
        return Ok(FilterSettingsBySectionAccess(catalogService.GetSettings(), GetAllowedEmuSectionIds(actor)));
    }

    [HttpGet("sections")]
    [RequirePermission("emu.view")]
    public ActionResult<IReadOnlyList<EmuReferenceDto>> Sections()
    {
        var actor = ReadCurrentUser();
        return Ok(FilterSectionsByAccess(catalogService.GetSettings().Sections, GetAllowedEmuSectionIds(actor)));
    }

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
    public ActionResult<IReadOnlyList<EmuWorkTemplateDto>> WorkTemplates()
    {
        var actor = ReadCurrentUser();
        return Ok(FilterWorkTemplatesByAccess(catalogService.GetSettings().WorkTemplates, GetAllowedEmuSectionIds(actor)));
    }

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

    [HttpGet("shift-templates")]
    [RequirePermission("emu.view")]
    public ActionResult<IReadOnlyList<EmuShiftTemplateDto>> ShiftTemplates() => Ok(shiftService.GetShiftTemplates());

    [HttpGet("employee-shifts")]
    [RequirePermission("emu.view")]
    public ActionResult<IReadOnlyList<EmuEmployeeShiftDto>> EmployeeShifts([FromQuery] DateOnly date, [FromQuery] Guid? employeeId = null)
    {
        var actor = ReadCurrentUser();
        return Ok(shiftService.GetEmployeeShifts(date, employeeId, GetAllowedEmuSectionIds(actor)));
    }

    [HttpGet("employees/{employeeId:guid}/shift-summary")]
    [RequirePermission("emu.view")]
    public ActionResult<EmuEmployeeShiftSummaryDto> EmployeeShiftSummary(Guid employeeId, [FromQuery] DateOnly date)
    {
        var actor = ReadCurrentUser();
        return ToActionResult(shiftService.GetEmployeeShiftSummary(employeeId, date, GetAllowedEmuSectionIds(actor)));
    }

    [HttpGet("employees/{employeeId:guid}/month-summary")]
    [RequirePermission("emu.view")]
    public ActionResult<EmuEmployeeMonthSummaryDto> EmployeeMonthSummary(Guid employeeId, [FromQuery] string month)
    {
        if (!TryParseMonth(month, out var monthStart))
        {
            return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
            {
                ["month"] = ["Укажите месяц в формате YYYY-MM"]
            })
            {
                Title = "Неверный месяц",
                Status = StatusCodes.Status400BadRequest
            });
        }

        var actor = ReadCurrentUser();
        return ToActionResult(shiftService.GetEmployeeMonthSummary(employeeId, monthStart, GetAllowedEmuSectionIds(actor)));
    }

    [HttpPatch("employee-shifts/{id:guid}")]
    [RequirePermission("emu.shift.adjust")]
    public ActionResult<EmuEmployeeShiftDto> UpdateEmployeeShift(Guid id, EmuUpdateEmployeeShiftDto request)
    {
        var actor = ReadCurrentUser();
        return ToActionResult(shiftService.UpdateEmployeeShift(id, request, actor.UserId, actor.DisplayName));
    }

    [HttpGet("decisions")]
    [RequirePermission("emu.view")]
    public ActionResult<IReadOnlyList<EmuDecisionDto>> Decisions(
        [FromQuery] string? status = null,
        [FromQuery] DateOnly? date = null,
        [FromQuery] Guid? employeeId = null)
    {
        var actor = ReadCurrentUser();
        return Ok(shiftService.GetDecisions(new EmuDecisionQueryDto(status, date, employeeId), GetAllowedEmuSectionIds(actor)));
    }

    [HttpPost("decisions/{id:guid}/resolve")]
    [RequirePermission("emu.decision.resolve")]
    public ActionResult<EmuDecisionDto> ResolveDecision(Guid id, EmuResolveDecisionDto request)
    {
        var actor = ReadCurrentUser();
        var result = shiftService.ResolveDecision(id, request, actor.UserId, actor.DisplayName, GetAllowedEmuSectionIds(actor));
        if (!result.Succeeded &&
            result.Errors.TryGetValue("id", out var errors) &&
            errors.Any(error => error.Contains("недоступ", StringComparison.OrdinalIgnoreCase)))
        {
            return Forbidden("emu_section");
        }

        return ToActionResult(result);
    }

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
        [FromQuery] Guid? waitReasonId = null,
        [FromQuery] Guid? notCompletedReasonId = null,
        [FromQuery] string? operationalStatus = null,
        [FromQuery] string? resultStatus = null,
        [FromQuery] string? status = null,
        [FromQuery] string? shiftType = null,
        [FromQuery] string? employeeSearch = null,
        [FromQuery] bool problemOnly = false,
        [FromQuery] bool manualCorrectionsOnly = false,
        [FromQuery] bool includeDeleted = false,
        [FromQuery] string? sortBy = null)
    {
        var actor = ReadCurrentUser();
        if (includeDeleted && !HasAnyPermission(actor.Permissions, "emu.completed.delete", "emu.audit.view"))
        {
            return Forbidden("emu.completed.delete");
        }

        if (IsHistoryQuery(operationalStatus, resultStatus, status)
            && !HasAnyPermission(actor.Permissions, "emu.history.view", "emu.reports.view"))
        {
            return Forbidden("emu.history.view");
        }

        return Ok(workService.GetWorkSessions(BuildWorkSessionQuery(
            actor,
            page,
            pageSize,
            dateFrom,
            dateTo,
            employeeId,
            sectionId,
            waitReasonId,
            notCompletedReasonId,
            operationalStatus,
            resultStatus,
            status,
            shiftType,
            employeeSearch,
            problemOnly,
            manualCorrectionsOnly,
            includeDeleted,
            sortBy)));
    }

    [HttpGet("reports/work-history")]
    [RequireAnyPermission("emu.history.view", "emu.reports.view")]
    public ActionResult<EmuWorkHistoryReportDto> WorkHistoryReport(
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null,
        [FromQuery] Guid? employeeId = null,
        [FromQuery] Guid? sectionId = null,
        [FromQuery] Guid? waitReasonId = null,
        [FromQuery] Guid? notCompletedReasonId = null,
        [FromQuery] string? operationalStatus = null,
        [FromQuery] string? resultStatus = null,
        [FromQuery] string? status = null,
        [FromQuery] string? shiftType = null,
        [FromQuery] string? employeeSearch = null,
        [FromQuery] bool problemOnly = false,
        [FromQuery] bool manualCorrectionsOnly = false,
        [FromQuery] bool includeDeleted = false,
        [FromQuery] string? sortBy = null)
    {
        var actor = ReadCurrentUser();
        if (includeDeleted && !HasAnyPermission(actor.Permissions, "emu.completed.delete", "emu.audit.view"))
        {
            return Forbidden("emu.completed.delete");
        }

        return Ok(workService.GetWorkHistoryReport(BuildWorkSessionQuery(
            actor,
            1,
            0,
            dateFrom,
            dateTo,
            employeeId,
            sectionId,
            waitReasonId,
            notCompletedReasonId,
            operationalStatus,
            resultStatus,
            status,
            shiftType,
            employeeSearch,
            problemOnly,
            manualCorrectionsOnly,
            includeDeleted,
            sortBy)));
    }

    [HttpGet("reports/work-history/employees/{employeeId:guid}")]
    [RequireAnyPermission("emu.history.view", "emu.reports.view")]
    public ActionResult<EmuEmployeeWorkHistoryReportDto> EmployeeWorkHistoryReport(
        Guid employeeId,
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null,
        [FromQuery] Guid? sectionId = null,
        [FromQuery] Guid? waitReasonId = null,
        [FromQuery] Guid? notCompletedReasonId = null,
        [FromQuery] string? operationalStatus = null,
        [FromQuery] string? resultStatus = null,
        [FromQuery] string? status = null,
        [FromQuery] string? shiftType = null,
        [FromQuery] string? employeeSearch = null,
        [FromQuery] bool problemOnly = false,
        [FromQuery] bool manualCorrectionsOnly = false,
        [FromQuery] bool includeDeleted = false,
        [FromQuery] string? sortBy = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        var actor = ReadCurrentUser();
        if (includeDeleted && !HasAnyPermission(actor.Permissions, "emu.completed.delete", "emu.audit.view"))
        {
            return Forbidden("emu.completed.delete");
        }

        return ToActionResult(workService.GetEmployeeWorkHistoryReport(
            employeeId,
            BuildWorkSessionQuery(
                actor,
                page,
                pageSize,
                dateFrom,
                dateTo,
                employeeId,
                sectionId,
                waitReasonId,
                notCompletedReasonId,
                operationalStatus,
                resultStatus,
                status,
                shiftType,
                employeeSearch,
                problemOnly,
                manualCorrectionsOnly,
                includeDeleted,
                sortBy)));
    }

    [HttpGet("work-sessions/export")]
    [RequirePermission("emu.reports.export")]
    public ActionResult ExportWorkSessions(
        [FromQuery] DateOnly? dateFrom = null,
        [FromQuery] DateOnly? dateTo = null,
        [FromQuery] Guid? employeeId = null,
        [FromQuery] Guid? sectionId = null,
        [FromQuery] Guid? waitReasonId = null,
        [FromQuery] Guid? notCompletedReasonId = null,
        [FromQuery] string? operationalStatus = null,
        [FromQuery] string? resultStatus = null,
        [FromQuery] string? status = null,
        [FromQuery] string? shiftType = null,
        [FromQuery] string? employeeSearch = null,
        [FromQuery] bool problemOnly = false,
        [FromQuery] bool manualCorrectionsOnly = false,
        [FromQuery] bool includeDeleted = false,
        [FromQuery] string? sortBy = null)
    {
        var actor = ReadCurrentUser();
        if (includeDeleted && !HasAnyPermission(actor.Permissions, "emu.completed.delete", "emu.audit.view"))
        {
            return Forbidden("emu.completed.delete");
        }

        const int pageSize = 500;
        var page = 1;
        var rows = new List<EmuWorkSessionDto>();
        EmuListResponseDto<EmuWorkSessionDto> result;
        do
        {
            result = workService.GetWorkSessions(BuildWorkSessionQuery(
                actor,
                page,
                pageSize,
                dateFrom,
                dateTo,
                employeeId,
                sectionId,
                waitReasonId,
                notCompletedReasonId,
                operationalStatus,
                resultStatus,
                status,
                shiftType,
                employeeSearch,
                problemOnly,
                manualCorrectionsOnly,
                includeDeleted,
                sortBy));
            rows.AddRange(result.Rows);
            page++;
        }
        while (page <= result.PageCount);

        var csv = BuildWorkSessionCsv(rows);
        var payload = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv)).ToArray();
        var fileName = $"emu-history-{DateTimeOffset.UtcNow:yyyyMMdd-HHmm}.csv";
        return File(payload, "text/csv; charset=utf-8", fileName);
    }

    [HttpGet("work-sessions/changes")]
    [RequirePermission("emu.view")]
    public ActionResult<EmuWorkSessionChangesDto> WorkSessionChanges([FromQuery] DateTimeOffset since)
    {
        var actor = ReadCurrentUser();
        return Ok(workService.GetWorkSessionChanges(since, GetAllowedEmuSectionIds(actor)));
    }

    [HttpGet("work-sessions/{id:guid}")]
    [RequirePermission("emu.view")]
    public ActionResult<EmuWorkSessionDto> WorkSession(Guid id)
    {
        var actor = ReadCurrentUser();
        var current = workService.GetWorkSession(id);
        if (!current.Succeeded || current.Value is null)
        {
            return ToActionResult(current);
        }

        return CanAccessEmuSection(actor, current.Value.SectionId)
            ? Ok(current.Value)
            : Forbidden("emu_section");
    }

    [HttpPost("work-sessions")]
    [RequirePermission("emu.work.create")]
    public ActionResult<EmuWorkSessionDto> CreateWorkSession(EmuCreateWorkSessionDto request)
    {
        var actor = ReadCurrentUser();
        if (!CanAccessEmuSection(actor, request.SectionId))
        {
            return Forbidden("emu_section");
        }

        return ToActionResult(workService.CreateWorkSession(request, actor.UserId, actor.DisplayName, actor.CanOverridePlanApproval));
    }

    [HttpPatch("work-sessions/{id:guid}")]
    [RequirePermission("emu.work.update")]
    public ActionResult<EmuWorkSessionDto> UpdateWorkSession(Guid id, EmuUpdateWorkSessionDto request)
    {
        var actor = ReadCurrentUser();
        var sectionGuard = ValidateWorkSessionSectionAccess(id, actor);
        if (sectionGuard is not null)
        {
            return sectionGuard;
        }

        if (!CanAccessEmuSection(actor, request.SectionId))
        {
            return Forbidden("emu_section");
        }

        return ToActionResult(workService.UpdateWorkSession(id, request, actor.UserId, actor.DisplayName));
    }

    [HttpPost("work-sessions/{id:guid}/employees")]
    [RequirePermission("emu.work.update")]
    public ActionResult<EmuWorkSessionDto> AddWorkSessionEmployee(Guid id, EmuAddWorkSessionEmployeeDto request)
    {
        var actor = ReadCurrentUser();
        var sectionGuard = ValidateWorkSessionSectionAccess(id, actor);
        if (sectionGuard is not null)
        {
            return sectionGuard;
        }

        return ToActionResult(workService.AddWorkSessionEmployee(id, request, actor.UserId, actor.DisplayName));
    }

    [HttpPost("work-sessions/{id:guid}/employees/{employeeId:guid}/finish")]
    [RequirePermission("emu.work.complete")]
    public ActionResult<EmuWorkSessionDto> FinishWorkSessionEmployee(Guid id, Guid employeeId, EmuFinishWorkSessionEmployeeDto request)
    {
        var actor = ReadCurrentUser();
        var sectionGuard = ValidateWorkSessionSectionAccess(id, actor);
        if (sectionGuard is not null)
        {
            return sectionGuard;
        }

        return ToActionResult(workService.FinishWorkSessionEmployee(id, employeeId, request, actor.UserId, actor.DisplayName));
    }

    [HttpPost("work-sessions/{id:guid}/employees/{employeeId:guid}/mark-mistaken")]
    [RequirePermission("emu.work.update")]
    public ActionResult<EmuWorkSessionDto> MarkWorkSessionEmployeeMistaken(Guid id, Guid employeeId, EmuMarkMistakenWorkSessionEmployeeDto request)
    {
        var actor = ReadCurrentUser();
        var sectionGuard = ValidateWorkSessionSectionAccess(id, actor);
        if (sectionGuard is not null)
        {
            return sectionGuard;
        }

        return ToActionResult(workService.MarkWorkSessionEmployeeMistaken(id, employeeId, request, actor.UserId, actor.DisplayName));
    }

    [HttpDelete("work-sessions/{id:guid}")]
    [RequireAnyPermission("emu.work.delete", "emu.completed.delete")]
    public ActionResult<EmuWorkSessionDto> DeleteWorkSession(Guid id, EmuDeleteWorkSessionDto request)
    {
        var actor = ReadCurrentUser();
        var current = workService.GetWorkSession(id);
        if (!current.Succeeded || current.Value is null)
        {
            return ToActionResult(current);
        }

        if (!CanAccessEmuSection(actor, current.Value.SectionId))
        {
            return Forbidden("emu_section");
        }

        var isCompleted = current.Value.CompletedAt is not null;
        if (isCompleted && !actor.Permissions.Contains("emu.completed.delete", StringComparer.OrdinalIgnoreCase))
        {
            return Forbidden("emu.completed.delete");
        }

        if (!isCompleted && !actor.Permissions.Contains("emu.work.delete", StringComparer.OrdinalIgnoreCase))
        {
            return Forbidden("emu.work.delete");
        }

        return ToActionResult(workService.DeleteWorkSession(id, request, actor.UserId, actor.DisplayName));
    }

    [HttpPost("work-sessions/{id:guid}/pause")]
    [RequirePermission("emu.work.pause")]
    public ActionResult<EmuWorkSessionDto> PauseWorkSession(Guid id, EmuPauseWorkSessionDto request)
    {
        var actor = ReadCurrentUser();
        var sectionGuard = ValidateWorkSessionSectionAccess(id, actor);
        if (sectionGuard is not null)
        {
            return sectionGuard;
        }

        return ToActionResult(workService.PauseWorkSession(id, request, actor.UserId, actor.DisplayName));
    }

    [HttpPost("work-sessions/{id:guid}/resume")]
    [RequirePermission("emu.work.pause")]
    public ActionResult<EmuWorkSessionDto> ResumeWorkSession(Guid id, EmuResumeWorkSessionDto request)
    {
        var actor = ReadCurrentUser();
        var sectionGuard = ValidateWorkSessionSectionAccess(id, actor);
        if (sectionGuard is not null)
        {
            return sectionGuard;
        }

        return ToActionResult(workService.ResumeWorkSession(id, request, actor.UserId, actor.DisplayName));
    }

    [HttpPost("work-sessions/{id:guid}/complete")]
    [RequirePermission("emu.work.complete")]
    public ActionResult<EmuWorkSessionDto> CompleteWorkSession(Guid id, EmuCompleteWorkSessionDto request)
    {
        var actor = ReadCurrentUser();
        var sectionGuard = ValidateWorkSessionSectionAccess(id, actor);
        if (sectionGuard is not null)
        {
            return sectionGuard;
        }

        return ToActionResult(workService.CompleteWorkSession(id, request, actor.UserId, actor.DisplayName));
    }

    [HttpPost("work-sessions/{id:guid}/carry-over")]
    [RequirePermission("emu.work.update")]
    public ActionResult<EmuWorkSessionDto> CarryOverWorkSession(Guid id, EmuCarryOverWorkSessionDto request)
    {
        var actor = ReadCurrentUser();
        var sectionGuard = ValidateWorkSessionSectionAccess(id, actor);
        if (sectionGuard is not null)
        {
            return sectionGuard;
        }

        return ToActionResult(workService.CarryOverWorkSession(id, request, actor.UserId, actor.DisplayName));
    }

    [HttpGet("work-sessions/{id:guid}/audit")]
    [RequirePermission("emu.audit.view")]
    public ActionResult<EmuListResponseDto<EmuAuditEventDto>> WorkSessionAudit(Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var actor = ReadCurrentUser();
        var current = workService.GetWorkSession(id);
        if (!current.Succeeded || current.Value is null)
        {
            return CommandValidationProblem(current.Errors);
        }

        return CanAccessEmuSection(actor, current.Value.SectionId)
            ? Ok(workService.GetWorkSessionAudit(id, page, pageSize))
            : Forbidden("emu_section");
    }

    [HttpGet("plan-tasks")]
    [RequirePermission("emu.plan.view")]
    public ActionResult<EmuListResponseDto<EmuPlanTaskDto>> PlanTasks([FromQuery] DateOnly? weekStart = null)
    {
        var actor = ReadCurrentUser();
        return Ok(planService.GetPlanTasks(weekStart, GetAllowedEmuSectionIds(actor)));
    }

    [HttpGet("plan-tasks/changes")]
    [RequirePermission("emu.plan.view")]
    public ActionResult<EmuPlanTaskChangesDto> PlanTaskChanges([FromQuery] DateTimeOffset since)
    {
        var actor = ReadCurrentUser();
        return Ok(planService.GetPlanTaskChanges(since, GetAllowedEmuSectionIds(actor)));
    }

    [HttpPost("plan-tasks")]
    [RequirePermission("emu.plan.manage")]
    public ActionResult<EmuPlanTaskDto> CreatePlanTask(EmuUpsertPlanTaskDto request)
    {
        var actor = ReadCurrentUser();
        if (!CanAccessEmuSection(actor, request.SectionId))
        {
            return Forbidden("emu_section");
        }

        return ToActionResult(planService.CreatePlanTask(request, actor.UserId, actor.DisplayName));
    }

    [HttpPatch("plan-tasks/{id:guid}")]
    [RequirePermission("emu.plan.manage")]
    public ActionResult<EmuPlanTaskDto> UpdatePlanTask(Guid id, EmuUpsertPlanTaskDto request)
    {
        var actor = ReadCurrentUser();
        if (!CanAccessEmuSection(actor, request.SectionId))
        {
            return Forbidden("emu_section");
        }

        return ToActionResult(planService.UpdatePlanTask(id, request, actor.UserId, actor.DisplayName, GetAllowedEmuSectionIds(actor)));
    }

    [HttpPost("plan-tasks/{id:guid}/reschedule")]
    [RequirePermission("emu.plan.manage")]
    public ActionResult<EmuPlanTaskDto> ReschedulePlanTask(Guid id, EmuReschedulePlanTaskDto request)
    {
        var actor = ReadCurrentUser();
        return ToActionResult(planService.ReschedulePlanTask(id, request, actor.UserId, actor.DisplayName, GetAllowedEmuSectionIds(actor)));
    }

    [HttpPost("plan-tasks/{id:guid}/approve")]
    [RequirePermission("emu.plan.approve")]
    public ActionResult<EmuPlanTaskDto> ApprovePlanTask(Guid id, EmuApprovePlanTaskDto request)
    {
        var actor = ReadCurrentUser();
        return ToActionResult(planService.ApprovePlanTask(id, request, actor.UserId, actor.DisplayName, GetAllowedEmuSectionIds(actor)));
    }

    [HttpPost("plan-tasks/approve-week")]
    [RequirePermission("emu.plan.approve")]
    public ActionResult<IReadOnlyList<EmuPlanTaskDto>> ApproveWeek(EmuApproveWeekDto request)
    {
        var actor = ReadCurrentUser();
        return ToActionResult(planService.ApproveWeek(request, actor.UserId, actor.DisplayName, GetAllowedEmuSectionIds(actor)));
    }

    private EmuWorkSessionQueryDto BuildWorkSessionQuery(
        (Guid? UserId, string DisplayName, bool CanOverridePlanApproval, IReadOnlyList<string> Permissions, IReadOnlyList<string> Roles) actor,
        int page,
        int pageSize,
        DateOnly? dateFrom,
        DateOnly? dateTo,
        Guid? employeeId,
        Guid? sectionId,
        Guid? waitReasonId,
        Guid? notCompletedReasonId,
        string? operationalStatus,
        string? resultStatus,
        string? status,
        string? shiftType,
        string? employeeSearch,
        bool problemOnly,
        bool manualCorrectionsOnly,
        bool includeDeleted,
        string? sortBy) =>
        new(
            DateFrom: dateFrom,
            DateTo: dateTo,
            EmployeeId: employeeId,
            SectionId: sectionId,
            WaitReasonId: waitReasonId,
            NotCompletedReasonId: notCompletedReasonId,
            OperationalStatus: operationalStatus,
            ResultStatus: resultStatus,
            Status: status,
            ProblemOnly: problemOnly,
            ManualCorrectionsOnly: manualCorrectionsOnly,
            IncludeDeleted: includeDeleted,
            Page: page,
            PageSize: pageSize,
            SortBy: sortBy,
            ShiftType: shiftType,
            EmployeeSearch: employeeSearch,
            AllowedSectionIds: GetAllowedEmuSectionIds(actor));

    private static EmuSettingsDto FilterSettingsBySectionAccess(EmuSettingsDto settings, IReadOnlyList<Guid>? allowedSectionIds)
    {
        if (allowedSectionIds is null)
        {
            return settings;
        }

        var allowed = allowedSectionIds.ToHashSet();
        return settings with
        {
            Sections = FilterSectionsByAccess(settings.Sections, allowedSectionIds),
            WorkTemplates = settings.WorkTemplates
                .Where(template => template.SectionId is null || allowed.Contains(template.SectionId.Value))
                .ToArray()
        };
    }

    private static IReadOnlyList<EmuReferenceDto> FilterSectionsByAccess(
        IReadOnlyList<EmuReferenceDto> sections,
        IReadOnlyList<Guid>? allowedSectionIds)
    {
        if (allowedSectionIds is null)
        {
            return sections;
        }

        var allowed = allowedSectionIds.ToHashSet();
        return sections.Where(section => allowed.Contains(section.Id)).ToArray();
    }

    private static IReadOnlyList<EmuWorkTemplateDto> FilterWorkTemplatesByAccess(
        IReadOnlyList<EmuWorkTemplateDto> templates,
        IReadOnlyList<Guid>? allowedSectionIds)
    {
        if (allowedSectionIds is null)
        {
            return templates;
        }

        var allowed = allowedSectionIds.ToHashSet();
        return templates.Where(template => template.SectionId is null || allowed.Contains(template.SectionId.Value)).ToArray();
    }

    private (Guid? UserId, string DisplayName, bool CanOverridePlanApproval, IReadOnlyList<string> Permissions, IReadOnlyList<string> Roles) ReadCurrentUser()
    {
        var token = ReadBearerToken();
        var user = token is null ? null : authSessionService.GetCurrentUser(token);
        return user is null
            ? (null, "system", false, [], [])
            : (user.Id, user.DisplayName, user.Permissions.Contains("emu.plan.override-approval", StringComparer.OrdinalIgnoreCase), user.Permissions, user.Roles);
    }

    private IReadOnlyList<Guid>? GetAllowedEmuSectionIds(
        (Guid? UserId, string DisplayName, bool CanOverridePlanApproval, IReadOnlyList<string> Permissions, IReadOnlyList<string> Roles) actor)
    {
        if (actor.UserId is null || HasFullEmuSectionAccess(actor))
        {
            return null;
        }

        var access = siteUserAdminService.GetUserAccess(actor.UserId.Value);
        return access?.Scopes
            .Where(scope => scope.ModuleKey.Equals("emu", StringComparison.OrdinalIgnoreCase)
                && scope.ScopeType.Equals("emu_section", StringComparison.OrdinalIgnoreCase))
            .Select(scope => scope.ScopeId)
            .Distinct()
            .ToArray() ?? [];
    }

    private static bool HasFullEmuSectionAccess(
        (Guid? UserId, string DisplayName, bool CanOverridePlanApproval, IReadOnlyList<string> Permissions, IReadOnlyList<string> Roles) actor) =>
        actor.Roles.Any(role => role.Equals("admin", StringComparison.OrdinalIgnoreCase)
            || role.Equals("manager", StringComparison.OrdinalIgnoreCase))
        || actor.Permissions.Contains("emu.scope.all", StringComparer.OrdinalIgnoreCase);

    private bool CanAccessEmuSection(
        (Guid? UserId, string DisplayName, bool CanOverridePlanApproval, IReadOnlyList<string> Permissions, IReadOnlyList<string> Roles) actor,
        Guid? sectionId)
    {
        if (sectionId is null || HasFullEmuSectionAccess(actor))
        {
            return true;
        }

        var allowedSectionIds = GetAllowedEmuSectionIds(actor);
        return allowedSectionIds?.Contains(sectionId.Value) == true;
    }

    private ActionResult<EmuWorkSessionDto>? ValidateWorkSessionSectionAccess(
        Guid id,
        (Guid? UserId, string DisplayName, bool CanOverridePlanApproval, IReadOnlyList<string> Permissions, IReadOnlyList<string> Roles) actor)
    {
        var current = workService.GetWorkSession(id);
        if (!current.Succeeded || current.Value is null)
        {
            return ToActionResult(current);
        }

        if (CanAccessEmuSection(actor, current.Value.SectionId))
        {
            return null;
        }

        return Forbidden("emu_section");
    }

    private ObjectResult Forbidden(string permission) =>
        new(new ProblemDetails
        {
            Title = "Недостаточно прав",
            Detail = $"Для действия требуется право {permission}.",
            Status = StatusCodes.Status403Forbidden
        })
        {
            StatusCode = StatusCodes.Status403Forbidden
        };

    private static bool HasAnyPermission(IReadOnlyList<string> permissions, params string[] required) =>
        required.Any(permission => permissions.Contains(permission, StringComparer.OrdinalIgnoreCase));

    private static bool IsHistoryQuery(string? operationalStatus, string? resultStatus, string? legacyStatus)
    {
        var operation = NormalizeQueryValue(operationalStatus);
        var result = NormalizeQueryValue(resultStatus);
        var legacy = NormalizeQueryValue(legacyStatus);
        return IsCompletedOperationalStatus(operation)
            || IsResultStatus(result)
            || IsResultStatus(legacy)
            || IsCompletedOperationalStatus(legacy);
    }

    private static bool IsCompletedOperationalStatus(string value) =>
        value.Equals("Завершено", StringComparison.OrdinalIgnoreCase);

    private static bool IsResultStatus(string value) =>
        value.Equals("Выполнено", StringComparison.OrdinalIgnoreCase)
        || value.Equals("Частично выполнено", StringComparison.OrdinalIgnoreCase)
        || value.Equals("Не выполнено", StringComparison.OrdinalIgnoreCase)
        || value.Equals("Отменено", StringComparison.OrdinalIgnoreCase);

    private static string NormalizeQueryValue(string? value) => (value ?? string.Empty).Trim();

    private static bool TryParseMonth(string? value, out DateOnly monthStart)
    {
        monthStart = default;
        var parts = NormalizeQueryValue(value).Split('-', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 2
            || !int.TryParse(parts[0], out var year)
            || !int.TryParse(parts[1], out var month)
            || month is < 1 or > 12)
        {
            return false;
        }

        monthStart = new DateOnly(year, month, 1);
        return true;
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

    private ActionResult CommandValidationProblem(IReadOnlyDictionary<string, string[]> errors) =>
        ValidationProblem(new ValidationProblemDetails(errors.ToDictionary(error => error.Key, error => error.Value))
        {
            Title = "EMU command validation failed",
            Status = StatusCodes.Status400BadRequest
        });

    private static string BuildWorkSessionCsv(IReadOnlyList<EmuWorkSessionDto> rows)
    {
        var builder = new StringBuilder();
        AppendCsvRow(builder,
            "Дата",
            "Номер",
            "Участок",
            "Работа",
            "Сотрудники",
            "Приход",
            "Завершение",
            "Работа, мин",
            "Ожидание, мин",
            "Прочее, мин",
            "Итого, мин",
            "Статус карточки",
            "Результат",
            "Комментарий");

        foreach (var row in rows)
        {
            AppendCsvRow(builder,
                row.WorkDate.ToString("yyyy-MM-dd"),
                row.WorkNumber,
                row.SectionName,
                row.TaskDescription,
                string.Join(", ", row.Employees.Select(employee => employee.FullNameSnapshot)),
                FormatExportDate(row.ArrivedAt),
                row.CompletedAt is null ? "" : FormatExportDate(row.CompletedAt.Value),
                row.WorkMinutes.ToString(),
                row.WaitingMinutes.ToString(),
                row.OtherWorkMinutes.ToString(),
                (row.WorkMinutes + row.WaitingMinutes + row.OtherWorkMinutes).ToString(),
                row.OperationalStatus,
                row.ResultStatus,
                row.ResultComment);
        }

        return builder.ToString();
    }

    private static string FormatExportDate(DateTimeOffset value) => value.ToLocalTime().ToString("yyyy-MM-dd HH:mm");

    private static void AppendCsvRow(StringBuilder builder, params string[] values)
    {
        builder.AppendLine(string.Join(';', values.Select(EscapeCsvValue)));
    }

    private static string EscapeCsvValue(string? value)
    {
        var next = value ?? string.Empty;
        return next.Contains(';') || next.Contains('"') || next.Contains('\n') || next.Contains('\r')
            ? $"\"{next.Replace("\"", "\"\"")}\""
            : next;
    }
}
