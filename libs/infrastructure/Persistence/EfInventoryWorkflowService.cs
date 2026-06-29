using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfInventoryWorkflowService(Patrol360DbContext dbContext) : IInventoryWorkflowService
{
    private const string Actor = "system";
    private const string DefaultPpeNormPoint = "п. 1645 Приложения № 1";

    private const string AccountingMovementWarehouseName = "Системный учет движения";

    private static readonly IReadOnlyList<InventoryReportDto> ReportDefinitions =
    [
        new("stock", "Остатки", "Текущие остатки по складам и номенклатуре", "xlsx"),
        new("moves", "Движения", "Приход, выдача, возвраты и списания", "xlsx"),
        new("ppe", "СИЗ", "Карточки СИЗ, строки и статусы выдачи", "pdf/docx/xlsx"),
        new("custody", "Под запись", "Акты и личная ответственность сотрудников", "pdf/xlsx"),
        new("history", "История операций", "Единый журнал операций Inventory", "xlsx"),
        new("employees", "Сотрудники учета", "Сотрудники, должности, подразделения и группы", "xlsx"),
        new("system_log", "Системный журнал", "Аудит импорта, печати, настроек и операций", "xlsx")
    ];

    private static readonly HashSet<string> ReservationMoveTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "reservation",
        "reserve",
        "ppe_reserve",
        "ppe_reservation"
    };

    public InventoryListResponseDto<InventoryCustodyRecordDto> GetCustodyRecords(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = dbContext.InventoryCustodyRecords
            .AsNoTracking()
            .Include(record => record.Document)
            .Include(record => record.Employee)
            .Include(record => record.Item)
            .Include(record => record.Warehouse)
            .Where(record => record.ArchivedAt == null);

        var search = NormalizeQuery(query.Query);
        if (search.Length > 0)
        {
            rowsQuery = rowsQuery.Where(record =>
                record.Employee.FullName.ToLower().Contains(search) ||
                record.Item.Name.ToLower().Contains(search) ||
                record.Warehouse.Name.ToLower().Contains(search) ||
                record.Status.ToLower().Contains(search));
        }

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            var status = NormalizeStatus(query.Status);
            rowsQuery = rowsQuery.Where(record => record.Status == status);
        }

        var total = rowsQuery.Count();
        var rows = rowsQuery
            .OrderByDescending(record => record.IssuedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList()
            .Select(MapCustodyRecord)
            .ToList();

        return ToListResponse(rows, total, paging);
    }

    public InventoryCommandResult<InventoryCustodyRecordDto> CreateCustodyRecord(CreateInventoryCustodyRecordDto request)
    {
        if (request.Quantity <= 0)
        {
            return Failure<InventoryCustodyRecordDto>("quantity", "Quantity must be greater than zero");
        }

        var employee = dbContext.Employees.FirstOrDefault(row => row.Id == request.EmployeeId);
        if (employee is null)
        {
            return Failure<InventoryCustodyRecordDto>("employeeId", "Employee not found");
        }

        var item = dbContext.InventoryItems.FirstOrDefault(row => row.Id == request.ItemId);
        if (item is null)
        {
            return Failure<InventoryCustodyRecordDto>("itemId", "Item not found");
        }

        var warehouse = request.WarehouseId is not null
            ? dbContext.InventoryWarehouses.FirstOrDefault(row => row.Id == request.WarehouseId.Value && !row.IsArchived)
            : EnsureAccountingMovementWarehouse();
        if (warehouse is null)
        {
            return Failure<InventoryCustodyRecordDto>("warehouseId", "Warehouse not found");
        }

        var now = DateTimeOffset.UtcNow;
        var document = request.DocumentId is null
            ? CreateCustodyDocument(employee, now)
            : dbContext.InventoryCustodyDocuments.FirstOrDefault(row => row.Id == request.DocumentId.Value);

        if (document is null || document.ArchivedAt is not null)
        {
            return Failure<InventoryCustodyRecordDto>("documentId", "Custody document not found");
        }

        if (document.Status == "closed")
        {
            return Failure<InventoryCustodyRecordDto>("documentId", "Custody document is closed");
        }

        var record = new InventoryCustodyRecordEntity
        {
            Id = Guid.NewGuid(),
            DocumentId = document.Id,
            EmployeeId = employee.Id,
            ItemId = item.Id,
            WarehouseId = warehouse.Id,
            Quantity = request.Quantity,
            Status = "in_use",
            Comment = NormalizeOptional(request.Comment),
            IssuedAt = now
        };

        dbContext.InventoryCustodyRecords.Add(record);
        AddCustodyEvent(record.Id, "created", string.Empty, "in_use", record.Comment, now);
        AddSystemLog("custody_record", record.Id, "created", $"{employee.FullName}: {item.Name} x {request.Quantity}", now);
        dbContext.SaveChanges();

        return Success(MapCustodyRecord(LoadCustodyRecord(record.Id)));
    }

    public InventoryCommandResult<InventoryCustodyRecordDto> UpdateCustodyRecordStatus(Guid id, UpdateInventoryStatusDto request)
    {
        var record = dbContext.InventoryCustodyRecords
            .Include(row => row.Document)
            .FirstOrDefault(row => row.Id == id && row.ArchivedAt == null);
        if (record is null)
        {
            return Failure<InventoryCustodyRecordDto>("id", "Custody record not found");
        }

        if (record.Document.Status == "closed" && request.Status is not "in_use")
        {
            return Failure<InventoryCustodyRecordDto>("documentId", "Custody document is closed");
        }

        var nextStatus = NormalizeCustodyStatus(request.Status);
        if (nextStatus.Length == 0)
        {
            return Failure<InventoryCustodyRecordDto>("status", "Unsupported custody status");
        }

        var oldStatus = record.Status;
        if (oldStatus == nextStatus)
        {
            return Success(MapCustodyRecord(LoadCustodyRecord(record.Id)));
        }

        var now = DateTimeOffset.UtcNow;
        var normalizedComment = NormalizeOptional(request.Comment);
        record.Status = nextStatus;
        record.ClosedAt = nextStatus == "in_use" ? null : now;
        if (!string.IsNullOrWhiteSpace(normalizedComment))
        {
            record.Comment = normalizedComment;
        }

        AddCustodyEvent(record.Id, "status_changed", oldStatus, nextStatus, normalizedComment, now);
        var logDetails = string.IsNullOrWhiteSpace(normalizedComment)
            ? $"{oldStatus} -> {nextStatus}"
            : $"{oldStatus} -> {nextStatus}; {normalizedComment}";
        AddSystemLog("custody_record", record.Id, "status_changed", logDetails, now);
        dbContext.SaveChanges();

        return Success(MapCustodyRecord(LoadCustodyRecord(record.Id)));
    }

    public InventoryCommandResult<InventoryCustodyRecordDto> ArchiveCustodyRecord(Guid id)
    {
        var record = dbContext.InventoryCustodyRecords.FirstOrDefault(row => row.Id == id && row.ArchivedAt == null);
        if (record is null)
        {
            return Failure<InventoryCustodyRecordDto>("id", "Custody record not found");
        }

        record.ArchivedAt = DateTimeOffset.UtcNow;
        AddSystemLog("custody_record", record.Id, "archived", "Custody record archived", record.ArchivedAt.Value);
        dbContext.SaveChanges();

        return Success(MapCustodyRecord(LoadCustodyRecord(record.Id)));
    }

    public InventoryListResponseDto<InventoryCustodyDocumentDto> GetCustodyDocuments(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = dbContext.InventoryCustodyDocuments
            .AsNoTracking()
            .Include(document => document.Employee)
            .Include(document => document.Records)
            .Where(document => document.ArchivedAt == null);

        var total = rowsQuery.Count();
        var rows = rowsQuery
            .OrderByDescending(document => document.CreatedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList()
            .Select(MapCustodyDocument)
            .ToList();

        return ToListResponse(rows, total, paging);
    }

    public InventoryCommandResult<InventoryCustodyDocumentDetailDto> GetCustodyDocument(Guid id)
    {
        var document = dbContext.InventoryCustodyDocuments
            .AsNoTracking()
            .Include(row => row.Employee)
            .Include(row => row.Records)
                .ThenInclude(record => record.Employee)
            .Include(row => row.Records)
                .ThenInclude(record => record.Item)
            .Include(row => row.Records)
                .ThenInclude(record => record.Warehouse)
            .FirstOrDefault(row => row.Id == id);
        if (document is null)
        {
            return Failure<InventoryCustodyDocumentDetailDto>("id", "Custody document not found");
        }

        var recordIds = document.Records.Select(row => row.Id).ToArray();
        var historyRows = dbContext.InventoryCustodyRecordEvents
            .AsNoTracking()
            .Where(row => recordIds.Contains(row.RecordId))
            .OrderByDescending(row => row.CreatedAt)
            .ToList();
        var history = historyRows
            .Select(row => new InventoryHistoryDto(
                row.Id,
                "custody_record",
                ToCustodyHistoryAction(row),
                BuildCustodyEventDescription(row),
                row.Actor,
                row.CreatedAt.UtcDateTime))
            .ToList();

        return Success(new InventoryCustodyDocumentDetailDto(
            document.Id,
            document.Number,
            document.EmployeeId,
            document.Employee.FullName,
            document.Employee.PersonnelNo,
            document.Employee.Department,
            document.Status,
            document.CreatedAt.UtcDateTime,
            document.ClosedAt?.UtcDateTime,
            document.Records
                .Where(row => row.ArchivedAt == null)
                .OrderBy(row => row.IssuedAt)
                .Select(MapCustodyRecord)
                .ToList(),
            history));
    }

    public InventoryListResponseDto<InventoryHistoryDto> GetCustodyRecordHistory(Guid id, InventoryListQuery query) =>
        GetCustodyHistoryFromEvents(query, eventQuery => eventQuery.Where(row => row.RecordId == id));

    public InventoryListResponseDto<InventoryHistoryDto> GetCustodyDocumentHistory(Guid id, InventoryListQuery query)
    {
        var recordIds = dbContext.InventoryCustodyRecords
            .Where(row => row.DocumentId == id)
            .Select(row => row.Id)
            .ToArray();

        return GetCustodyHistoryFromEvents(query, eventQuery => eventQuery.Where(row => recordIds.Contains(row.RecordId)));
    }

    public InventoryCommandResult<InventoryCustodyDocumentDto> CloseCustodyDocument(Guid id) => ChangeCustodyDocumentStatus(id, "closed");

    public InventoryCommandResult<InventoryCustodyDocumentDto> OpenCustodyDocument(Guid id) => ChangeCustodyDocumentStatus(id, "open");

    public InventoryCommandResult<InventoryCustodyDocumentDto> ArchiveCustodyDocument(Guid id)
    {
        var document = dbContext.InventoryCustodyDocuments
            .Include(row => row.Employee)
            .Include(row => row.Records)
            .FirstOrDefault(row => row.Id == id && row.ArchivedAt == null);
        if (document is null)
        {
            return Failure<InventoryCustodyDocumentDto>("id", "Custody document not found");
        }

        document.ArchivedAt = DateTimeOffset.UtcNow;
        document.Status = "archived";
        AddSystemLog("custody_document", document.Id, "archived", document.Number, document.ArchivedAt.Value);
        dbContext.SaveChanges();

        return Success(MapCustodyDocument(document));
    }

    public InventoryListResponseDto<InventoryReportDto> GetReports(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var search = NormalizeQuery(query.Query);
        var filtered = ReportDefinitions
            .Where(report => search.Length == 0 ||
                report.Title.ToLowerInvariant().Contains(search) ||
                report.Description.ToLowerInvariant().Contains(search) ||
                report.Id.Contains(search, StringComparison.OrdinalIgnoreCase))
            .ToList();

        var rows = filtered
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();

        return ToListResponse(rows, filtered.Count, paging);
    }

    public InventoryCommandResult<InventoryExportJobDto> ExportReport(string reportId, string format)
    {
        var normalizedReportId = NormalizeOptional(reportId).ToLowerInvariant();
        var report = ReportDefinitions.FirstOrDefault(row => row.Id == normalizedReportId);
        if (report is null)
        {
            return Failure<InventoryExportJobDto>("reportId", "Report not found");
        }

        var normalizedFormat = NormalizeOptional(format).ToLowerInvariant();
        if (normalizedFormat.Length == 0)
        {
            normalizedFormat = report.Format.Split('/')[0];
        }

        var now = DateTimeOffset.UtcNow;
        var export = new InventoryExportJobEntity
        {
            Id = Guid.NewGuid(),
            ReportId = report.Id,
            Format = normalizedFormat,
            Status = "completed",
            DownloadName = $"inventory-{report.Id}-{now:yyyyMMddHHmmss}.{normalizedFormat}",
            PayloadJson = "{\"status\":\"completed\"}",
            CreatedAt = now
        };

        dbContext.InventoryExportJobs.Add(export);
        AddSystemLog("export_job", export.Id, "created", export.DownloadName, now);
        dbContext.SaveChanges();

        return Success(MapExport(export));
    }

    public InventoryCommandResult<InventoryExportJobDto> GetExport(Guid exportId)
    {
        var export = dbContext.InventoryExportJobs.AsNoTracking().FirstOrDefault(row => row.Id == exportId);
        return export is null
            ? Failure<InventoryExportJobDto>("exportId", "Export job not found")
            : Success(MapExport(export));
    }

    public InventoryListResponseDto<InventoryEmployeeDto> GetEmployees(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = dbContext.Employees.AsNoTracking().AsQueryable();
        var search = NormalizeQuery(query.Query);
        if (search.Length > 0)
        {
            rowsQuery = rowsQuery.Where(row =>
                row.FullName.ToLower().Contains(search) ||
                row.PersonnelNo.ToLower().Contains(search) ||
                row.Position.ToLower().Contains(search) ||
                row.Department.ToLower().Contains(search) ||
                row.EmployeeGroup.ToLower().Contains(search));
        }

        var requestedStatus = NormalizeOptional(query.Status);
        if (requestedStatus.Length > 0 && !string.Equals(requestedStatus, "all", StringComparison.OrdinalIgnoreCase))
        {
            var status = NormalizeInventoryEmployeeStatus(requestedStatus);
            rowsQuery = ApplyInventoryEmployeeStatusFilter(rowsQuery, status);
        }

        var department = NormalizeOptional(query.Department).ToLowerInvariant();
        if (department.Length > 0 && department != "all")
        {
            rowsQuery = rowsQuery.Where(row => row.Department.ToLower() == department);
        }

        var employeeGroup = NormalizeOptional(query.EmployeeGroup).ToLowerInvariant();
        if (employeeGroup.Length > 0 && employeeGroup != "all")
        {
            rowsQuery = rowsQuery.Where(row => row.EmployeeGroup.ToLower() == employeeGroup);
        }

        var total = rowsQuery.Count();
        var rows = rowsQuery
            .OrderBy(row => row.FullName)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .Select(row => MapEmployee(row))
            .ToList();

        return ToListResponse(rows, total, paging);
    }

    public InventoryCommandResult<InventoryEmployeeImportPreviewDto> PreviewEmployeesImport(Stream source, string fileName)
    {
        IReadOnlyList<Dictionary<string, string>> rows;
        try
        {
            rows = fileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase)
                ? ReadEmployeeRowsFromXlsx(source)
                : ReadEmployeeRowsFromDelimitedText(source);
        }
        catch (InvalidDataException ex)
        {
            return Failure<InventoryEmployeeImportPreviewDto>("file", ex.Message);
        }

        return Success(BuildEmployeeImportPreview(rows));
    }

    public InventoryCommandResult<InventoryEmployeeImportResultDto> ImportEmployees(Stream source, string fileName, string previewToken)
    {
        IReadOnlyList<Dictionary<string, string>> rows;
        try
        {
            rows = fileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase)
                ? ReadEmployeeRowsFromXlsx(source)
                : ReadEmployeeRowsFromDelimitedText(source);
        }
        catch (InvalidDataException ex)
        {
            return Failure<InventoryEmployeeImportResultDto>("file", ex.Message);
        }

        var preview = BuildEmployeeImportPreview(rows);
        var now = DateTimeOffset.UtcNow;
        var existingEmployees = dbContext.Employees.ToList();

        foreach (var row in preview.Rows.Where(row => row.Error.Length == 0))
        {
            UpsertEmployeeReference("position", row.Position, now);
            UpsertEmployeeReference("department", row.Department, now);
            UpsertEmployeeReference("group", row.EmployeeGroup, now);
            var normalizedFullName = NormalizeFullName(row.FullName);
            var existing = existingEmployees.FirstOrDefault(employee =>
                string.Equals(employee.PersonnelNo, row.PersonnelNo, StringComparison.OrdinalIgnoreCase)
                || NormalizeFullName(employee.FullName) == normalizedFullName);
            if (existing is null)
            {
                var employee = new EmployeeEntity
                {
                    Id = Guid.NewGuid(),
                    FullName = row.FullName,
                    PersonnelNo = row.PersonnelNo,
                    Position = row.Position,
                    Department = row.Department,
                    EmployeeGroup = row.EmployeeGroup,
                    HiredAt = row.HiredAt,
                    BirthDate = row.BirthDate,
                    Status = "active",
                    Shift = string.Empty,
                    HasMobileAccount = false,
                    LastSeenAt = now
                };
                dbContext.Employees.Add(employee);
                existingEmployees.Add(employee);
            }
            else
            {
                existing.FullName = row.FullName;
                existing.PersonnelNo = row.PersonnelNo;
                existing.Position = row.Position;
                existing.Department = row.Department;
                existing.EmployeeGroup = row.EmployeeGroup;
                existing.HiredAt = row.HiredAt;
                existing.BirthDate = row.BirthDate;
                if (NormalizeInventoryEmployeeStatus(existing.Status) == "archived")
                {
                    existing.Status = "active";
                }
            }
        }

        AddSystemLog("employee", Guid.Empty, "import", $"{fileName}: inserted={preview.NewRows}, updated={preview.UpdateRows}, skipped={preview.SkippedRows}", now);
        dbContext.SaveChanges();

        return Success(new InventoryEmployeeImportResultDto(preview.RowsRead, preview.NewRows, preview.UpdateRows, preview.SkippedRows, preview.Errors));
    }

    public InventoryCommandResult<InventoryEmployeeDto> ArchiveEmployee(Guid id)
    {
        var employee = dbContext.Employees.FirstOrDefault(row => row.Id == id);
        if (employee is null)
        {
            return Failure<InventoryEmployeeDto>("id", "Employee not found");
        }

        var hasActiveResponsibility =
            dbContext.InventoryPpeCards.Any(card =>
                card.EmployeeId == employee.Id &&
                card.ArchivedAt == null &&
                card.Lines.Any(line => line.Status == "issued" || line.Status == "issuing" || line.Status == "partial")) ||
            dbContext.InventoryCustodyRecords.Any(record =>
                record.EmployeeId == employee.Id &&
                record.ArchivedAt == null &&
                record.Status == "in_use");
        if (hasActiveResponsibility)
        {
            return Failure<InventoryEmployeeDto>(
                "id",
                "Employee has active PPE or custody records. Return or close them before archive.");
        }

        employee.Status = "archived";
        AddSystemLog("employee", employee.Id, "archived", employee.FullName, DateTimeOffset.UtcNow);
        dbContext.SaveChanges();

        return Success(MapEmployee(employee));
    }

    public InventoryListResponseDto<InventoryUserDto> GetUsers(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = dbContext.SiteUsers
            .AsNoTracking()
            .Include(user => user.Roles)
                .ThenInclude(role => role.Role)
            .AsQueryable();

        var search = NormalizeQuery(query.Query);
        if (search.Length > 0)
        {
            rowsQuery = rowsQuery.Where(user =>
                user.Login.ToLower().Contains(search) ||
                user.DisplayName.ToLower().Contains(search) ||
                user.Status.ToLower().Contains(search) ||
                user.Roles.Any(role => role.Role.Code.ToLower().Contains(search)));
        }

        var status = NormalizeOptional(query.Status).ToLowerInvariant();
        if (status.Length > 0 && status != "all")
        {
            rowsQuery = rowsQuery.Where(user => user.Status.ToLower() == status);
        }

        var roleCode = NormalizeOptional(query.Role).ToLowerInvariant();
        if (roleCode.Length > 0 && roleCode != "all")
        {
            rowsQuery = rowsQuery.Where(user => user.Roles.Any(role => role.Role.Code.ToLower() == roleCode));
        }

        var total = rowsQuery.Count();
        var rows = rowsQuery
            .OrderBy(user => user.Login)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList()
            .Select(user => new InventoryUserDto(
                user.Id,
                user.Login,
                user.DisplayName,
                user.Status,
                user.Roles.Select(role => role.Role.Code).OrderBy(role => role).ToList()))
            .ToList();

        return ToListResponse(rows, total, paging);
    }

    public InventoryCommandResult<InventoryUserDto> DisableUser(Guid id)
    {
        var user = dbContext.SiteUsers
            .Include(row => row.Roles)
            .ThenInclude(role => role.Role)
            .FirstOrDefault(row => row.Id == id);
        if (user is null)
        {
            return Failure<InventoryUserDto>("id", "User not found");
        }

        user.Status = "disabled";
        AddSystemLog("site_user", user.Id, "disabled", user.Login, DateTimeOffset.UtcNow);
        dbContext.SaveChanges();

        return Success(new InventoryUserDto(
            user.Id,
            user.Login,
            user.DisplayName,
            user.Status,
            user.Roles.Select(role => role.Role.Code).OrderBy(role => role).ToList()));
    }

    private InventoryEmployeeImportPreviewDto BuildEmployeeImportPreview(IReadOnlyList<Dictionary<string, string>> rows)
    {
        var existingEmployees = dbContext.Employees
            .AsNoTracking()
            .Select(employee => new { employee.PersonnelNo, employee.FullName })
            .ToList();
        var existingPersonnel = existingEmployees
            .Select(employee => employee.PersonnelNo)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var existingFullNames = existingEmployees
            .GroupBy(employee => NormalizeFullName(employee.FullName))
            .Where(group => group.Key.Length > 0)
            .ToDictionary(group => group.Key, group => group.First().PersonnelNo, StringComparer.OrdinalIgnoreCase);
        var existingNamesByPersonnel = existingEmployees
            .GroupBy(employee => employee.PersonnelNo, StringComparer.OrdinalIgnoreCase)
            .Where(group => !string.IsNullOrWhiteSpace(group.Key))
            .ToDictionary(group => group.Key, group => NormalizeFullName(group.First().FullName), StringComparer.OrdinalIgnoreCase);
        var existingPositions = dbContext.AccountingEmployeeReferences
            .AsNoTracking()
            .Where(reference => reference.Kind == "position")
            .Select(reference => reference.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var existingDepartments = dbContext.AccountingEmployeeReferences
            .AsNoTracking()
            .Where(reference => reference.Kind == "department")
            .Select(reference => reference.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var existingGroups = dbContext.AccountingEmployeeReferences
            .AsNoTracking()
            .Where(reference => reference.Kind == "group")
            .Select(reference => reference.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var seenPersonnel = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenFullNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var previewRows = new List<InventoryEmployeeImportPreviewRowDto>();
        var errors = new List<string>();
        var newPositions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var newDepartments = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var newGroups = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var (row, index) in rows.Select((row, index) => (row, index + 2)))
        {
            var fullName = ReadField(row, "фио", "сотрудник", "full_name", "name");
            var personnelNo = ReadField(row, "табельный", "табельный номер", "personnelno", "personnel_no", "code");
            var position = ReadField(row, "должность", "position", "role");
            var department = ReadField(row, "подразделение", "отдел", "department");
            var employeeGroup = NormalizeEmployeeGroup(ReadField(row, "группа", "организация", "employee_group", "company"));
            var hiredAt = ParseDateOnly(ReadField(row, "дата приема", "дата приёма", "hired_at", "hire_date"));
            var birthDate = ParseDateOnly(ReadField(row, "дата рождения", "birth_date"));
            var normalizedFullName = NormalizeFullName(fullName);
            var error = string.Empty;

            if (string.IsNullOrWhiteSpace(fullName))
            {
                error = "Не заполнено ФИО сотрудника";
            }
            else if (string.IsNullOrWhiteSpace(personnelNo))
            {
                personnelNo = $"INV-{StableToken(fullName)}";
            }

            if (error.Length == 0 && !seenFullNames.Add(normalizedFullName))
            {
                error = $"Дублируется ФИО {fullName} в импортируемом файле";
            }

            if (error.Length == 0 && !seenPersonnel.Add(personnelNo))
            {
                error = $"Дублируется табельный номер {personnelNo} в импортируемом файле";
            }

            if (error.Length == 0
                && existingNamesByPersonnel.TryGetValue(personnelNo, out var nameForPersonnel)
                && existingFullNames.TryGetValue(normalizedFullName, out var personnelForName)
                && !string.Equals(nameForPersonnel, normalizedFullName, StringComparison.OrdinalIgnoreCase)
                && !string.Equals(personnelForName, personnelNo, StringComparison.OrdinalIgnoreCase))
            {
                error = $"ФИО {fullName} и табельный номер {personnelNo} относятся к разным сотрудникам";
            }

            if (error.Length > 0)
            {
                errors.Add($"Строка {index}: {error}");
            }
            else
            {
                if (!string.IsNullOrWhiteSpace(position) && !existingPositions.Contains(position))
                {
                    newPositions.Add(position);
                }

                if (!string.IsNullOrWhiteSpace(department) && !existingDepartments.Contains(department))
                {
                    newDepartments.Add(department);
                }

                if (!string.IsNullOrWhiteSpace(employeeGroup) && !existingGroups.Contains(employeeGroup))
                {
                    newGroups.Add(employeeGroup);
                }
            }

            previewRows.Add(new InventoryEmployeeImportPreviewRowDto(
                index,
                fullName,
                personnelNo,
                position,
                department,
                employeeGroup,
                hiredAt,
                birthDate,
                error.Length > 0
                    ? "error"
                    : existingPersonnel.Contains(personnelNo) || existingFullNames.ContainsKey(normalizedFullName)
                        ? "update"
                        : "create",
                error));
        }

        return new InventoryEmployeeImportPreviewDto(
            rows.Count,
            previewRows.Count(row => row.ChangeType == "create"),
            previewRows.Count(row => row.ChangeType == "update"),
            previewRows.Count(row => row.ChangeType == "error"),
            newPositions.OrderBy(value => value).ToList(),
            newDepartments.OrderBy(value => value).ToList(),
            newGroups.OrderBy(value => value).ToList(),
            errors,
            previewRows);
    }

    private InventoryCommandResult<InventoryCustodyDocumentDto> ChangeCustodyDocumentStatus(Guid id, string status)
    {
        var document = dbContext.InventoryCustodyDocuments
            .Include(row => row.Employee)
            .Include(row => row.Records)
            .FirstOrDefault(row => row.Id == id && row.ArchivedAt == null);
        if (document is null)
        {
            return Failure<InventoryCustodyDocumentDto>("id", "Custody document not found");
        }

        document.Status = status;
        document.ClosedAt = status == "closed" ? DateTimeOffset.UtcNow : null;
        AddSystemLog("custody_document", document.Id, status, document.Number, DateTimeOffset.UtcNow);
        dbContext.SaveChanges();

        return Success(MapCustodyDocument(document));
    }

    private InventoryCustodyDocumentEntity CreateCustodyDocument(EmployeeEntity employee, DateTimeOffset now)
    {
        var document = new InventoryCustodyDocumentEntity
        {
            Id = Guid.NewGuid(),
            EmployeeId = employee.Id,
            Number = $"CST-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}",
            Status = "open",
            CreatedAt = now
        };
        dbContext.InventoryCustodyDocuments.Add(document);
        return document;
    }

    private InventoryCustodyRecordEntity LoadCustodyRecord(Guid id) =>
        dbContext.InventoryCustodyRecords
            .AsNoTracking()
            .Include(record => record.Document)
            .Include(record => record.Employee)
            .Include(record => record.Item)
            .Include(record => record.Warehouse)
            .First(record => record.Id == id);

    private InventoryWarehouseEntity EnsureAccountingMovementWarehouse()
    {
        var warehouse = dbContext.InventoryWarehouses
            .FirstOrDefault(row => row.Name == AccountingMovementWarehouseName);
        if (warehouse is not null)
        {
            return warehouse;
        }

        warehouse = new InventoryWarehouseEntity
        {
            Id = Guid.NewGuid(),
            Name = AccountingMovementWarehouseName,
            IsDefault = false,
            IsArchived = true
        };
        dbContext.InventoryWarehouses.Add(warehouse);
        return warehouse;
    }

    private static InventoryCustodyRecordDto MapCustodyRecord(InventoryCustodyRecordEntity record) =>
        new(
            record.Id,
            record.DocumentId,
            record.Employee.FullName,
            record.Item.Name,
            record.Warehouse.Name == AccountingMovementWarehouseName ? string.Empty : record.Warehouse.Name,
            record.Quantity,
            record.Status,
            record.IssuedAt.UtcDateTime,
            record.ClosedAt?.UtcDateTime,
            record.ItemId,
            record.WarehouseId,
            record.Item.Unit?.Symbol ?? record.Item.Unit?.Name ?? string.Empty,
            record.Comment ?? string.Empty);

    private static InventoryCustodyDocumentDto MapCustodyDocument(InventoryCustodyDocumentEntity document) =>
        new(
            document.Id,
            document.Number,
            document.Employee.FullName,
            document.Status,
            document.CreatedAt.UtcDateTime,
            document.Records.Count(record => record.ArchivedAt == null));


    private static InventoryEmployeeDto MapEmployee(EmployeeEntity employee) =>
        new(
            employee.Id,
            employee.FullName,
            employee.PersonnelNo,
            employee.Position,
            employee.Department,
            NormalizeInventoryEmployeeStatus(employee.Status),
            employee.EmployeeGroup,
            employee.HiredAt,
            employee.BirthDate);

    private static InventoryExportJobDto MapExport(InventoryExportJobEntity export) =>
        new(export.Id, export.ReportId, export.Format, export.Status, export.CreatedAt.UtcDateTime, export.DownloadName);

    private static InventoryListResponseDto<T> ToListResponse<T>(IReadOnlyList<T> rows, int total, InventoryPaging paging) =>
        new(rows, total, paging.Page, paging.PageSize, total == 0 ? 0 : (int)Math.Ceiling(total / (double)paging.PageSize));

    private static InventoryPaging NormalizePaging(InventoryListQuery query) =>
        new(Math.Max(1, query.Page), Math.Clamp(query.PageSize, 1, 100));

    private static string NormalizeQuery(string? query) => query?.Trim().ToLowerInvariant() ?? string.Empty;

    private static string NormalizeOptional(string? value) => value?.Trim() ?? string.Empty;

    private static string NormalizeStatus(string? status) => NormalizeOptional(status).ToLowerInvariant();

    private static string NormalizeFullName(string? value) =>
        string.Join(' ', (value ?? string.Empty)
            .Trim()
            .ToUpperInvariant()
            .Split([' ', '\t', '\r', '\n'], StringSplitOptions.RemoveEmptyEntries));

    private static IQueryable<EmployeeEntity> ApplyInventoryEmployeeStatusFilter(IQueryable<EmployeeEntity> query, string status)
    {
        if (status == "archived")
        {
            return query.Where(row =>
                row.Status.ToLower() == "archived" ||
                row.Status.ToLower() == "archive" ||
                row.Status.ToLower().Contains("архив"));
        }

        if (status == "inactive" || status == "disabled")
        {
            return query.Where(row =>
                row.Status.ToLower() == status ||
                row.Status.ToLower() == "inactive" ||
                row.Status.ToLower() == "disabled" ||
                row.Status.ToLower().Contains("неактив"));
        }

        return query.Where(row =>
            row.Status == null ||
            (
                row.Status.ToLower() != "archived" &&
                row.Status.ToLower() != "archive" &&
                row.Status.ToLower() != "inactive" &&
                row.Status.ToLower() != "disabled" &&
                !row.Status.ToLower().Contains("архив") &&
                !row.Status.ToLower().Contains("неактив")
            ));
    }

    private static string NormalizeInventoryEmployeeStatus(string? status)
    {
        var value = NormalizeStatus(status);
        if (value is "archived" or "archive" or "inactive" or "disabled")
        {
            return value is "archive" ? "archived" : value;
        }

        if (value.Contains("архив", StringComparison.OrdinalIgnoreCase))
        {
            return "archived";
        }

        if (value.Contains("неактив", StringComparison.OrdinalIgnoreCase))
        {
            return "inactive";
        }

        return "active";
    }

    private static IReadOnlyList<Dictionary<string, string>> ReadEmployeeRowsFromDelimitedText(Stream source)
    {
        using var reader = new StreamReader(source, detectEncodingFromByteOrderMarks: true, leaveOpen: true);
        var lines = reader.ReadToEnd()
            .Split(["\r\n", "\n"], StringSplitOptions.None)
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .ToList();
        if (lines.Count == 0)
        {
            return [];
        }

        var separator = lines[0].Contains(';') ? ';' : ',';
        var headers = lines[0].Split(separator).Select(NormalizeHeader).ToList();
        return lines
            .Skip(1)
            .Select(line => line.Split(separator))
            .Select(cells => headers
                .Select((header, index) => new { header, value = index < cells.Length ? cells[index].Trim() : string.Empty })
                .Where(cell => cell.header.Length > 0)
                .ToDictionary(cell => cell.header, cell => cell.value, StringComparer.OrdinalIgnoreCase))
            .Where(row => row.Count > 0)
            .ToList();
    }

    private static IReadOnlyList<Dictionary<string, string>> ReadEmployeeRowsFromXlsx(Stream source)
    {
        using var archive = new ZipArchive(source, ZipArchiveMode.Read, leaveOpen: true);
        var sheetEntry = archive.GetEntry("xl/worksheets/sheet1.xml")
            ?? throw new InvalidDataException("XLSX sheet1.xml was not found");
        var sharedStrings = ReadSharedStrings(archive);

        using var sheetStream = sheetEntry.Open();
        var sheet = XDocument.Load(sheetStream);
        XNamespace ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        var rowElements = sheet.Descendants(ns + "row").ToList();
        if (rowElements.Count == 0)
        {
            return [];
        }

        var parsedRows = rowElements.Select(row => ReadXlsxRow(row, ns, sharedStrings)).ToList();
        var headerIndex = parsedRows.FindIndex(row =>
            row.Any(cell => NormalizeHeader(cell).Contains("сотрудник", StringComparison.OrdinalIgnoreCase)) &&
            row.Any(cell => NormalizeHeader(cell).Contains("табель", StringComparison.OrdinalIgnoreCase)));
        if (headerIndex < 0)
        {
            throw new InvalidDataException("XLSX header row with employee and personnel number columns was not found");
        }

        var headers = parsedRows[headerIndex].Select(NormalizeHeader).ToList();
        var rows = new List<Dictionary<string, string>>();
        var currentDepartment = string.Empty;
        var employeeGroup = string.Empty;
        foreach (var cells in parsedRows)
        {
            var organization = ReadOrganizationName(cells);
            if (!string.IsNullOrWhiteSpace(organization))
            {
                employeeGroup = NormalizeEmployeeGroup(organization);
            }

            var department = ReadDepartmentRow(cells);
            if (!string.IsNullOrWhiteSpace(department))
            {
                currentDepartment = department;
                continue;
            }

            var row = headers
                .Select((header, index) => new { header, value = index < cells.Count ? cells[index].Trim() : string.Empty })
                .Where(cell => cell.header.Length > 0)
                .ToDictionary(cell => cell.header, cell => cell.value, StringComparer.OrdinalIgnoreCase);
            if (!row.ContainsKey(NormalizeHeader("подразделение")) && !string.IsNullOrWhiteSpace(currentDepartment))
            {
                row[NormalizeHeader("подразделение")] = currentDepartment;
            }

            if (!row.ContainsKey(NormalizeHeader("группа")) && !string.IsNullOrWhiteSpace(employeeGroup))
            {
                row[NormalizeHeader("группа")] = employeeGroup;
            }

            if (!string.IsNullOrWhiteSpace(ReadField(row, "фио", "сотрудник", "full_name", "name")))
            {
                rows.Add(row);
            }
        }

        return rows;
    }

    private static List<string> ReadSharedStrings(ZipArchive archive)
    {
        var entry = archive.GetEntry("xl/sharedStrings.xml");
        if (entry is null)
        {
            return [];
        }

        using var stream = entry.Open();
        var document = XDocument.Load(stream);
        XNamespace ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        return document.Descendants(ns + "si")
            .Select(item => string.Concat(item.Descendants(ns + "t").Select(text => text.Value)))
            .ToList();
    }

    private static List<string> ReadXlsxRow(XElement rowElement, XNamespace ns, IReadOnlyList<string> sharedStrings)
    {
        var cells = new SortedDictionary<int, string>();
        foreach (var cell in rowElement.Elements(ns + "c"))
        {
            var reference = cell.Attribute("r")?.Value ?? string.Empty;
            var index = ColumnIndex(reference);
            var raw = cell.Element(ns + "v")?.Value ?? cell.Element(ns + "is")?.Element(ns + "t")?.Value ?? string.Empty;
            var value = raw;
            if (cell.Attribute("t")?.Value == "s" && int.TryParse(raw, out var sharedIndex) && sharedIndex >= 0 && sharedIndex < sharedStrings.Count)
            {
                value = sharedStrings[sharedIndex];
            }

            cells[index] = value;
        }

        return cells.Count == 0
            ? []
            : Enumerable.Range(0, cells.Keys.Max() + 1).Select(index => cells.TryGetValue(index, out var value) ? value : string.Empty).ToList();
    }

    private static int ColumnIndex(string cellReference)
    {
        var index = 0;
        foreach (var character in cellReference.TakeWhile(char.IsLetter))
        {
            index = (index * 26) + (char.ToUpperInvariant(character) - 'A' + 1);
        }

        return Math.Max(0, index - 1);
    }

    private static string NormalizeHeader(string header) => header.Trim().ToLowerInvariant().Replace("ё", "е");

    private static string ReadOrganizationName(IReadOnlyList<string> cells)
    {
        for (var index = 0; index < cells.Count - 1; index += 1)
        {
            if (NormalizeHeader(cells[index]) == NormalizeHeader("организация"))
            {
                return cells.Skip(index + 1).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? string.Empty;
            }
        }

        return string.Empty;
    }

    private static string ReadDepartmentRow(IReadOnlyList<string> cells)
    {
        var nonEmpty = cells
            .Select((value, index) => new { index, value = value.Trim() })
            .Where(cell => cell.value.Length > 0)
            .ToList();

        if (nonEmpty.Count != 1 || nonEmpty[0].index != 0)
        {
            return string.Empty;
        }

        var value = nonEmpty[0].value;
        if (int.TryParse(value, out _) ||
            NormalizeHeader(value) is "штатные сотрудники" or "отбор:" or "организация" or "всего сотрудников" or "подразделение")
        {
            return string.Empty;
        }

        return value;
    }

    private static DateOnly? ParseDateOnly(string value)
    {
        var normalized = value.Trim();
        if (normalized.Length == 0)
        {
            return null;
        }

        if (DateOnly.TryParseExact(normalized, "dd.MM.yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var exactDate) ||
            DateOnly.TryParseExact(normalized, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out exactDate))
        {
            return exactDate;
        }

        if (double.TryParse(normalized, NumberStyles.Float, CultureInfo.InvariantCulture, out var serial))
        {
            return DateOnly.FromDateTime(new DateTime(1899, 12, 30).AddDays(serial));
        }

        return DateOnly.TryParse(normalized, CultureInfo.GetCultureInfo("ru-RU"), DateTimeStyles.None, out var parsedDate)
            ? parsedDate
            : null;
    }

    private static string NormalizeEmployeeGroup(string value)
    {
        var normalized = value.Trim();
        if (normalized.Contains("экология", StringComparison.OrdinalIgnoreCase))
        {
            return "Атом Экология";
        }

        if (normalized.Contains("атом", StringComparison.OrdinalIgnoreCase))
        {
            return "Атом";
        }

        return normalized;
    }

    private void UpsertEmployeeReference(string kind, string name, DateTimeOffset now)
    {
        var normalized = name.Trim();
        if (normalized.Length == 0)
        {
            return;
        }

        var local = dbContext.AccountingEmployeeReferences.Local.FirstOrDefault(reference =>
            reference.Kind == kind && reference.Name.Equals(normalized, StringComparison.OrdinalIgnoreCase));
        if (local is not null)
        {
            local.IsArchived = false;
            return;
        }

        var existing = dbContext.AccountingEmployeeReferences.FirstOrDefault(reference =>
            reference.Kind == kind && reference.Name.ToLower() == normalized.ToLower());
        if (existing is not null)
        {
            if (existing.IsArchived)
            {
                existing.IsArchived = false;
            }

            return;
        }

        dbContext.AccountingEmployeeReferences.Add(new AccountingEmployeeReferenceEntity
        {
            Id = Guid.NewGuid(),
            Kind = kind,
            Name = normalized,
            CreatedAt = now
        });
    }

    private static string ReadField(IReadOnlyDictionary<string, string> row, params string[] names)
    {
        foreach (var name in names.Select(NormalizeHeader))
        {
            if (row.TryGetValue(name, out var value))
            {
                return value.Trim();
            }
        }

        return string.Empty;
    }

    private static string StableToken(string value)
    {
        var bytes = Encoding.UTF8.GetBytes(value.Trim().ToLowerInvariant());
        var hash = System.Security.Cryptography.SHA256.HashData(bytes);
        return Convert.ToHexString(hash)[..8];
    }

    private static string NormalizeCustodyStatus(string? status)
    {
        var value = NormalizeStatus(status);
        return value is "in_use" or "returned" or "written_off" or "lost"
            ? value
            : value == "write_off"
                ? "written_off"
                : string.Empty;
    }

    private static InventoryCommandResult<T> Success<T>(T value) => new(value, EmptyErrors);

    private static InventoryCommandResult<T> Failure<T>(string key, string message) =>
        new(default, new Dictionary<string, string[]> { [key] = [message] });

    private static readonly IReadOnlyDictionary<string, string[]> EmptyErrors =
        new Dictionary<string, string[]>();

    private sealed record InventoryPaging(int Page, int PageSize);
}
