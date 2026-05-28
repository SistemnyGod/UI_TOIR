using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/assignments")]
public sealed class AssignmentsController(IAssignmentService assignmentService) : ControllerBase
{
    [HttpGet]
    [RequirePermission("assignments.read")]
    public ActionResult<IReadOnlyList<AssignmentDto>> List() => Ok(assignmentService.GetAssignments());

    [HttpPost]
    [RequirePermission("assignments.write")]
    public ActionResult<AssignmentDto> Create(CreateAssignmentDto request)
    {
        var result = assignmentService.Create(request);
        if (!result.Succeeded)
        {
            return AssignmentValidationProblem(result.Errors);
        }

        return Created($"/api/v1/assignments/{result.Assignment!.Id}", result.Assignment);
    }

    [HttpPost("{id:guid}/start")]
    [RequirePermission("assignments.write")]
    public ActionResult<AssignmentCommandResultDto> Start(Guid id) => ExecuteCommand(() => assignmentService.Start(id));

    [HttpPost("{id:guid}/cancel")]
    [RequirePermission("assignments.write")]
    public ActionResult<AssignmentCommandResultDto> Cancel(Guid id) => ExecuteCommand(() => assignmentService.Cancel(id));

    [HttpPost("{id:guid}/complete")]
    [RequirePermission("assignments.write")]
    public ActionResult<AssignmentCommandResultDto> Complete(Guid id, CompleteAssignmentDto? request = null) =>
        ExecuteCommand(() => assignmentService.Complete(id, request));

    private ActionResult<AssignmentCommandResultDto> ExecuteCommand(Func<AssignmentCommandResult?> command)
    {
        try
        {
            var result = command();
            if (result is null)
            {
                return NotFound();
            }

            if (!result.Succeeded)
            {
                return AssignmentCommandValidationProblem(result.Errors ?? new Dictionary<string, string[]>());
            }

            return Ok(new AssignmentCommandResultDto(result.Assignment, result.Changed, result.Message));
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new ProblemDetails
            {
                Title = "Назначение уже изменено",
                Detail = "Назначение уже изменено, обновите список.",
                Status = StatusCodes.Status409Conflict
            });
        }
    }

    private ActionResult<AssignmentDto> AssignmentValidationProblem(IReadOnlyDictionary<string, string[]> errors)
    {
        return ValidationProblem(new ValidationProblemDetails(errors.ToDictionary(item => item.Key, item => item.Value))
        {
            Title = "Назначение не создано",
            Detail = "Проверьте обязательные поля назначения.",
            Status = StatusCodes.Status400BadRequest
        });
    }

    private ActionResult<AssignmentCommandResultDto> AssignmentCommandValidationProblem(IReadOnlyDictionary<string, string[]> errors) =>
        ValidationProblem(new ValidationProblemDetails(errors.ToDictionary(item => item.Key, item => item.Value))
        {
            Title = "Результат обхода не сохранен",
            Detail = "Проверьте обязательные поля результата обхода.",
            Status = StatusCodes.Status400BadRequest
        });
}
