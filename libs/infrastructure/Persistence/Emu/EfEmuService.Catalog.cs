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
    public EmuSettingsDto GetSettings() =>
        new(
            dbContext.EmuWorkSections.AsNoTracking().OrderBy(row => row.SortOrder).ThenBy(row => row.Name).Select(MapReference).ToList(),
            dbContext.EmuWaitReasons.AsNoTracking().OrderBy(row => row.SortOrder).ThenBy(row => row.Name).Select(MapReference).ToList(),
            dbContext.EmuNotCompletedReasons.AsNoTracking().OrderBy(row => row.SortOrder).ThenBy(row => row.Name).Select(MapReference).ToList(),
            dbContext.EmuWorkTemplates.AsNoTracking().Include(row => row.Section).OrderBy(row => row.SortOrder).ThenBy(row => row.Name).Select(MapWorkTemplate).ToList(),
            GetFavoriteEmployees());

    public EmuCommandResult<EmuReferenceDto> CreateSection(EmuCreateReferenceDto request) =>
        CreateReference(dbContext.EmuWorkSections, request, (name, code, sortOrder, now) => new EmuWorkSectionEntity
        {
            Id = Guid.NewGuid(),
            Name = name,
            Code = code,
            Description = string.Empty,
            SortOrder = sortOrder,
            CreatedAt = now
        }, MapReference);

    public EmuCommandResult<EmuReferenceDto> UpdateSection(Guid id, EmuUpdateReferenceDto request)
    {
        var entity = dbContext.EmuWorkSections.FirstOrDefault(row => row.Id == id);
        if (entity is null)
        {
            return Failure<EmuReferenceDto>("id", "Запись справочника не найдена");
        }

        if (entity.Code == "prochee" && !request.IsActive)
        {
            return Failure<EmuReferenceDto>("isActive", "Системный участок «Прочее» нельзя скрыть");
        }

        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<EmuReferenceDto>("name", "Укажите название");
        }

        entity.Name = name;
        entity.IsActive = request.IsActive;
        entity.SortOrder = request.SortOrder;
        dbContext.SaveChanges();
        return Success(MapReference(entity));
    }

    public EmuCommandResult<EmuReferenceDto> CreateWaitReason(EmuCreateReferenceDto request) =>
        CreateReference(dbContext.EmuWaitReasons, request, (name, code, sortOrder, now) => new EmuWaitReasonEntity
        {
            Id = Guid.NewGuid(),
            Name = name,
            Code = code,
            SortOrder = sortOrder,
            CreatedAt = now
        }, MapReference);

    public EmuCommandResult<EmuReferenceDto> UpdateWaitReason(Guid id, EmuUpdateReferenceDto request) =>
        UpdateReference(dbContext.EmuWaitReasons, id, request, MapReference);

    public EmuCommandResult<EmuReferenceDto> CreateNotCompletedReason(EmuCreateReferenceDto request) =>
        CreateReference(dbContext.EmuNotCompletedReasons, request, (name, code, sortOrder, now) => new EmuNotCompletedReasonEntity
        {
            Id = Guid.NewGuid(),
            Name = name,
            Code = code,
            SortOrder = sortOrder,
            CreatedAt = now
        }, MapReference);

    public EmuCommandResult<EmuReferenceDto> UpdateNotCompletedReason(Guid id, EmuUpdateReferenceDto request) =>
        UpdateReference(dbContext.EmuNotCompletedReasons, id, request, MapReference);

    public EmuCommandResult<EmuWorkTemplateDto> CreateWorkTemplate(EmuCreateWorkTemplateDto request)
    {
        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<EmuWorkTemplateDto>("name", "Укажите название типовой работы");
        }

        if (request.SectionId is not null && !dbContext.EmuWorkSections.Any(row => row.Id == request.SectionId && row.IsActive))
        {
            return Failure<EmuWorkTemplateDto>("sectionId", "Участок не найден");
        }

        var entity = new EmuWorkTemplateEntity
        {
            Id = Guid.NewGuid(),
            Name = name,
            Description = NormalizeOptional(request.Description),
            SectionId = request.SectionId,
            SortOrder = request.SortOrder,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.EmuWorkTemplates.Add(entity);
        dbContext.SaveChanges();

        return Success(MapWorkTemplate(dbContext.EmuWorkTemplates.AsNoTracking().Include(row => row.Section).Single(row => row.Id == entity.Id)));
    }

    public EmuCommandResult<EmuWorkTemplateDto> UpdateWorkTemplate(Guid id, EmuUpdateWorkTemplateDto request)
    {
        var entity = dbContext.EmuWorkTemplates.FirstOrDefault(row => row.Id == id);
        if (entity is null)
        {
            return Failure<EmuWorkTemplateDto>("id", "Типовая работа не найдена");
        }

        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<EmuWorkTemplateDto>("name", "Укажите название типовой работы");
        }

        if (request.SectionId is not null && !dbContext.EmuWorkSections.Any(row => row.Id == request.SectionId && row.IsActive))
        {
            return Failure<EmuWorkTemplateDto>("sectionId", "Участок не найден");
        }

        entity.Name = name;
        entity.Description = NormalizeOptional(request.Description);
        entity.SectionId = request.SectionId;
        entity.IsActive = request.IsActive;
        entity.SortOrder = request.SortOrder;
        dbContext.SaveChanges();

        return Success(MapWorkTemplate(dbContext.EmuWorkTemplates.AsNoTracking().Include(row => row.Section).Single(row => row.Id == entity.Id)));
    }

    public IReadOnlyList<EmuFavoriteEmployeeDto> GetFavoriteEmployees() =>
        dbContext.EmuFavoriteEmployees
            .AsNoTracking()
            .Include(row => row.Employee)
            .OrderBy(row => row.Employee.FullName)
            .Select(MapFavoriteEmployee)
            .ToList();

    public EmuCommandResult<EmuFavoriteEmployeeDto> AddFavoriteEmployee(EmuAddFavoriteEmployeeDto request)
    {
        var employee = dbContext.Employees.FirstOrDefault(row => row.Id == request.EmployeeId);
        if (employee is null)
        {
            return Failure<EmuFavoriteEmployeeDto>("employeeId", "Сотрудник не найден");
        }

        var existing = dbContext.EmuFavoriteEmployees.Include(row => row.Employee).FirstOrDefault(row => row.EmployeeId == request.EmployeeId);
        if (existing is not null)
        {
            existing.IsActive = true;
            dbContext.SaveChanges();
            return Success(MapFavoriteEmployee(existing));
        }

        var entity = new EmuFavoriteEmployeeEntity
        {
            Id = Guid.NewGuid(),
            EmployeeId = request.EmployeeId,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.EmuFavoriteEmployees.Add(entity);
        dbContext.SaveChanges();

        return Success(MapFavoriteEmployee(dbContext.EmuFavoriteEmployees.AsNoTracking().Include(row => row.Employee).Single(row => row.Id == entity.Id)));
    }

    public EmuCommandResult<EmuFavoriteEmployeeDto> RemoveFavoriteEmployee(Guid employeeId)
    {
        var entity = dbContext.EmuFavoriteEmployees.Include(row => row.Employee).FirstOrDefault(row => row.EmployeeId == employeeId);
        if (entity is null)
        {
            return Failure<EmuFavoriteEmployeeDto>("employeeId", "Сотрудник не найден в избранных ЭМУ");
        }

        entity.IsActive = false;
        dbContext.SaveChanges();
        return Success(MapFavoriteEmployee(entity));
    }
}
