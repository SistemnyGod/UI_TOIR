using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Authorization;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Api.Controllers;

[ApiController]
[Route("api/v1/patrol-requests")]
public sealed class PatrolRequestsController(IPatrolRequestService patrolRequestService) : ControllerBase
{
    [HttpGet]
    [RequirePermission("requests.read")]
    public ActionResult<IReadOnlyList<PatrolRequestDto>> List() => Ok(patrolRequestService.GetRequests());

    [HttpPost]
    [RequirePermission("requests.write")]
    public ActionResult<PatrolRequestDto> Create(CreatePatrolRequestDto request)
    {
        var result = patrolRequestService.Create(request);
        if (!result.Succeeded)
        {
            var errors = result.Errors.ToDictionary(item => item.Key, item => item.Value);

            return ValidationProblem(new ValidationProblemDetails(errors)
            {
                Title = "Заявка на обход не создана",
                Detail = "Проверьте обязательные поля заявки.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        return Created($"/api/v1/patrol-requests/{result.Request!.Id}", result.Request);
    }
}
