using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfEmuShiftReportService(Patrol360DbContext dbContext) : IEmuShiftReportService
{
    private static readonly string[] MechanicWords = ["слесар", "механик"];
    private static readonly string[] ElectricianWords = ["электрик", "электромонт", "электромеханик"];

    public EmuShiftReportOptionsDto GetOptions(IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        var employees = dbContext.Employees.AsNoTracking().OrderBy(row => row.FullName).ToArray()
            .Where(IsActiveEmployee)
            .Select(MapEmployeeOption)
            .ToArray();

        var sectionsQuery = dbContext.EmuWorkSections.AsNoTracking().Where(row => row.IsActive);
        if (allowedSectionIds is not null)
        {
            sectionsQuery = sectionsQuery.Where(row => allowedSectionIds.Contains(row.Id));
        }

        var sections = sectionsQuery.OrderBy(row => row.SortOrder).ThenBy(row => row.Name)
            .Select(row => new EmuReferenceDto(row.Id, row.Name, row.Code, row.IsActive, row.SortOrder)).ToArray();
        var shifts = dbContext.EmuShiftTemplates.AsNoTracking().Where(row => row.IsActive && (row.ShiftType == "day" || row.ShiftType == "night"))
            .OrderBy(row => row.SortOrder)
            .Select(row => new EmuShiftReportShiftOptionDto(row.ShiftType, row.Name, row.StartTime, row.EndTime, row.CrossesMidnight)).ToArray();
        return new EmuShiftReportOptionsDto(employees, sections, shifts);
    }

    public EmuCommandResult<EmuShiftReportEmployeeOptionDto> SetEmployeeCategory(Guid employeeId, EmuSetShiftReportEmployeeCategoryDto request)
    {
        var category = request.WorkerCategory?.Trim().ToLowerInvariant();
        if (category is not null and not ("mechanic" or "electrician" or "none"))
        {
            return new(null, new Dictionary<string, string[]> { ["workerCategory"] = ["Выберите группу: слесари, электрики, без группы или автоматическое определение."] });
        }

        var employee = dbContext.Employees.SingleOrDefault(row => row.Id == employeeId);
        if (employee is null || !IsActiveEmployee(employee))
        {
            return new(null, new Dictionary<string, string[]> { ["employeeId"] = ["Активный сотрудник не найден."] });
        }

        employee.EmuShiftReportCategory = category;
        dbContext.SaveChanges();
        return new(MapEmployeeOption(employee), new Dictionary<string, string[]>());
    }
    public EmuCommandResult<EmuShiftReportDetailDto> Create(EmuCreateShiftReportDto request, Guid? actorUserId, string actorName, IReadOnlyList<Guid>? allowedSectionIds = null)
    {
        var errors = Validate(request, allowedSectionIds);
        if (errors.Count > 0)
        {
            return Failed(errors);
        }

        var employee = dbContext.Employees.Single(row => row.Id == request.EmployeeId);
        var duplicateId = dbContext.EmuShiftReports.AsNoTracking()
            .Where(row => row.EmployeeId == request.EmployeeId && row.ReportDate == request.ReportDate && row.ShiftType == request.ShiftType)
            .Select(row => (Guid?)row.Id).FirstOrDefault();
        if (duplicateId is not null)
        {
            return Failed(new Dictionary<string, string[]> { ["duplicate"] = [duplicateId.Value.ToString()] });
        }

        var sectionIds = request.Lines.Where(row => row.SectionId.HasValue).Select(row => row.SectionId!.Value).Distinct().ToArray();
        var sections = dbContext.EmuWorkSections.AsNoTracking().Where(row => sectionIds.Contains(row.Id)).ToDictionary(row => row.Id);
        var now = DateTimeOffset.UtcNow;
        var report = new EmuShiftReportEntity
        {
            Id = Guid.NewGuid(), ReportDate = request.ReportDate, ShiftType = request.ShiftType, WorkerCategory = request.WorkerCategory,
            EmployeeId = employee.Id, EmployeeNameSnapshot = employee.FullName.Trim(), PersonnelNoSnapshot = employee.PersonnelNo.Trim(),
            PositionSnapshot = employee.Position.Trim(), DepartmentSnapshot = employee.Department.Trim(), Status = "submitted",
            CreatedByUserId = actorUserId, CreatedByName = string.IsNullOrWhiteSpace(actorName) ? "Система" : actorName.Trim(),
            CreatedAt = now, UpdatedAt = now, SubmittedAt = now, RowVersion = 1
        };
        report.Lines = request.Lines.Select((line, index) => new EmuShiftReportLineEntity
        {
            Id = Guid.NewGuid(), ReportId = report.Id, SequenceNo = index + 1, WorkDescription = line.WorkDescription.Trim(),
            DurationMinutes = line.DurationMinutes, SectionId = line.SectionId,
            SectionNameSnapshot = line.SectionId is Guid sectionId ? sections[sectionId].Name : string.Empty,
            Note = line.Note?.Trim() ?? string.Empty, CreatedAt = now
        }).ToList();
        dbContext.EmuShiftReports.Add(report);
        try
        {
            dbContext.SaveChanges();
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            duplicateId = dbContext.EmuShiftReports.AsNoTracking()
                .Where(row => row.EmployeeId == request.EmployeeId && row.ReportDate == request.ReportDate && row.ShiftType == request.ShiftType)
                .Select(row => (Guid?)row.Id).FirstOrDefault();
            if (duplicateId is not null)
            {
                return Failed(new Dictionary<string, string[]> { ["duplicate"] = [duplicateId.Value.ToString()] });
            }
            throw;
        }
        return Success(MapDetail(report));
    }

    public async Task<EmuListResponseDto<EmuShiftReportSummaryDto>> GetListAsync(EmuShiftReportQueryDto query, Guid? restrictedOwnerUserId = null, IReadOnlyList<Guid>? allowedSectionIds = null, CancellationToken cancellationToken = default)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, 100);
        var rows = Filter(dbContext.EmuShiftReports.AsNoTracking(), query, restrictedOwnerUserId, allowedSectionIds);
        var total = await rows.CountAsync(cancellationToken);
        var result = await rows
            .OrderByDescending(row => row.ReportDate)
            .ThenByDescending(row => row.SubmittedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(row => new EmuShiftReportSummaryDto(
                row.Id,
                row.ReportDate,
                row.ShiftType,
                row.WorkerCategory,
                row.EmployeeId,
                row.EmployeeNameSnapshot,
                row.PersonnelNoSnapshot,
                row.PositionSnapshot,
                row.DepartmentSnapshot,
                row.Status,
                row.Lines.Count(),
                row.Lines.Sum(line => line.DurationMinutes),
                row.CreatedByUserId,
                row.CreatedByName,
                row.SubmittedAt))
            .ToArrayAsync(cancellationToken);
        return new EmuListResponseDto<EmuShiftReportSummaryDto>(result, total, page, pageSize, Math.Max(1, (int)Math.Ceiling(total / (double)pageSize)));
    }

    public async Task<EmuCommandResult<EmuShiftReportDetailDto>> GetDetailAsync(Guid id, Guid? restrictedOwnerUserId = null, IReadOnlyList<Guid>? allowedSectionIds = null, CancellationToken cancellationToken = default)
    {
        var query = Filter(dbContext.EmuShiftReports.AsNoTracking().Include(row => row.Lines), new EmuShiftReportQueryDto(), restrictedOwnerUserId, allowedSectionIds);
        var report = await query.SingleOrDefaultAsync(row => row.Id == id, cancellationToken);
        return report is null ? Failed(new Dictionary<string, string[]> { ["id"] = ["Отчёт не найден или недоступен."] }) : Success(MapDetail(report));
    }
    private Dictionary<string, string[]> Validate(EmuCreateShiftReportDto request, IReadOnlyList<Guid>? allowedSectionIds)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.ShiftType is not ("day" or "night")) errors["shiftType"] = ["Выберите дневную или ночную смену."];
        if (request.WorkerCategory is not ("mechanic" or "electrician")) errors["workerCategory"] = ["Выберите категорию сотрудника."];
        if (request.Lines.Count is < 1 or > 50) errors["lines"] = ["Укажите от 1 до 50 выполненных работ."];
        var employee = dbContext.Employees.AsNoTracking().SingleOrDefault(row => row.Id == request.EmployeeId);
        if (employee is null || !IsActiveEmployee(employee)) errors["employeeId"] = ["Активный сотрудник не найден."];

        for (var index = 0; index < request.Lines.Count; index++)
        {
            var line = request.Lines[index];
            var prefix = $"lines[{index}]";
            var description = line.WorkDescription?.Trim() ?? string.Empty;
            if (description.Length is < 3 or > 1500) errors[$"{prefix}.workDescription"] = ["Название работы должно содержать от 3 до 1500 символов."];
            if (line.DurationMinutes is < 1 or > 1440) errors[$"{prefix}.durationMinutes"] = ["Продолжительность должна быть от 1 до 1440 минут."];
            if ((line.Note?.Trim().Length ?? 0) > 1500) errors[$"{prefix}.note"] = ["Примечание не должно превышать 1500 символов."];
            if (line.SectionId is Guid sectionId)
            {
                var accessible = (allowedSectionIds is null || allowedSectionIds.Contains(sectionId)) && dbContext.EmuWorkSections.AsNoTracking().Any(row => row.Id == sectionId && row.IsActive);
                if (!accessible) errors[$"{prefix}.sectionId"] = ["Участок не найден или недоступен."];
            }
        }
        return errors;
    }

    private IQueryable<EmuShiftReportEntity> Filter(IQueryable<EmuShiftReportEntity> rows, EmuShiftReportQueryDto query, Guid? ownerId, IReadOnlyList<Guid>? sections)
    {
        if (ownerId is not null) rows = rows.Where(row => row.CreatedByUserId == ownerId);
        if (sections is not null) rows = rows.Where(row => row.Lines.All(line => !line.SectionId.HasValue || sections.Contains(line.SectionId.Value)));
        if (query.Date is DateOnly date) rows = rows.Where(row => row.ReportDate == date);
        if (query.DateFrom is DateOnly from) rows = rows.Where(row => row.ReportDate >= from);
        if (query.DateTo is DateOnly to) rows = rows.Where(row => row.ReportDate <= to);
        if (!string.IsNullOrWhiteSpace(query.ShiftType)) rows = rows.Where(row => row.ShiftType == query.ShiftType);
        if (!string.IsNullOrWhiteSpace(query.WorkerCategory)) rows = rows.Where(row => row.WorkerCategory == query.WorkerCategory);
        if (query.EmployeeId is Guid employeeId) rows = rows.Where(row => row.EmployeeId == employeeId);
        if (query.FavoriteOnly)
        {
            rows = rows.Where(row => dbContext.EmuFavoriteEmployees.Any(favorite => favorite.EmployeeId == row.EmployeeId && favorite.IsActive));
        }
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim().ToLower();
            rows = rows.Where(row => row.EmployeeNameSnapshot.ToLower().Contains(search) || row.PositionSnapshot.ToLower().Contains(search) || row.Lines.Any(line => line.WorkDescription.ToLower().Contains(search) || line.SectionNameSnapshot.ToLower().Contains(search) || line.Note.ToLower().Contains(search)));
        }
        return rows;
    }

    private static EmuShiftReportSummaryDto MapSummary(EmuShiftReportEntity row) => new(row.Id, row.ReportDate, row.ShiftType, row.WorkerCategory, row.EmployeeId, row.EmployeeNameSnapshot, row.PersonnelNoSnapshot, row.PositionSnapshot, row.DepartmentSnapshot, row.Status, row.Lines.Count, row.Lines.Sum(line => line.DurationMinutes), row.CreatedByUserId, row.CreatedByName, row.SubmittedAt);
    private static EmuShiftReportDetailDto MapDetail(EmuShiftReportEntity row) => new(row.Id, row.ReportDate, row.ShiftType, row.WorkerCategory, row.EmployeeId, row.EmployeeNameSnapshot, row.PersonnelNoSnapshot, row.PositionSnapshot, row.DepartmentSnapshot, row.Status, row.Lines.Count, row.Lines.Sum(line => line.DurationMinutes), row.CreatedByUserId, row.CreatedByName, row.SubmittedAt, row.Lines.OrderBy(line => line.SequenceNo).Select(line => new EmuShiftReportLineDto(line.Id, line.SequenceNo, line.WorkDescription, line.DurationMinutes, line.SectionId, line.SectionNameSnapshot, line.Note)).ToArray());
    private static string Normalize(string value) => value.Trim().ToLowerInvariant().Replace('ё', 'е');
    private static bool IsActiveEmployee(EmployeeEntity row) => Normalize(row.Status) is "active" or "активен" or "работает";
    private static EmuShiftReportEmployeeOptionDto MapEmployeeOption(EmployeeEntity row) => new(
        row.Id,
        row.FullName,
        row.PersonnelNo,
        row.Position,
        row.Department,
        ResolveWorkerCategory(row),
        row.EmuShiftReportCategory);

    private static string? ResolveWorkerCategory(EmployeeEntity row) => row.EmuShiftReportCategory switch
    {
        "mechanic" => "mechanic",
        "electrician" => "electrician",
        "none" => null,
        _ => Classify(row.Position)
    };
    private static string? Classify(string position)
    {
        var value = Normalize(position);
        if (ElectricianWords.Any(value.Contains)) return "electrician";
        if (MechanicWords.Any(value.Contains)) return "mechanic";
        return null;
    }
    private static EmuCommandResult<EmuShiftReportDetailDto> Success(EmuShiftReportDetailDto value) => new(value, new Dictionary<string, string[]>());
    private static EmuCommandResult<EmuShiftReportDetailDto> Failed(IReadOnlyDictionary<string, string[]> errors) => new(null, errors);
}
