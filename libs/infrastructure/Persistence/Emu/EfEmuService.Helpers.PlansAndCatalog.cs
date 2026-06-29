using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfEmuService
{
    private Guid? ResolvePlanSectionId(Guid? sectionId) =>
        sectionId ?? dbContext.EmuWorkSections
            .AsNoTracking()
            .Where(row => row.Code == "prochee" && row.IsActive)
            .Select(row => (Guid?)row.Id)
            .FirstOrDefault();

    private static string BuildManualTimeComment(string fieldName, DateTimeOffset enteredValue, string comment, DateTimeOffset now) =>
        $"Ручная корректировка {fieldName}. Серверное время операции: {now:O}; введенное время: {enteredValue:O}; комментарий: {comment}";

    private static string BuildManualDateComment(string fieldName, DateOnly enteredValue, string comment, DateTimeOffset now) =>
        $"Ручная корректировка {fieldName}. Серверное время операции: {now:O}; введенная дата: {enteredValue:yyyy-MM-dd}; комментарий: {comment}";

    private static IReadOnlyDictionary<string, string[]> ValidatePlanTask(EmuUpsertPlanTaskDto request)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        if (NormalizeRequired(request.Title).Length == 0)
        {
            errors["title"] = ["Укажите название задачи"];
        }

        if (request.EmployeeIds.Count == 0)
        {
            errors["employeeIds"] = ["Выберите сотрудников"];
        }

        return errors;
    }

    private EmuCommandResult<TDto> CreateReference<TEntity, TDto>(
        DbSet<TEntity> dbSet,
        EmuCreateReferenceDto request,
        Func<string, string, int, DateTimeOffset, TEntity> factory,
        Func<TEntity, TDto> mapper)
        where TEntity : class
    {
        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<TDto>("name", "Укажите название");
        }

        var now = DateTimeOffset.UtcNow;
        var entity = factory(name, GenerateCode(name), request.SortOrder, now);
        dbSet.Add(entity);
        dbContext.SaveChanges();
        return Success(mapper(entity));
    }

    private EmuCommandResult<TDto> UpdateReference<TEntity, TDto>(
        DbSet<TEntity> dbSet,
        Guid id,
        EmuUpdateReferenceDto request,
        Func<TEntity, TDto> mapper)
        where TEntity : class
    {
        var entity = dbSet.Find(id);
        if (entity is null)
        {
            return Failure<TDto>("id", "Запись справочника не найдена");
        }

        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<TDto>("name", "Укажите название");
        }

        SetProperty(entity, "Name", name);
        SetProperty(entity, "IsActive", request.IsActive);
        SetProperty(entity, "SortOrder", request.SortOrder);
        dbContext.SaveChanges();
        return Success(mapper(entity));
    }
}
