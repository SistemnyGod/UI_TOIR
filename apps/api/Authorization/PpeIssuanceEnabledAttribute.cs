using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Patrol360.Contracts;
using Patrol360.Application;

namespace Patrol360.Api.Authorization;

// Applied to every legacy path which can create an issuance fact.
[AttributeUsage(AttributeTargets.Method)]
public sealed class PpeIssuanceEnabledAttribute(bool allowClosingStatus = false) : ActionFilterAttribute
{
    public override void OnActionExecuting(ActionExecutingContext context)
    {
        var configuration = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
        if (allowClosingStatus && context.ActionArguments.Values.OfType<UpdateInventoryStatusDto>()
            .Any(x => x.Status?.Trim().ToLowerInvariant() is "returned" or "written_off" or "write_off" or "lost")) return;
        var norms = context.HttpContext.RequestServices.GetService<IInventoryWorkflowService>();
        if (configuration.GetValue<bool>("Features:PpeIssueDocuments") && PpeIssuancePolicy.Readiness(norms, configuration).Ready)
        {
            var reason = ValidateLegacyRequest(context, norms!);
            if (reason is null) return;
            context.Result = new ObjectResult(new ProblemDetails { Status = 409, Title = "Выдача СИЗ не прошла проверку", Detail = reason }) { StatusCode = 409 };
            return;
        }
        context.Result = new ObjectResult(new ProblemDetails
        {
            Status = StatusCodes.Status409Conflict,
            Title = "Новые выдачи СИЗ выключены",
            Detail = "Подготовьте и подтвердите все наборы норм перед включением выдачи. Просмотр истории и возврат существующих позиций доступны."
        }) { StatusCode = StatusCodes.Status409Conflict };
    }

    private static string? ValidateLegacyRequest(ActionExecutingContext context, IInventoryWorkflowService norms)
    {
        context.ActionArguments.TryGetValue("id", out var cardArgument);
        var cardId = cardArgument as Guid?;
        var card = cardId.HasValue ? norms.GetPpeCard(cardId.Value).Value : null;
        if (card?.NormSetId is null) return "Привяжите карточку к применимой норме или оформите выдачу через конструктор документов.";
        var checks = new List<(Guid? RowId, Guid ItemId, DateTimeOffset Date)>();
        foreach (var argument in context.ActionArguments.Values)
        {
            if (argument is CreateInventoryPpeIssueDto single) checks.Add((single.CardNormRowId, single.ItemId, single.IssuedAt));
            if (argument is CreateInventoryPpeIssueBatchDto batch) checks.AddRange(batch.Lines.Select(x => ((Guid?)x.CardNormRowId, x.ItemId, x.IssuedAt)));
            if (argument is UpsertInventoryPpeCardLineDto line) checks.Add((line.CardNormRowId, line.ItemId, line.IssuedAt ?? DateTimeOffset.UtcNow));
            if (argument is UpdateInventoryStatusDto && context.ActionArguments.TryGetValue("lineId", out var lineArgument) && lineArgument is Guid lineId)
            {
                var existing = card.Lines.FirstOrDefault(x => x.Id == lineId);
                if (existing is not null) checks.Add((existing.CardNormRowId, existing.ItemId, existing.IssuedAt is { } date ? new DateTimeOffset(DateTime.SpecifyKind(date, DateTimeKind.Utc)) : DateTimeOffset.UtcNow));
            }
        }
        if (checks.Count == 0) return "Не найден состав выдачи. Оформите документ через конструктор СИЗ.";
        foreach (var check in checks)
        {
            var documents = context.HttpContext.RequestServices.GetRequiredService<IPpeIssueDocumentService>();
            if (!documents.GetApplicablePpeNorms(card.EmployeeId, DateOnly.FromDateTime(check.Date.DateTime)).Any(x => x.Id == card.NormSetId))
                return "Норма не применима к подразделению, должности или дате выдачи сотрудника.";
            var sourceId = card.NormRows?.FirstOrDefault(x => x.Id == check.RowId)?.SourceNormRowId;
            var norm = norms.GetPpeNormSet(card.NormSetId.Value).Value;
            if (sourceId is null || norm?.Rows.Any(x => x.Id == sourceId && x.Mappings.Any(m => m.ItemId == check.ItemId && m.IsApproved)) != true)
                return "Товар не имеет утверждённого соответствия выбранной строке нормы.";
        }
        return null;
    }
}
