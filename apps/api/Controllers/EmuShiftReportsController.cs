using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/emu/shift-reports")]
public sealed class EmuShiftReportsController(
    IEmuShiftReportService service,
    IAuthSessionService authSessionService,
    ISiteUserAdminService siteUserAdminService) : ControllerBase
{
    [HttpGet("options")]
    [RequirePermission("emu.shift-reports.create")]
    public ActionResult<EmuShiftReportOptionsDto> Options()
    {
        var actor = ReadCurrentUser();
        return Ok(service.GetOptions(GetAllowedSectionIds(actor)));
    }

    [HttpPut("employee-categories/{employeeId:guid}")]
    [RequirePermission("emu.shift-reports.create")]
    public ActionResult<EmuShiftReportEmployeeOptionDto> SetEmployeeCategory(Guid employeeId, EmuSetShiftReportEmployeeCategoryDto request)
    {
        var result = service.SetEmployeeCategory(employeeId, request);
        return result.Succeeded && result.Value is not null
            ? Ok(result.Value)
            : ValidationProblem(new ValidationProblemDetails(result.Errors.ToDictionary(item => item.Key, item => item.Value))
            {
                Title = "Не удалось изменить группу сотрудника"
            });
    }
    [HttpPost]
    [RequirePermission("emu.shift-reports.create")]
    public ActionResult<EmuShiftReportDetailDto> Create(EmuCreateShiftReportDto request)
    {
        var actor = ReadCurrentUser();
        var result = service.Create(request, actor.UserId, actor.DisplayName, GetAllowedSectionIds(actor));
        if (result.Succeeded && result.Value is not null)
        {
            return CreatedAtAction(nameof(Get), new { id = result.Value.Id }, result.Value);
        }
        if (result.Errors.TryGetValue("duplicate", out var duplicate) && Guid.TryParse(duplicate.FirstOrDefault(), out var existingId))
        {
            var problem = new ProblemDetails { Status = StatusCodes.Status409Conflict, Title = "Отчёт за смену уже существует", Detail = "Отчёт этого сотрудника за выбранную дату и смену уже существует." };
            problem.Extensions["existingReportId"] = existingId;
            return Conflict(problem);
        }
        return ValidationProblem(new ValidationProblemDetails(result.Errors.ToDictionary(item => item.Key, item => item.Value)) { Title = "Проверьте данные сменного отчёта" });
    }

    [HttpGet]
    [RequirePermission("emu.shift-reports.view")]
    public async Task<ActionResult<EmuListResponseDto<EmuShiftReportSummaryDto>>> List(
        [FromQuery] DateOnly? date = null, [FromQuery] DateOnly? dateFrom = null, [FromQuery] DateOnly? dateTo = null,
        [FromQuery] string? shiftType = null, [FromQuery] string? workerCategory = null,
        [FromQuery] Guid? employeeId = null, [FromQuery] string? search = null,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 50, [FromQuery] bool favoriteOnly = false,
        CancellationToken cancellationToken = default)
    {
        var actor = ReadCurrentUser();
        var owner = actor.Permissions.Contains("emu.shift-reports.view-all", StringComparer.OrdinalIgnoreCase) ? null : actor.UserId;
        return Ok(await service.GetListAsync(new EmuShiftReportQueryDto(date, dateFrom, dateTo, shiftType, workerCategory, employeeId, search, page, pageSize, favoriteOnly), owner, GetAllowedSectionIds(actor), cancellationToken));
    }

    [HttpGet("{id:guid}")]
    [RequirePermission("emu.shift-reports.view")]
    public async Task<ActionResult<EmuShiftReportDetailDto>> Get(Guid id, CancellationToken cancellationToken)
    {
        var actor = ReadCurrentUser();
        var owner = actor.Permissions.Contains("emu.shift-reports.view-all", StringComparer.OrdinalIgnoreCase) ? null : actor.UserId;
        var result = await service.GetDetailAsync(id, owner, GetAllowedSectionIds(actor), cancellationToken);
        return result.Succeeded && result.Value is not null ? Ok(result.Value) : NotFound();
    }

    private Actor ReadCurrentUser()
    {
        var token = ReadBearerToken();
        var user = token is null ? null : authSessionService.GetCurrentUser(token);
        return user is null ? new Actor(null, "system", [], []) : new Actor(user.Id, user.DisplayName, user.Permissions, user.Roles);
    }

    private IReadOnlyList<Guid>? GetAllowedSectionIds(Actor actor)
    {
        if (actor.UserId is null || actor.Roles.Any(role => role.Equals("admin", StringComparison.OrdinalIgnoreCase) || role.Equals("manager", StringComparison.OrdinalIgnoreCase)) || actor.Permissions.Contains("emu.scope.all", StringComparer.OrdinalIgnoreCase))
        {
            return null;
        }
        return siteUserAdminService.GetUserAccess(actor.UserId.Value)?.Scopes
            .Where(scope => scope.ModuleKey.Equals("emu", StringComparison.OrdinalIgnoreCase) && scope.ScopeType.Equals("emu_section", StringComparison.OrdinalIgnoreCase))
            .Select(scope => scope.ScopeId).Distinct().ToArray() ?? [];
    }

    private string? ReadBearerToken()
    {
        if (!Request.Headers.TryGetValue(HeaderNames.Authorization, out var values)) return null;
        const string prefix = "Bearer ";
        var value = values.ToString();
        return value.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) ? value[prefix.Length..].Trim() : null;
    }

    private sealed record Actor(Guid? UserId, string DisplayName, IReadOnlyList<string> Permissions, IReadOnlyList<string> Roles);
}
