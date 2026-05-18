using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfPatrolStore(Patrol360DbContext dbContext) :
    IPatrolDashboardQuery,
    IRouteCatalogQuery,
    IEmployeeDirectoryQuery,
    IEmployeeDirectoryService,
    IMobileAccountService,
    IPatrolRequestService,
    IRouteCatalogService
{
    private static readonly PasswordHasher<MobileAccountEntity> MobilePasswordHasher = new();
    private static readonly string[] EditableMobileAccountStatuses = ["Активен", "Не привязан", "Заблокирован"];

    public DashboardSummaryDto GetSummary()
    {
        var activeStatuses = new[] { "В пути", "Ожидает", "Назначена" };
        var delayedStatuses = new[] { "Просрочена", "Задержка" };
        var totalPoints = dbContext.RoutePoints.Count();
        var completedPoints = dbContext.Assignments.Sum(assignment => assignment.ProgressPercent) * Math.Max(1, totalPoints) / 100;
        var onlineThreshold = DateTimeOffset.UtcNow.AddMinutes(-15);

        return new DashboardSummaryDto(
            ActivePatrols: dbContext.Assignments.Count(assignment => activeStatuses.Contains(assignment.Status)),
            DelayedPatrols: dbContext.Assignments.Count(assignment => delayedStatuses.Contains(assignment.Status)),
            Issues: 0,
            ShiftCoveragePercent: CalculateShiftCoveragePercent(),
            CompletedPoints: completedPoints,
            TotalPoints: totalPoints,
            OnlineEmployees: dbContext.Employees.Count(employee => employee.LastSeenAt >= onlineThreshold),
            TotalEmployees: dbContext.Employees.Count());
    }

    public IReadOnlyList<AssignmentDto> GetActiveAssignments() =>
        dbContext.Assignments
            .AsNoTracking()
            .Include(assignment => assignment.Employee)
            .Include(assignment => assignment.Route)
            .OrderByDescending(assignment => assignment.PlannedAt)
            .Take(50)
            .AsEnumerable()
            .Select(assignment => new AssignmentDto(
                assignment.Id,
                assignment.Employee!.FullName,
                assignment.Route!.Name,
                assignment.Shift,
                assignment.Status,
                assignment.ProgressPercent,
                assignment.PlannedAt.ToLocalTime().ToString("HH:mm")))
            .ToList();

    public IReadOnlyList<RouteDto> GetRoutes() =>
        dbContext.Routes
            .AsNoTracking()
            .Include(route => route.Points)
            .Where(route => !route.IsArchived)
            .OrderBy(route => route.Name)
            .AsEnumerable()
            .Select(route => MapRoute(route))
            .ToList();

    public RouteDto? GetRoute(Guid id)
    {
        var route = dbContext.Routes
            .AsNoTracking()
            .Include(item => item.Points)
            .FirstOrDefault(item => item.Id == id);

        return route is null ? null : MapRoute(route);
    }

    public CreateRouteResult CreateRoute(CreateRouteDto request)
    {
        var errors = ValidateRoute(request.Name);
        if (errors.Count > 0)
        {
            return new CreateRouteResult(null, errors);
        }

        var route = new RouteEntity
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            Description = NormalizeOptionalText(request.Description),
            Territory = NormalizeOptionalText(request.Territory, "Промзона Север"),
            Status = NormalizeOptionalText(request.Status, "Активен"),
            Duration = NormalizeOptionalText(request.Duration, "00:30"),
            Distance = NormalizeOptionalText(request.Distance, "0 км"),
            Periodicity = NormalizeOptionalText(request.Periodicity, "По заявке"),
            VersionNo = 1,
            IsArchived = IsArchivedStatus(request.Status),
            CreatedAt = DateTimeOffset.UtcNow
        };

        dbContext.Routes.Add(route);
        dbContext.SaveChanges();

        return new CreateRouteResult(MapRoute(route), new Dictionary<string, string[]>());
    }

    public UpdateRouteResult UpdateRoute(Guid id, UpdateRouteDto request)
    {
        var route = dbContext.Routes.Include(item => item.Points).FirstOrDefault(item => item.Id == id);
        if (route is null)
        {
            return new UpdateRouteResult(null, new Dictionary<string, string[]> { ["route"] = ["Маршрут не найден."] });
        }

        var errors = ValidateRoute(request.Name);
        if (errors.Count > 0)
        {
            return new UpdateRouteResult(null, errors);
        }

        route.Name = request.Name.Trim();
        route.Description = NormalizeOptionalText(request.Description);
        route.Territory = NormalizeOptionalText(request.Territory, "Промзона Север");
        route.Status = NormalizeOptionalText(request.Status, "Активен");
        route.Duration = NormalizeOptionalText(request.Duration, "00:30");
        route.Distance = NormalizeOptionalText(request.Distance, "0 км");
        route.Periodicity = NormalizeOptionalText(request.Periodicity, "По заявке");
        route.IsArchived = IsArchivedStatus(request.Status);
        route.VersionNo += 1;

        dbContext.SaveChanges();

        return new UpdateRouteResult(MapRoute(route), new Dictionary<string, string[]>());
    }

    public bool DeleteRoute(Guid id)
    {
        var route = dbContext.Routes.FirstOrDefault(item => item.Id == id);
        if (route is null)
        {
            return false;
        }

        route.Status = "Архив";
        route.IsArchived = true;
        route.VersionNo += 1;
        dbContext.SaveChanges();

        return true;
    }

    public CreateRoutePointResult CreateRoutePoint(Guid routeId, CreateRoutePointDto request)
    {
        var route = dbContext.Routes.Include(item => item.Points).FirstOrDefault(item => item.Id == routeId);
        if (route is null)
        {
            return new CreateRoutePointResult(null, null, new Dictionary<string, string[]> { ["route"] = ["Маршрут не найден."] });
        }

        var errors = ValidateRoutePoint(request.Name);
        if (errors.Count > 0)
        {
            return new CreateRoutePointResult(null, null, errors);
        }

        var point = new RoutePointEntity
        {
            Id = Guid.NewGuid(),
            RouteId = routeId,
            SequenceNo = route.Points.Count + 1,
            Name = request.Name.Trim(),
            Zone = NormalizeOptionalText(request.Zone, route.Territory),
            Type = NormalizeOptionalText(request.Type, "NFC"),
            Tag = NormalizeOptionalText(request.Tag),
            Interval = NormalizeOptionalText(request.Interval, "00:10"),
            ExpectedTime = NormalizeOptionalText(request.ExpectedTime, "00:05"),
            Status = NormalizeOptionalText(request.Status, "Активна"),
            NfcCode = NormalizeOptionalText(request.Tag),
            IsRequired = IsActivePointStatus(request.Status),
            RequiresPhoto = request.RequiresPhoto
        };

        dbContext.RoutePoints.Add(point);
        route.VersionNo += 1;
        dbContext.SaveChanges();

        return new CreateRoutePointResult(MapRoute(route), MapRoutePoint(point), new Dictionary<string, string[]>());
    }

    public UpdateRoutePointResult UpdateRoutePoint(Guid routeId, Guid pointId, UpdateRoutePointDto request)
    {
        var route = dbContext.Routes.Include(item => item.Points).FirstOrDefault(item => item.Id == routeId);
        var point = route?.Points.FirstOrDefault(item => item.Id == pointId);
        if (route is null || point is null)
        {
            return new UpdateRoutePointResult(null, null, new Dictionary<string, string[]> { ["point"] = ["Точка маршрута не найдена."] });
        }

        var errors = ValidateRoutePoint(request.Name);
        if (errors.Count > 0)
        {
            return new UpdateRoutePointResult(null, null, errors);
        }

        point.Name = request.Name.Trim();
        point.Zone = NormalizeOptionalText(request.Zone, route.Territory);
        point.Type = NormalizeOptionalText(request.Type, "NFC");
        point.Tag = NormalizeOptionalText(request.Tag);
        point.Interval = NormalizeOptionalText(request.Interval, "00:10");
        point.ExpectedTime = NormalizeOptionalText(request.ExpectedTime, "00:05");
        point.Status = NormalizeOptionalText(request.Status, "Активна");
        point.NfcCode = NormalizeOptionalText(request.Tag);
        point.IsRequired = IsActivePointStatus(request.Status);
        point.RequiresPhoto = request.RequiresPhoto;
        route.VersionNo += 1;

        dbContext.SaveChanges();

        return new UpdateRoutePointResult(MapRoute(route), MapRoutePoint(point), new Dictionary<string, string[]>());
    }

    public bool DeleteRoutePoint(Guid routeId, Guid pointId)
    {
        var route = dbContext.Routes.Include(item => item.Points).FirstOrDefault(item => item.Id == routeId);
        var point = route?.Points.FirstOrDefault(item => item.Id == pointId);
        if (route is null || point is null)
        {
            return false;
        }

        dbContext.RoutePoints.Remove(point);
        route.Points.Remove(point);
        route.VersionNo += 1;
        ReorderPoints(route.Points.OrderBy(item => item.SequenceNo));
        dbContext.SaveChanges();

        return true;
    }

    public UpdateRoutePointResult ReorderRoutePoint(Guid routeId, Guid pointId, ReorderRoutePointDto request)
    {
        var route = dbContext.Routes.Include(item => item.Points).FirstOrDefault(item => item.Id == routeId);
        var point = route?.Points.FirstOrDefault(item => item.Id == pointId);
        if (route is null || point is null)
        {
            return new UpdateRoutePointResult(null, null, new Dictionary<string, string[]> { ["point"] = ["Точка маршрута не найдена."] });
        }

        var ordered = route.Points.OrderBy(item => item.SequenceNo).ToList();
        ordered.Remove(point);
        var nextIndex = Math.Clamp(request.SequenceNo, 1, ordered.Count + 1) - 1;
        ordered.Insert(nextIndex, point);

        ReorderPoints(ordered);
        route.VersionNo += 1;
        dbContext.SaveChanges();

        return new UpdateRoutePointResult(MapRoute(route), MapRoutePoint(point), new Dictionary<string, string[]>());
    }

    public IReadOnlyList<EmployeeDto> GetEmployees() =>
        dbContext.Employees
            .AsNoTracking()
            .OrderBy(employee => employee.FullName)
            .AsEnumerable()
            .Select(employee => MapEmployee(employee))
            .ToList();

    public EmployeeDto? GetEmployee(Guid id)
    {
        var employee = dbContext.Employees.AsNoTracking().FirstOrDefault(item => item.Id == id);
        return employee is null ? null : MapEmployee(employee);
    }

    public CreateEmployeeResult CreateEmployee(CreateEmployeeDto request)
    {
        var errors = ValidateEmployee(request.FullName, request.PersonnelNo);
        AddPersonnelNoUniquenessError(errors, request.PersonnelNo);
        if (errors.Count > 0)
        {
            return new CreateEmployeeResult(null, errors);
        }

        var employee = new EmployeeEntity
        {
            Id = Guid.NewGuid(),
            FullName = request.FullName.Trim(),
            PersonnelNo = request.PersonnelNo.Trim(),
            Position = NormalizeOptionalText(request.Position, "Маршрутный обходчик"),
            Department = NormalizeOptionalText(request.Department, "Территория"),
            Status = NormalizeOptionalText(request.Status, "Активен"),
            Shift = NormalizeOptionalText(request.Shift, "День"),
            HasMobileAccount = request.HasMobileAccount,
            LastSeenAt = DateTimeOffset.UtcNow
        };

        dbContext.Employees.Add(employee);
        dbContext.SaveChanges();

        return new CreateEmployeeResult(MapEmployee(employee), new Dictionary<string, string[]>());
    }

    public UpdateEmployeeResult UpdateEmployee(Guid id, UpdateEmployeeDto request)
    {
        var employee = dbContext.Employees.FirstOrDefault(item => item.Id == id);
        if (employee is null)
        {
            return new UpdateEmployeeResult(null, new Dictionary<string, string[]> { ["employee"] = ["Сотрудник не найден."] });
        }

        var errors = ValidateEmployee(request.FullName, request.PersonnelNo);
        AddPersonnelNoUniquenessError(errors, request.PersonnelNo, id);
        if (errors.Count > 0)
        {
            return new UpdateEmployeeResult(null, errors);
        }

        employee.FullName = request.FullName.Trim();
        employee.PersonnelNo = request.PersonnelNo.Trim();
        employee.Position = NormalizeOptionalText(request.Position, "Маршрутный обходчик");
        employee.Department = NormalizeOptionalText(request.Department, "Территория");
        employee.Status = NormalizeOptionalText(request.Status, "Активен");
        employee.Shift = NormalizeOptionalText(request.Shift, "День");
        employee.HasMobileAccount = request.HasMobileAccount;
        employee.LastSeenAt = DateTimeOffset.UtcNow;

        dbContext.SaveChanges();

        return new UpdateEmployeeResult(MapEmployee(employee), new Dictionary<string, string[]>());
    }

    public bool DeleteEmployee(Guid id)
    {
        var employee = dbContext.Employees.FirstOrDefault(item => item.Id == id);
        if (employee is null)
        {
            return false;
        }

        employee.Status = "Офлайн";
        employee.HasMobileAccount = false;
        employee.LastSeenAt = DateTimeOffset.UtcNow;
        dbContext.SaveChanges();

        return true;
    }

    public IReadOnlyList<MobileAccountDto> GetAccounts() =>
        dbContext.MobileAccounts
            .AsNoTracking()
            .Include(account => account.EmployeeBindings)
            .OrderBy(account => account.Login)
            .AsEnumerable()
            .Select(account => MapMobileAccount(account))
            .ToList();

    public MobileAccountDto? GetAccount(Guid id)
    {
        var account = dbContext.MobileAccounts
            .AsNoTracking()
            .Include(item => item.EmployeeBindings)
            .FirstOrDefault(item => item.Id == id);
        return account is null ? null : MapMobileAccount(account);
    }

    public CreateMobileAccountResult CreateAccount(CreateMobileAccountDto request)
    {
        var errors = ValidateMobileAccount(request);
        var employeeScope = NormalizeEmployeeScope(request.EmployeeScope);
        var boundEmployees = employeeScope == "all" ? [] : NormalizeEmployeeNames(request.Employee);
        var login = MakeMobileLogin(request.Login, request.Employee, dbContext.MobileAccounts.Select(account => account.Login));

        if (errors.Count == 0 && dbContext.MobileAccounts.Any(account => account.Login == login))
        {
            errors["login"] = ["Мобильный аккаунт с таким логином уже есть."];
        }

        if (errors.Count > 0)
        {
            return new CreateMobileAccountResult(null, null, errors);
        }

        var shouldBind = employeeScope == "all" || (request.BindEmployee && boundEmployees.Length > 0);
        var temporaryPassword = request.TemporaryPassword ? CreateTemporaryPassword() : null;
        var now = DateTimeOffset.UtcNow;
        var accountEntity = new MobileAccountEntity
        {
            Id = Guid.NewGuid(),
            Login = login,
            EmployeeScope = employeeScope,
            BoundEmployees = shouldBind ? boundEmployees : [],
            Role = NormalizeOptionalText(request.Role, "Маршрутный обходчик"),
            Status = shouldBind ? "Активен" : "Не привязан",
            Session = "-",
            LastSeenAt = null,
            Device = request.RestrictToBoundDevice ? "Ожидает привязки" : "Любое устройство",
            Version = "-",
            CreatedAt = now,
            PasswordHash = string.Empty,
            PasswordResetRequired = true,
            LastPasswordResetAt = temporaryPassword is null ? null : now
        };
        accountEntity.PasswordHash = MobilePasswordHasher.HashPassword(accountEntity, temporaryPassword ?? CreateTemporaryPassword());
        AddInitialMobileAccountBindings(accountEntity);

        dbContext.MobileAccounts.Add(accountEntity);
        AddMobileAccountAuditEvent(
            accountEntity.Id,
            temporaryPassword is null ? "mobile_account.created_without_password" : "mobile_account.created_with_temporary_password",
            temporaryPassword is null ? "Account created; password must be set before first login." : "Temporary password generated and returned once.");
        SyncEmployeeMobileFlags(accountEntity);
        dbContext.SaveChanges();

        return new CreateMobileAccountResult(MapMobileAccount(accountEntity), temporaryPassword, new Dictionary<string, string[]>());
    }

    public UpdateMobileAccountResult UpdateAccount(Guid id, UpdateMobileAccountDto request)
    {
        var account = dbContext.MobileAccounts
            .Include(item => item.EmployeeBindings)
            .FirstOrDefault(item => item.Id == id);
        if (account is null)
        {
            return MissingMobileAccountResult();
        }

        var errors = ValidateUpdateMobileAccount(id, request);
        if (errors.Count > 0)
        {
            return new UpdateMobileAccountResult(null, errors);
        }

        var nextStatus = NormalizeOptionalText(request.Status);
        account.Login = NormalizeLogin(request.Login);
        account.Role = NormalizeOptionalText(request.Role);
        account.Status = nextStatus;

        if (nextStatus == "Не привязан")
        {
            DetachAllBindings(account);
        }

        AddMobileAccountAuditEvent(account.Id, "mobile_account.updated", "Login, role or status updated.");
        SyncMobileAccountDerivedState(account);
        SaveChangesAndRebuildEmployeeMobileFlags();

        return new UpdateMobileAccountResult(MapMobileAccount(account), new Dictionary<string, string[]>());
    }

    public UpdateMobileAccountResult AttachEmployee(Guid id, AttachMobileAccountEmployeeDto request)
    {
        var account = dbContext.MobileAccounts
            .Include(item => item.EmployeeBindings)
            .FirstOrDefault(item => item.Id == id);
        if (account is null)
        {
            return MissingMobileAccountResult();
        }

        var employee = ResolveMobileBindingEmployee(request);
        if (employee is null)
        {
            return new UpdateMobileAccountResult(null, new Dictionary<string, string[]>
            {
                ["employeeId"] = ["Выберите сотрудника из справочника."],
            });
        }

        var activeBindings = GetActiveBindings(account).ToList();
        var displayNames = GetDisplayBoundEmployeeNames(account);
        var isAlreadyBound = activeBindings.Any(binding => binding.EmployeeId == employee.Id)
            || displayNames.Contains(employee.FullName, StringComparer.OrdinalIgnoreCase);
        if (displayNames.Length >= 5 && !isAlreadyBound)
        {
            return new UpdateMobileAccountResult(null, new Dictionary<string, string[]>
            {
                ["employeeId"] = ["К одному мобильному аккаунту можно привязать до 5 сотрудников."],
            });
        }

        account.EmployeeScope = "selected";
        var existingBinding = account.EmployeeBindings.FirstOrDefault(binding => binding.EmployeeId == employee.Id);
        if (existingBinding is null)
        {
            var binding = new MobileAccountEmployeeBindingEntity
            {
                Id = Guid.NewGuid(),
                MobileAccountId = account.Id,
                EmployeeId = employee.Id,
                DisplayName = employee.FullName,
                CreatedAt = DateTimeOffset.UtcNow
            };
            account.EmployeeBindings.Add(binding);
            dbContext.Entry(binding).State = EntityState.Added;
        }
        else
        {
            existingBinding.DisplayName = employee.FullName;
            existingBinding.DetachedAt = null;
        }

        if (account.Status != "Заблокирован")
        {
            account.Status = "Активен";
        }

        AddMobileAccountAuditEvent(account.Id, "mobile_account.employee_attached", $"Employee {employee.Id} attached.");
        SyncMobileAccountDerivedState(account);
        SaveChangesAndRebuildEmployeeMobileFlags();

        return new UpdateMobileAccountResult(MapMobileAccount(account), new Dictionary<string, string[]>());
    }

    public UpdateMobileAccountResult DetachEmployee(Guid id, Guid employeeId)
    {
        var account = dbContext.MobileAccounts
            .Include(item => item.EmployeeBindings)
            .FirstOrDefault(item => item.Id == id);
        if (account is null)
        {
            return MissingMobileAccountResult();
        }

        var binding = GetActiveBindings(account).FirstOrDefault(item => item.EmployeeId == employeeId);
        if (binding is null)
        {
            var employee = dbContext.Employees.FirstOrDefault(item => item.Id == employeeId);
            if (employee is null || !account.BoundEmployees.Contains(employee.FullName, StringComparer.OrdinalIgnoreCase))
            {
                return new UpdateMobileAccountResult(null, new Dictionary<string, string[]>
                {
                    ["employeeId"] = ["Сотрудник не привязан к этому аккаунту."],
                });
            }

            account.BoundEmployees = account.BoundEmployees
                .Where(name => !string.Equals(name, employee.FullName, StringComparison.OrdinalIgnoreCase))
                .ToArray();
        }
        else
        {
            binding.DetachedAt = DateTimeOffset.UtcNow;
        }

        AddMobileAccountAuditEvent(account.Id, "mobile_account.employee_detached", $"Employee {employeeId} detached.");
        SyncMobileAccountDerivedState(account);
        if (account.Status == "Активен" && GetActiveBindings(account).Count == 0)
        {
            account.Status = "Не привязан";
        }

        SaveChangesAndRebuildEmployeeMobileFlags();

        return new UpdateMobileAccountResult(MapMobileAccount(account), new Dictionary<string, string[]>());
    }

    public UpdateMobileAccountResult BlockAccount(Guid id)
    {
        var account = dbContext.MobileAccounts
            .Include(item => item.EmployeeBindings)
            .FirstOrDefault(item => item.Id == id);
        if (account is null)
        {
            return MissingMobileAccountResult();
        }

        account.Status = "Заблокирован";
        account.Session = "-";
        AddMobileAccountAuditEvent(account.Id, "mobile_account.blocked", "Mobile account blocked.");
        dbContext.SaveChanges();

        return new UpdateMobileAccountResult(MapMobileAccount(account), new Dictionary<string, string[]>());
    }

    public UpdateMobileAccountResult UnblockAccount(Guid id)
    {
        var account = dbContext.MobileAccounts
            .Include(item => item.EmployeeBindings)
            .FirstOrDefault(item => item.Id == id);
        if (account is null)
        {
            return MissingMobileAccountResult();
        }

        account.Status = account.EmployeeScope == "all" || GetDisplayBoundEmployeeNames(account).Length > 0 ? "Активен" : "Не привязан";
        AddMobileAccountAuditEvent(account.Id, "mobile_account.unblocked", "Mobile account unblocked.");
        dbContext.SaveChanges();

        return new UpdateMobileAccountResult(MapMobileAccount(account), new Dictionary<string, string[]>());
    }

    public ResetMobileAccountPasswordDto? ResetPassword(Guid id)
    {
        var account = dbContext.MobileAccounts.FirstOrDefault(item => item.Id == id);
        if (account is null)
        {
            return null;
        }

        var password = CreateTemporaryPassword();
        account.PasswordHash = MobilePasswordHasher.HashPassword(account, password);
        account.PasswordResetRequired = true;
        account.LastPasswordResetAt = DateTimeOffset.UtcNow;
        AddMobileAccountAuditEvent(account.Id, "mobile_account.password_reset", "Temporary password generated and returned once.");
        dbContext.SaveChanges();

        return new ResetMobileAccountPasswordDto(password, account.LastPasswordResetAt.Value);
    }

    public bool DeleteAccount(Guid id)
    {
        var account = dbContext.MobileAccounts.FirstOrDefault(item => item.Id == id);
        if (account is null)
        {
            return false;
        }

        AddMobileAccountAuditEvent(account.Id, "mobile_account.deleted", "Mobile account deleted.");
        dbContext.MobileAccounts.Remove(account);
        dbContext.SaveChanges();

        RebuildEmployeeMobileFlags();
        dbContext.SaveChanges();

        return true;
    }

    public IReadOnlyList<MobileAccountSessionDto> GetSessions(Guid id)
    {
        if (!dbContext.MobileAccounts.Any(account => account.Id == id))
        {
            return [];
        }

        return dbContext.MobileAccountSessions
            .AsNoTracking()
            .Where(session => session.MobileAccountId == id)
            .OrderByDescending(session => session.LastSeenAt)
            .Select(session => new MobileAccountSessionDto(
                session.Id,
                session.MobileAccountId,
                session.Status,
                session.Device,
                session.Platform,
                session.AppVersion,
                session.IpAddress,
                session.LastSeenAt))
            .ToList();
    }

    public IReadOnlyList<MobileAccountSecurityEventDto> GetSecurityEvents(Guid id)
    {
        if (!dbContext.MobileAccounts.Any(account => account.Id == id))
        {
            return [];
        }

        return dbContext.MobileAccountAuditEvents
            .AsNoTracking()
            .Where(auditEvent => auditEvent.MobileAccountId == id)
            .OrderByDescending(auditEvent => auditEvent.CreatedAt)
            .Select(auditEvent => new MobileAccountSecurityEventDto(
                auditEvent.Id,
                auditEvent.MobileAccountId,
                auditEvent.Action,
                auditEvent.Details,
                auditEvent.CreatedAt,
                auditEvent.Actor))
            .ToList();
    }

    public IReadOnlyList<PatrolRequestDto> GetRequests() =>
        dbContext.PatrolRequests
            .AsNoTracking()
            .OrderByDescending(request => request.CreatedAt)
            .AsEnumerable()
            .Select(request => MapPatrolRequest(request))
            .ToList();

    public CreatePatrolRequestResult Create(CreatePatrolRequestDto request)
    {
        var employee = ResolveEmployee(request);
        var route = ResolveRoute(request);
        var errors = ValidateCreateRequest(request, employee, route);

        if (errors.Count > 0)
        {
            return new CreatePatrolRequestResult(null, errors);
        }

        var now = DateTimeOffset.UtcNow;
        var requestEntity = new PatrolRequestEntity
        {
            Id = Guid.NewGuid(),
            Number = GenerateRequestNumber(request.ScheduledDate),
            EmployeeId = employee!.Id,
            EmployeeName = employee.FullName,
            RouteId = route!.Id,
            RouteName = route.Name,
            ScheduledDate = request.ScheduledDate,
            ScheduledTime = request.ScheduledTime,
            NotifyEmployee = request.NotifyEmployee,
            NotificationText = NormalizeOptionalText(request.NotificationText),
            Status = request.NotifyEmployee ? "Отправлена" : "Новая",
            CreatedAt = now,
            Description = NormalizeOptionalText(request.Description)
        };

        dbContext.PatrolRequests.Add(requestEntity);

        dbContext.Assignments.Add(new AssignmentEntity
        {
            Id = Guid.NewGuid(),
            PatrolRequestId = requestEntity.Id,
            EmployeeId = employee.Id,
            RouteId = route.Id,
            Shift = employee.Shift,
            Status = request.NotifyEmployee ? "Ожидает" : "Назначена",
            PlannedAt = CombinePlannedAt(request.ScheduledDate, request.ScheduledTime),
            ProgressPercent = 0,
            LockVersion = 0
        });

        dbContext.SaveChanges();

        return new CreatePatrolRequestResult(MapPatrolRequest(requestEntity), new Dictionary<string, string[]>());
    }

    private int CalculateShiftCoveragePercent()
    {
        var employeesOnShift = dbContext.Employees.Count(employee => employee.Status == "На смене" || employee.Status == "Активен");
        var totalEmployees = dbContext.Employees.Count();

        if (totalEmployees == 0)
        {
            return 0;
        }

        return (int)Math.Round(employeesOnShift / (double)totalEmployees * 100);
    }

    private EmployeeEntity? ResolveEmployee(CreatePatrolRequestDto request)
    {
        if (request.EmployeeId is not null)
        {
            return dbContext.Employees.FirstOrDefault(employee => employee.Id == request.EmployeeId.Value);
        }

        var employeeName = NormalizeOptionalText(request.EmployeeName);
        return string.IsNullOrWhiteSpace(employeeName)
            ? null
            : dbContext.Employees.FirstOrDefault(employee => employee.FullName == employeeName);
    }

    private RouteEntity? ResolveRoute(CreatePatrolRequestDto request)
    {
        if (request.RouteId is not null)
        {
            return dbContext.Routes.FirstOrDefault(route => route.Id == request.RouteId.Value && !route.IsArchived);
        }

        var routeName = NormalizeOptionalText(request.RouteName);
        return string.IsNullOrWhiteSpace(routeName)
            ? null
            : dbContext.Routes.FirstOrDefault(route => route.Name == routeName && !route.IsArchived);
    }

    private Dictionary<string, string[]> ValidateCreateRequest(
        CreatePatrolRequestDto request,
        EmployeeEntity? employee,
        RouteEntity? route)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.EmployeeId is null && string.IsNullOrWhiteSpace(request.EmployeeName))
        {
            errors["employee"] = ["Выберите сотрудника для обхода."];
        }
        else if (employee is null)
        {
            errors["employee"] = ["Сотрудник не найден."];
        }

        if (request.RouteId is null && string.IsNullOrWhiteSpace(request.RouteName))
        {
            errors["route"] = ["Выберите маршрут обхода."];
        }
        else if (route is null)
        {
            errors["route"] = ["Маршрут не найден."];
        }

        if (request.ScheduledDate == default)
        {
            errors["scheduledDate"] = ["Укажите дату обхода."];
        }

        return errors;
    }

    private static Dictionary<string, string[]> ValidateRoute(string? name)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(name))
        {
            errors["name"] = ["Укажите название маршрута."];
        }

        return errors;
    }

    private static Dictionary<string, string[]> ValidateRoutePoint(string? name)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(name))
        {
            errors["name"] = ["Укажите название точки маршрута."];
        }

        return errors;
    }

    private static Dictionary<string, string[]> ValidateEmployee(string? fullName, string? personnelNo)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(fullName))
        {
            errors["fullName"] = ["Укажите ФИО сотрудника."];
        }

        if (string.IsNullOrWhiteSpace(personnelNo))
        {
            errors["personnelNo"] = ["Укажите табельный номер сотрудника."];
        }

        return errors;
    }

    private void AddPersonnelNoUniquenessError(Dictionary<string, string[]> errors, string? personnelNo, Guid? employeeId = null)
    {
        if (string.IsNullOrWhiteSpace(personnelNo))
        {
            return;
        }

        var normalized = personnelNo.Trim();
        var exists = dbContext.Employees.Any(employee =>
            employee.PersonnelNo == normalized && (employeeId == null || employee.Id != employeeId.Value));
        if (exists)
        {
            errors["personnelNo"] = ["Сотрудник с таким табельным номером уже есть."];
        }
    }

    private static Dictionary<string, string[]> ValidateMobileAccount(CreateMobileAccountDto request)
    {
        var errors = new Dictionary<string, string[]>();
        var scope = NormalizeEmployeeScope(request.EmployeeScope);
        if (scope != "all" && request.BindEmployee && NormalizeEmployeeNames(request.Employee).Length == 0)
        {
            errors["employee"] = ["Укажите сотрудника для привязки или выберите доступ ко всем сотрудникам."];
        }

        return errors;
    }

    private Dictionary<string, string[]> ValidateUpdateMobileAccount(Guid accountId, UpdateMobileAccountDto request)
    {
        var errors = new Dictionary<string, string[]>();
        var login = NormalizeLogin(request.Login);
        var role = NormalizeOptionalText(request.Role);
        var status = NormalizeOptionalText(request.Status);

        if (string.IsNullOrWhiteSpace(login))
        {
            errors["login"] = ["Укажите логин мобильного аккаунта."];
        }
        else if (login.Length > 120)
        {
            errors["login"] = ["Логин мобильного аккаунта не должен быть длиннее 120 символов."];
        }
        else if (dbContext.MobileAccounts.Any(account => account.Id != accountId && account.Login == login))
        {
            errors["login"] = ["Мобильный аккаунт с таким логином уже есть."];
        }

        if (string.IsNullOrWhiteSpace(role))
        {
            errors["role"] = ["Укажите роль мобильного аккаунта."];
        }

        if (string.IsNullOrWhiteSpace(status) || !EditableMobileAccountStatuses.Contains(status))
        {
            errors["status"] = ["Выберите допустимый статус аккаунта."];
        }

        return errors;
    }

    private EmployeeEntity? ResolveMobileBindingEmployee(AttachMobileAccountEmployeeDto request)
    {
        if (request.EmployeeId is not null)
        {
            return dbContext.Employees.FirstOrDefault(employee => employee.Id == request.EmployeeId.Value);
        }

        var employeeName = NormalizeOptionalText(request.EmployeeName);
        return string.IsNullOrWhiteSpace(employeeName)
            ? null
            : dbContext.Employees.FirstOrDefault(employee => employee.FullName == employeeName);
    }

    private static IReadOnlyList<MobileAccountEmployeeBindingEntity> GetActiveBindings(MobileAccountEntity account) =>
        account.EmployeeBindings
            .Where(binding => binding.DetachedAt is null)
            .OrderBy(binding => binding.CreatedAt)
            .ToList();

    private static string[] GetDisplayBoundEmployeeNames(MobileAccountEntity account)
    {
        var activeBindingNames = GetActiveBindings(account)
            .Select(binding => binding.DisplayName)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return activeBindingNames.Length > 0 ? activeBindingNames : account.BoundEmployees;
    }

    private void AddInitialMobileAccountBindings(MobileAccountEntity account)
    {
        if (account.BoundEmployees.Length == 0)
        {
            return;
        }

        foreach (var employeeName in account.BoundEmployees)
        {
            var employee = dbContext.Employees.FirstOrDefault(item => item.FullName == employeeName);
            if (employee is null || account.EmployeeBindings.Any(binding => binding.EmployeeId == employee.Id))
            {
                continue;
            }

            account.EmployeeBindings.Add(new MobileAccountEmployeeBindingEntity
            {
                Id = Guid.NewGuid(),
                MobileAccountId = account.Id,
                EmployeeId = employee.Id,
                DisplayName = employee.FullName,
                CreatedAt = account.CreatedAt
            });
        }
    }

    private static void SyncMobileAccountDerivedState(MobileAccountEntity account)
    {
        account.BoundEmployees = GetDisplayBoundEmployeeNames(account);
        if (account.EmployeeScope != "all" && account.Status == "Активен" && account.BoundEmployees.Length == 0)
        {
            account.Status = "Не привязан";
        }
    }

    private static void DetachAllBindings(MobileAccountEntity account)
    {
        var detachedAt = DateTimeOffset.UtcNow;
        foreach (var binding in account.EmployeeBindings.Where(binding => binding.DetachedAt is null))
        {
            binding.DetachedAt = detachedAt;
        }
    }

    private static UpdateMobileAccountResult MissingMobileAccountResult() =>
        new(null, new Dictionary<string, string[]>
        {
            ["account"] = ["Мобильный аккаунт не найден."],
        });

    private static string NormalizeEmployeeScope(string? scope) =>
        string.Equals(scope, "all", StringComparison.OrdinalIgnoreCase) ? "all" : "selected";

    private static string[] NormalizeEmployeeNames(string? employee)
    {
        return NormalizeOptionalText(employee)
            .Split([',', ';', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string MakeMobileLogin(string? requestedLogin, string? employee, IEnumerable<string> existingLogins)
    {
        var baseLogin = NormalizeLogin(requestedLogin);
        if (string.IsNullOrWhiteSpace(baseLogin))
        {
            baseLogin = NormalizeLogin(employee);
        }

        if (string.IsNullOrWhiteSpace(baseLogin))
        {
            baseLogin = "mobile";
        }

        var used = existingLogins.ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!used.Contains(baseLogin))
        {
            return baseLogin;
        }

        var index = 2;
        var candidate = $"{baseLogin}{index}";
        while (used.Contains(candidate))
        {
            index += 1;
            candidate = $"{baseLogin}{index}";
        }

        return candidate;
    }

    private static string NormalizeLogin(string? value)
    {
        var chars = NormalizeOptionalText(value)
            .ToLowerInvariant()
            .Replace(' ', '.')
            .Where(character => char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or '-')
            .ToArray();

        return new string(chars);
    }

    private void SyncEmployeeMobileFlags(MobileAccountEntity account)
    {
        if (account.EmployeeScope == "all")
        {
            foreach (var employee in dbContext.Employees.ToList())
            {
                employee.HasMobileAccount = true;
            }

            return;
        }

        var activeBindingEmployeeIds = GetActiveBindings(account)
            .Select(binding => binding.EmployeeId)
            .ToArray();
        if (activeBindingEmployeeIds.Length > 0)
        {
            foreach (var employee in dbContext.Employees.Where(employee => activeBindingEmployeeIds.Contains(employee.Id)).ToList())
            {
                employee.HasMobileAccount = true;
            }

            return;
        }

        foreach (var employee in dbContext.Employees.Where(employee => account.BoundEmployees.Contains(employee.FullName)).ToList())
        {
            employee.HasMobileAccount = true;
        }
    }

    private void RebuildEmployeeMobileFlags()
    {
        foreach (var employee in dbContext.Employees.ToList())
        {
            employee.HasMobileAccount = false;
        }

        foreach (var account in dbContext.MobileAccounts.Include(account => account.EmployeeBindings).ToList())
        {
            SyncEmployeeMobileFlags(account);
        }
    }

    private void SaveChangesAndRebuildEmployeeMobileFlags()
    {
        dbContext.SaveChanges();
        RebuildEmployeeMobileFlags();
        dbContext.SaveChanges();
    }

    private void AddMobileAccountAuditEvent(Guid accountId, string action, string details)
    {
        dbContext.MobileAccountAuditEvents.Add(new MobileAccountAuditEventEntity
        {
            Id = Guid.NewGuid(),
            MobileAccountId = accountId,
            Action = action,
            Details = details,
            Actor = "system",
            CreatedAt = DateTimeOffset.UtcNow
        });
    }

    private static string CreateTemporaryPassword()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
        Span<byte> bytes = stackalloc byte[10];
        Random.Shared.NextBytes(bytes);

        return string.Create(bytes.Length, bytes.ToArray(), (chars, source) =>
        {
            for (var index = 0; index < source.Length; index += 1)
            {
                chars[index] = alphabet[source[index] % alphabet.Length];
            }
        });
    }

    private string GenerateRequestNumber(DateOnly scheduledDate)
    {
        var todayCount = dbContext.PatrolRequests.Count(request => request.ScheduledDate == scheduledDate);

        return $"REQ-{scheduledDate:yyyyMMdd}-{todayCount + 1:0000}";
    }

    private static DateTimeOffset CombinePlannedAt(DateOnly date, TimeOnly? time)
    {
        var dateTime = date.ToDateTime(time ?? TimeOnly.MinValue);
        return new DateTimeOffset(dateTime, TimeZoneInfo.Local.GetUtcOffset(dateTime)).ToUniversalTime();
    }

    private static RouteDto MapRoute(RouteEntity route) =>
        new(
            route.Id,
            route.Name,
            route.Description,
            NormalizeOptionalText(route.Territory, "Промзона Север"),
            NormalizeOptionalText(route.Status, route.IsArchived ? "Архив" : "Активен"),
            NormalizeOptionalText(route.Duration, "00:30"),
            NormalizeOptionalText(route.Distance, "0 км"),
            NormalizeOptionalText(route.Periodicity, "По заявке"),
            route.VersionNo,
            route.Points
                .OrderBy(point => point.SequenceNo)
                .Select(point => MapRoutePoint(point))
                .ToList());

    private static RoutePointDto MapRoutePoint(RoutePointEntity point) =>
        new(
            point.Id,
            point.SequenceNo,
            point.Name,
            NormalizeOptionalText(point.Zone, "Контрольная зона"),
            NormalizeOptionalText(point.Type, point.NfcCode is null ? "Ручной контроль" : "NFC"),
            NormalizeOptionalText(point.Tag, point.NfcCode ?? string.Empty),
            NormalizeOptionalText(point.Interval, "00:10"),
            NormalizeOptionalText(point.ExpectedTime, "00:05"),
            NormalizeOptionalText(point.Status, point.IsRequired ? "Активна" : "Черновик"),
            point.NfcCode,
            point.IsRequired,
            point.RequiresPhoto);

    private static EmployeeDto MapEmployee(EmployeeEntity employee) =>
        new(
            employee.Id,
            employee.FullName,
            employee.PersonnelNo,
            employee.Position,
            employee.Department,
            employee.Status,
            employee.Shift,
            employee.HasMobileAccount,
            employee.LastSeenAt);

    private static PatrolRequestDto MapPatrolRequest(PatrolRequestEntity request) =>
        new(
            request.Id,
            request.Number,
            request.EmployeeId,
            request.EmployeeName,
            request.RouteId,
            request.RouteName,
            request.ScheduledDate,
            request.ScheduledTime,
            request.NotifyEmployee,
            request.NotificationText,
            request.Status,
            request.CreatedAt,
            request.Description);

    private static MobileAccountDto MapMobileAccount(MobileAccountEntity account)
    {
        var boundEmployeeIds = GetActiveBindings(account)
            .Select(binding => binding.EmployeeId)
            .ToList();
        var boundEmployees = GetDisplayBoundEmployeeNames(account);
        var employee = account.EmployeeScope == "all"
            ? "Все сотрудники"
            : boundEmployees.Length == 0
                ? "Не привязан"
                : boundEmployees.Length == 1
                    ? boundEmployees[0]
                    : $"{boundEmployees[0]} +{boundEmployees.Length - 1}";

        return new MobileAccountDto(
            account.Id,
            account.Login,
            account.PasswordResetRequired ? "Требует смены пароля" : "Пароль задан",
            employee,
            account.EmployeeScope,
            boundEmployeeIds,
            boundEmployees,
            account.Role,
            account.Status,
            account.Session,
            account.LastSeenAt?.ToLocalTime().ToString("dd.MM.yyyy HH:mm") ?? "Не входил",
            account.Device,
            account.Version);
    }

    private static string NormalizeOptionalText(string? value) =>
        NormalizeOptionalText(value, string.Empty);

    private static string NormalizeOptionalText(string? value, string fallback) =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static bool IsArchivedStatus(string? status) =>
        string.Equals(NormalizeOptionalText(status), "Архив", StringComparison.OrdinalIgnoreCase);

    private static bool IsActivePointStatus(string? status) =>
        !string.Equals(NormalizeOptionalText(status), "Черновик", StringComparison.OrdinalIgnoreCase);

    private static void ReorderPoints(IEnumerable<RoutePointEntity> points)
    {
        var index = 1;
        foreach (var point in points)
        {
            point.SequenceNo = index++;
        }
    }
}
