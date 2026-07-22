using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Caching.Memory;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfPatrolStore
{
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
        var explicitPassword = NormalizeOptionalText(request.Password);
        var hasExplicitPassword = !string.IsNullOrWhiteSpace(explicitPassword);
        var temporaryPassword = !hasExplicitPassword && request.TemporaryPassword ? CreateTemporaryPassword() : null;
        var passwordForHash = hasExplicitPassword ? explicitPassword : temporaryPassword ?? CreateTemporaryPassword();
        var now = DateTimeOffset.UtcNow;
        var accountEntity = new MobileAccountEntity
        {
            Id = Guid.NewGuid(),
            Login = login,
            EmployeeScope = employeeScope,
            BoundEmployees = shouldBind ? boundEmployees : [],
            Role = NormalizeOptionalText(request.Role, "Маршрутный обходчик"),
            Status = NormalizeCreateMobileAccountStatus(request.Status, shouldBind),
            Session = "-",
            LastSeenAt = null,
            Device = (request.RestrictToLinkedDevices ?? request.RestrictToBoundDevice) ? "Ожидает привязки" : "Любое устройство",
            Version = "-",
            CreatedAt = now,
            PasswordHash = string.Empty,
            PasswordResetRequired = request.RequirePasswordChange ?? !hasExplicitPassword,
            LastPasswordResetAt = temporaryPassword is null ? null : now
        };
        accountEntity.PasswordHash = MobilePasswordHasher.HashPassword(accountEntity, passwordForHash);
        AddInitialMobileAccountBindings(accountEntity);

        dbContext.MobileAccounts.Add(accountEntity);
        AddMobileAccountAuditEvent(
            accountEntity.Id,
            temporaryPassword is null ? "mobile_account.created_without_password" : "mobile_account.created_with_temporary_password",
            temporaryPassword is null
                ? $"Создан мобильный аккаунт {accountEntity.Login}; пароль нужно задать перед первым входом."
                : $"Создан мобильный аккаунт {accountEntity.Login}; временный пароль выдан один раз.");
        SyncEmployeeMobileFlags(accountEntity);
        SaveChangesAndInvalidateDashboardSummary();

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

        var password = NormalizeOptionalText(request.Password);
        var errors = ValidateUpdateMobileAccount(id, request);
        if (errors.Count > 0)
        {
            return new UpdateMobileAccountResult(null, errors);
        }

        var nextStatus = NormalizeOptionalText(request.Status);
        account.Login = NormalizeLogin(request.Login);
        account.Role = NormalizeOptionalText(request.Role);
        account.Status = nextStatus;

        if (!string.IsNullOrWhiteSpace(password))
        {
            account.PasswordHash = MobilePasswordHasher.HashPassword(account, password);
            account.PasswordResetRequired = false;
            account.LastPasswordResetAt = DateTimeOffset.UtcNow;
        }

        if (nextStatus == "Не привязан")
        {
            DetachAllBindings(account);
        }

        var auditDetails = $"Обновлён аккаунт {account.Login}. Роль: {account.Role}; статус: {account.Status}.";
        if (!string.IsNullOrWhiteSpace(password))
        {
            auditDetails += " Пароль изменён вручную.";
        }

        AddMobileAccountAuditEvent(
            account.Id,
            "mobile_account.updated",
            auditDetails);
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

        AddMobileAccountAuditEvent(
            account.Id,
            "mobile_account.employee_attached",
            $"К аккаунту {account.Login} привязан сотрудник {employee.FullName} (ID: {employee.Id}).");
        SyncMobileAccountDerivedState(account);
        if (account.EmployeeScope == "all")
        {
            SaveChangesAndRebuildEmployeeMobileFlags();
        }
        else
        {
            SaveChangesAndRefreshEmployeeMobileFlags([employee.Id]);
        }

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

        AddMobileAccountAuditEvent(
            account.Id,
            "mobile_account.employee_detached",
            $"От аккаунта {account.Login} отвязан сотрудник (ID: {employeeId}).");
        SyncMobileAccountDerivedState(account);
        if (account.Status == "Активен" && GetActiveBindings(account).Count == 0)
        {
            account.Status = "Не привязан";
        }

        if (account.EmployeeScope == "all")
        {
            SaveChangesAndRebuildEmployeeMobileFlags();
        }
        else
        {
            SaveChangesAndRefreshEmployeeMobileFlags([employeeId]);
        }

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
        AddMobileAccountAuditEvent(account.Id, "mobile_account.blocked", $"Мобильный аккаунт {account.Login} заблокирован.");
        SaveChangesAndInvalidateDashboardSummary();

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
        AddMobileAccountAuditEvent(account.Id, "mobile_account.unblocked", $"Мобильный аккаунт {account.Login} разблокирован.");
        SaveChangesAndInvalidateDashboardSummary();

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
        AddMobileAccountAuditEvent(account.Id, "mobile_account.password_reset", $"Для аккаунта {account.Login} создан новый временный пароль.");
        SaveChangesAndInvalidateDashboardSummary();

        return new ResetMobileAccountPasswordDto(password, account.LastPasswordResetAt.Value);
    }

    public bool DeleteAccount(Guid id)
    {
        var account = dbContext.MobileAccounts.FirstOrDefault(item => item.Id == id);
        if (account is null)
        {
            return false;
        }

        AddMobileAccountAuditEvent(account.Id, "mobile_account.deleted", $"Мобильный аккаунт {account.Login} удалён.");
        dbContext.MobileAccounts.Remove(account);
        SaveChangesAndInvalidateDashboardSummary();

        RebuildEmployeeMobileFlags();
        SaveChangesAndInvalidateDashboardSummary();

        return true;
    }

    public IReadOnlyList<MobileAccountSessionDto> GetSessions(Guid id)
    {
        if (!dbContext.MobileAccounts.Any(account => account.Id == id))
        {
            return [];
        }

        var now = DateTimeOffset.UtcNow;
        return dbContext.MobileAccountSessions
            .AsNoTracking()
            .Where(session => session.MobileAccountId == id)
            .OrderByDescending(session => session.LastSeenAt)
            .Select(session => new MobileAccountSessionDto(
                session.Id,
                session.MobileAccountId,
                session.RevokedAt != null ? "Вышел" : session.ExpiresAt <= now ? "Истекла" : "Онлайн",
                session.DeviceId,
                session.Device,
                session.Platform,
                session.AppVersion,
                session.IpAddress,
                session.LastSeenAt,
                session.CreatedAt,
                session.RevokedAt ?? (session.ExpiresAt <= now ? session.ExpiresAt : null)))
            .Take(7)
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
            .Take(7)
            .Select(auditEvent => new MobileAccountSecurityEventDto(
                auditEvent.Id,
                auditEvent.MobileAccountId,
                auditEvent.Action,
                auditEvent.Details,
                auditEvent.CreatedAt,
                auditEvent.Actor))
            .ToList();
    }

    private static Dictionary<string, string[]> ValidateMobileAccount(CreateMobileAccountDto request)
    {
        var errors = new Dictionary<string, string[]>();
        var scope = NormalizeEmployeeScope(request.EmployeeScope);
        var login = NormalizeLogin(request.Login);
        var password = NormalizeOptionalText(request.Password);
        var hasExplicitPassword = !string.IsNullOrWhiteSpace(password);

        if (string.IsNullOrWhiteSpace(login))
        {
            errors["login"] = ["Введите логин"];
        }

        if (hasExplicitPassword && password.Length < 8)
        {
            errors["password"] = ["Пароль должен содержать минимум 8 символов"];
        }

        if (hasExplicitPassword && password != NormalizeOptionalText(request.ConfirmPassword))
        {
            errors["password"] = ["Пароли должны совпадать"];
        }

        if (!string.IsNullOrWhiteSpace(request.Status) && NormalizeCreateMobileAccountStatus(request.Status, shouldBind: true) == string.Empty)
        {
            errors["status"] = ["Некорректный статус аккаунта"];
        }

        if (!string.IsNullOrWhiteSpace(request.Language) && request.Language is not ("ru" or "en"))
        {
            errors["language"] = ["Некорректный язык интерфейса"];
        }

        if (scope != "all" && request.BindEmployee && NormalizeEmployeeNames(request.Employee).Length == 0)
        {
            errors["employee"] = ["Укажите сотрудника для привязки или выберите доступ ко всем сотрудникам."];
        }

        return errors;
    }

    private static string NormalizeCreateMobileAccountStatus(string? status, bool shouldBind)
    {
        var normalized = NormalizeOptionalText(status).ToLowerInvariant();
        return normalized switch
        {
            "" => shouldBind ? "Активен" : "Не привязан",
            "active" or "активен" => "Активен",
            "inactive" or "неактивен" or "не привязан" => "Не привязан",
            "blocked" or "заблокирован" => "Заблокирован",
            _ => string.Empty
        };
    }

    private Dictionary<string, string[]> ValidateUpdateMobileAccount(Guid accountId, UpdateMobileAccountDto request)
    {
        var errors = new Dictionary<string, string[]>();
        var login = NormalizeLogin(request.Login);
        var role = NormalizeOptionalText(request.Role);
        var status = NormalizeOptionalText(request.Status);
        var password = NormalizeOptionalText(request.Password);
        var confirmPassword = NormalizeOptionalText(request.ConfirmPassword);

        if (string.IsNullOrWhiteSpace(password) && !string.IsNullOrWhiteSpace(confirmPassword))
        {
            errors["password"] = ["Укажите новый пароль."];
        }
        else if (!string.IsNullOrWhiteSpace(password) && password.Length < 8)
        {
            errors["password"] = ["Пароль должен содержать минимум 8 символов."];
        }
        else if (!string.IsNullOrWhiteSpace(password) && password != confirmPassword)
        {
            errors["password"] = ["Пароли не совпадают."];
        }

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
        SaveChangesAndInvalidateDashboardSummary();
        RebuildEmployeeMobileFlags();
        SaveChangesAndInvalidateDashboardSummary();
    }

    private void SaveChangesAndRefreshEmployeeMobileFlags(IReadOnlyCollection<Guid> employeeIds)
    {
        SaveChangesAndInvalidateDashboardSummary();
        RefreshEmployeeMobileFlags(employeeIds);
        SaveChangesAndInvalidateDashboardSummary();
    }


    private void RefreshEmployeeMobileFlags(IReadOnlyCollection<Guid> employeeIds)
    {
        if (employeeIds.Count == 0)
        {
            return;
        }

        var employees = dbContext.Employees
            .Where(employee => employeeIds.Contains(employee.Id))
            .ToList();
        if (employees.Count == 0)
        {
            return;
        }

        var employeeNames = employees.Select(employee => employee.FullName).ToArray();
        var hasAllScopeAccount = dbContext.MobileAccounts.Any(account => account.EmployeeScope == "all");
        var boundEmployeeIds = dbContext.MobileAccountEmployeeBindings
            .Where(binding => binding.DetachedAt == null && employeeIds.Contains(binding.EmployeeId))
            .Select(binding => binding.EmployeeId)
            .Distinct()
            .ToHashSet();
        var legacyBoundNames = dbContext.MobileAccounts
            .AsNoTracking()
            .Where(account => account.EmployeeScope != "all")
            .Select(account => account.BoundEmployees)
            .AsEnumerable()
            .SelectMany(names => names)
            .Where(name => employeeNames.Contains(name, StringComparer.OrdinalIgnoreCase))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var employee in employees)
        {
            employee.HasMobileAccount = hasAllScopeAccount
                || boundEmployeeIds.Contains(employee.Id)
                || legacyBoundNames.Contains(employee.FullName);
        }
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

    private void AddMobileNotificationForEmployee(
        Guid employeeId,
        string type,
        string title,
        string message,
        string entityType,
        string entityId,
        string idempotencyKey)
    {
        var now = DateTimeOffset.UtcNow;
        var accounts = dbContext.MobileAccounts
            .Include(account => account.EmployeeBindings)
            .Include(account => account.Sessions)
            .Where(account => account.Status != "Заблокирован")
            .Where(account => account.EmployeeBindings.Any(binding => binding.EmployeeId == employeeId && binding.DetachedAt == null))
            .ToList();

        foreach (var account in accounts)
        {
            if (dbContext.MobileNotifications.Any(notification =>
                notification.MobileAccountId == account.Id && notification.IdempotencyKey == idempotencyKey))
            {
                continue;
            }

            var pushToken = account.Sessions
                .Where(session => session.RevokedAt == null && session.PushTokenRevokedAt == null)
                .OrderByDescending(session => session.PushTokenRegisteredAt)
                .Select(session => session.PushToken)
                .FirstOrDefault(token => !string.IsNullOrWhiteSpace(token)) ?? string.Empty;

            dbContext.MobileNotifications.Add(new MobileNotificationEntity
            {
                Id = Guid.NewGuid(),
                MobileAccountId = account.Id,
                EmployeeId = employeeId,
                Type = NormalizeOptionalText(type, "patrolRequest"),
                Title = NormalizeOptionalText(title, "Уведомление"),
                Message = NormalizeOptionalText(message, "Появилась новая заявка."),
                EntityType = NormalizeOptionalText(entityType),
                EntityId = NormalizeOptionalText(entityId),
                IdempotencyKey = NormalizeOptionalText(idempotencyKey),
                PushStatus = string.IsNullOrWhiteSpace(pushToken) ? "waitingSync" : "queued",
                PushTokenSnapshot = pushToken,
                CreatedAt = now
            });
        }
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
}
