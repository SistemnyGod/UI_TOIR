using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfSiteUserAdminService(Patrol360DbContext dbContext) : ISiteUserAdminService
{
    private static readonly string[] AllowedStatuses = ["active", "inactive", "blocked"];
    private readonly PasswordHasher<SiteUserEntity> passwordHasher = new();

    public IReadOnlyList<SiteUserDto> GetUsers() =>
        QueryUsers()
            .OrderBy(user => user.Login)
            .AsEnumerable()
            .Select(MapUser)
            .ToArray();

    public SiteUserDto? GetUser(Guid id) =>
        QueryUsers()
            .Where(user => user.Id == id)
            .AsEnumerable()
            .Select(MapUser)
            .FirstOrDefault();

    public IReadOnlyList<RoleDto> GetRoles() =>
        dbContext.Roles
            .Include(role => role.Permissions)
                .ThenInclude(rolePermission => rolePermission.Permission)
            .OrderBy(role => role.Code)
            .AsEnumerable()
            .Select(MapRole)
            .ToArray();

    public SiteUserAccessDto? GetUserAccess(Guid id) =>
        QueryUsers()
            .Where(user => user.Id == id)
            .AsEnumerable()
            .Select(MapUserAccess)
            .FirstOrDefault();

    public CreateSiteUserResult CreateUser(CreateSiteUserDto request)
    {
        var errors = ValidateRequest(request, null);
        if (errors.Count > 0)
        {
            return new CreateSiteUserResult(null, errors);
        }

        var normalizedLogin = EfAuthSessionService.NormalizeLogin(request.Login);
        if (dbContext.SiteUsers.Any(user => user.NormalizedLogin == normalizedLogin))
        {
            return new CreateSiteUserResult(null, Error("login", "Логин уже занят"));
        }

        var roleErrors = ValidateRoleCodes(request.RoleCodes);
        if (roleErrors.Count > 0)
        {
            return new CreateSiteUserResult(null, roleErrors);
        }

        var permissionErrors = ValidatePermissionCodes(request.PermissionCodes);
        if (permissionErrors.Count > 0)
        {
            return new CreateSiteUserResult(null, permissionErrors);
        }

        var roles = ResolveRoles(request.RoleCodes);
        var now = DateTimeOffset.UtcNow;
        var temporaryPassword = request.InitialPassword!.Trim();
        var user = new SiteUserEntity
        {
            Id = Guid.NewGuid(),
            Login = request.Login.Trim(),
            NormalizedLogin = normalizedLogin,
            DisplayName = request.DisplayName.Trim(),
            Status = NormalizeStatus(request.Status),
            CreatedAt = now
        };
        user.PasswordHash = passwordHasher.HashPassword(user, temporaryPassword);
        user.Roles = roles.Select(role => new SiteUserRoleEntity
        {
            SiteUserId = user.Id,
            RoleId = role.Id,
            Role = role
        }).ToList();
        user.Permissions = ResolvePermissions(request.PermissionCodes).Select(permission => new SiteUserPermissionEntity
        {
            SiteUserId = user.Id,
            PermissionId = permission.Id,
            Permission = permission
        }).ToList();

        dbContext.SiteUsers.Add(user);
        dbContext.SaveChanges();

        return new CreateSiteUserResult(new SiteUserCreatedDto(MapUser(user), temporaryPassword), EmptyErrors());
    }

    public UpdateSiteUserResult UpdateUser(Guid id, UpdateSiteUserDto request)
    {
        var user = QueryUsers().FirstOrDefault(item => item.Id == id);
        if (user is null)
        {
            return new UpdateSiteUserResult(null, Error("user", "Пользователь не найден"));
        }

        var errors = ValidateRequest(request, id);
        if (errors.Count > 0)
        {
            return new UpdateSiteUserResult(null, errors);
        }

        var normalizedLogin = EfAuthSessionService.NormalizeLogin(request.Login);
        if (dbContext.SiteUsers.Any(item => item.Id != id && item.NormalizedLogin == normalizedLogin))
        {
            return new UpdateSiteUserResult(null, Error("login", "Логин уже занят"));
        }

        var roleErrors = ValidateRoleCodes(request.RoleCodes);
        if (roleErrors.Count > 0)
        {
            return new UpdateSiteUserResult(null, roleErrors);
        }

        var permissionErrors = ValidatePermissionCodes(request.PermissionCodes);
        if (permissionErrors.Count > 0)
        {
            return new UpdateSiteUserResult(null, permissionErrors);
        }

        var roles = ResolveRoles(request.RoleCodes);
        user.Login = request.Login.Trim();
        user.NormalizedLogin = normalizedLogin;
        user.DisplayName = request.DisplayName.Trim();
        user.Status = NormalizeStatus(request.Status);
        user.Roles.Clear();
        foreach (var role in roles)
        {
            user.Roles.Add(new SiteUserRoleEntity
            {
                SiteUserId = user.Id,
                RoleId = role.Id,
                Role = role
            });
        }

        ReplaceDirectPermissions(user, request.PermissionCodes);

        dbContext.SaveChanges();
        return new UpdateSiteUserResult(MapUser(user), EmptyErrors());
    }

    public UpdateSiteUserResult UpdateUserPermissions(Guid id, UpdateSiteUserPermissionsDto request)
    {
        var user = QueryUsers().FirstOrDefault(item => item.Id == id);
        if (user is null)
        {
            return new UpdateSiteUserResult(null, Error("user", "Пользователь не найден"));
        }

        ReplaceDirectPermissions(user, request.PermissionCodes);

        dbContext.SaveChanges();
        return new UpdateSiteUserResult(MapUser(user), EmptyErrors());
    }

    public UpdateSiteUserResult BlockUser(Guid id) => SetStatus(id, "blocked");

    public UpdateSiteUserResult UnblockUser(Guid id) => SetStatus(id, "active");

    public UpdateSiteUserScopesResult UpdateUserScopes(Guid id, UpdateSiteUserScopesDto request, Guid? actorUserId = null)
    {
        var user = QueryUsers().FirstOrDefault(item => item.Id == id);
        if (user is null)
        {
            return new UpdateSiteUserScopesResult(null, Error("user", "Пользователь не найден"));
        }

        var scopeErrors = ValidateScopes(request.Scopes);
        if (scopeErrors.Count > 0)
        {
            return new UpdateSiteUserScopesResult(null, scopeErrors);
        }

        dbContext.SiteUserAccessScopes.RemoveRange(user.AccessScopes);
        var now = DateTimeOffset.UtcNow;
        user.AccessScopes = request.Scopes
            .Where(scope => scope.ScopeId != Guid.Empty)
            .Select(scope => new SiteUserAccessScopeEntity
            {
                Id = Guid.NewGuid(),
                SiteUserId = user.Id,
                ModuleKey = NormalizeScopeValue(scope.ModuleKey),
                ScopeType = NormalizeScopeValue(scope.ScopeType),
                ScopeId = scope.ScopeId,
                CreatedAt = now,
                CreatedByUserId = actorUserId
            })
            .GroupBy(scope => new { scope.ModuleKey, scope.ScopeType, scope.ScopeId })
            .Select(group => group.First())
            .ToList();

        dbContext.SaveChanges();
        return new UpdateSiteUserScopesResult(MapUserAccess(user), EmptyErrors());
    }

    public ResetSiteUserPasswordDto? ResetPassword(Guid id)
    {
        var user = dbContext.SiteUsers.FirstOrDefault(item => item.Id == id);
        if (user is null)
        {
            return null;
        }

        var password = CreateTemporaryPassword();
        var resetAt = DateTimeOffset.UtcNow;
        user.PasswordHash = passwordHasher.HashPassword(user, password);
        dbContext.SaveChanges();
        return new ResetSiteUserPasswordDto(password, resetAt);
    }

    private UpdateSiteUserResult SetStatus(Guid id, string status)
    {
        var user = QueryUsers().FirstOrDefault(item => item.Id == id);
        if (user is null)
        {
            return new UpdateSiteUserResult(null, Error("user", "Пользователь не найден"));
        }

        user.Status = status;
        dbContext.SaveChanges();
        return new UpdateSiteUserResult(MapUser(user), EmptyErrors());
    }

    private IQueryable<SiteUserEntity> QueryUsers() =>
        dbContext.SiteUsers
            .AsSplitQuery()
            .Include(user => user.Roles)
                .ThenInclude(userRole => userRole.Role)
                    .ThenInclude(role => role.Permissions)
                        .ThenInclude(rolePermission => rolePermission.Permission)
            .Include(user => user.Permissions)
                .ThenInclude(userPermission => userPermission.Permission)
            .Include(user => user.AccessScopes);

    private IReadOnlyList<RoleEntity> ResolveRoles(IReadOnlyList<string>? roleCodes)
    {
        var codes = NormalizeCodes(roleCodes);

        return codes.Length == 0
            ? []
            : dbContext.Roles.Where(role => codes.Contains(role.Code.ToLower())).ToArray();
    }

    private IReadOnlyList<PermissionEntity> ResolvePermissions(IReadOnlyList<string>? permissionCodes)
    {
        var codes = NormalizeCodes(permissionCodes);

        return codes.Length == 0
            ? []
            : dbContext.Permissions.Where(permission => codes.Contains(permission.Code.ToLower())).ToArray();
    }

    private IReadOnlyDictionary<string, string[]> ValidateRoleCodes(IReadOnlyList<string>? roleCodes)
    {
        var codes = NormalizeCodes(roleCodes);
        if (codes.Length == 0)
        {
            return Error("roleCodes", "Выберите роль");
        }

        var knownCodes = dbContext.Roles
            .Where(role => codes.Contains(role.Code.ToLower()))
            .Select(role => role.Code)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var unknownCodes = codes.Where(code => !knownCodes.Contains(code)).ToArray();

        return unknownCodes.Length == 0
            ? EmptyErrors()
            : Error("roleCodes", $"Неизвестные роли: {string.Join(", ", unknownCodes)}");
    }

    private IReadOnlyDictionary<string, string[]> ValidatePermissionCodes(IReadOnlyList<string>? permissionCodes)
    {
        var codes = NormalizeCodes(permissionCodes);
        if (codes.Length == 0)
        {
            return EmptyErrors();
        }

        var knownCodes = dbContext.Permissions
            .Where(permission => codes.Contains(permission.Code.ToLower()))
            .Select(permission => permission.Code)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var unknownCodes = codes.Where(code => !knownCodes.Contains(code)).ToArray();

        return unknownCodes.Length == 0
            ? EmptyErrors()
            : Error("permissionCodes", $"Неизвестные права: {string.Join(", ", unknownCodes)}");
    }

    private IReadOnlyDictionary<string, string[]> ValidateScopes(IReadOnlyList<SiteUserAccessScopeUpsertDto>? scopes)
    {
        var scopeRows = scopes ?? [];
        if (scopeRows.Count == 0)
        {
            return EmptyErrors();
        }

        if (scopeRows.Count > 500)
        {
            return Error("scopes", "Нельзя сохранить больше 500 ограничений доступа за один запрос");
        }

        if (scopeRows.Any(scope =>
            !NormalizeScopeValue(scope.ModuleKey).Equals("emu", StringComparison.OrdinalIgnoreCase)
            || !NormalizeScopeValue(scope.ScopeType).Equals("emu_section", StringComparison.OrdinalIgnoreCase)))
        {
            return Error("scopes", "Для учета работ поддерживаются только moduleKey=emu и scopeType=emu_section");
        }

        if (scopeRows.Any(scope => scope.ScopeId == Guid.Empty))
        {
            return Error("scopes", "Укажите участок ЭМУ для каждого ограничения доступа");
        }

        var scopeIds = scopeRows
            .Select(scope => scope.ScopeId)
            .ToArray();
        if (scopeIds.Length != scopeIds.Distinct().Count())
        {
            return Error("scopes", "Список участков содержит дубликаты");
        }

        var knownSectionIds = dbContext.EmuWorkSections
            .Where(section => scopeIds.Contains(section.Id))
            .Select(section => section.Id)
            .ToHashSet();
        var unknownSectionIds = scopeIds.Where(scopeId => !knownSectionIds.Contains(scopeId)).ToArray();

        return unknownSectionIds.Length == 0
            ? EmptyErrors()
            : Error("scopes", "Список содержит неизвестные участки ЭМУ");
    }

    private static string[] NormalizeCodes(IReadOnlyList<string>? codes) =>
        (codes ?? [])
            .Select(code => code.Trim())
            .Where(code => code.Length > 0)
            .Select(code => code.ToLowerInvariant())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

    private void ReplaceDirectPermissions(SiteUserEntity user, IReadOnlyList<string>? permissionCodes)
    {
        user.Permissions.Clear();
        foreach (var permission in ResolvePermissions(permissionCodes))
        {
            user.Permissions.Add(new SiteUserPermissionEntity
            {
                SiteUserId = user.Id,
                PermissionId = permission.Id,
                Permission = permission
            });
        }
    }

    private static IReadOnlyDictionary<string, string[]> ValidateRequest(
        CreateSiteUserDto request,
        Guid? id)
    {
        var errors = ValidateValues(request.Login, request.DisplayName, request.RoleCodes, request.Status);
        if (errors.Count > 0)
        {
            return errors;
        }

        if (string.IsNullOrWhiteSpace(request.InitialPassword))
        {
            return errors.Concat(Error("initialPassword", "Укажите временный пароль"))
                .ToDictionary(item => item.Key, item => item.Value, StringComparer.OrdinalIgnoreCase);
        }

        if (request.InitialPassword.Trim().Length < 8)
        {
            return errors.Concat(Error("initialPassword", "Пароль должен быть не короче 8 символов"))
                .ToDictionary(item => item.Key, item => item.Value, StringComparer.OrdinalIgnoreCase);
        }

        return errors;
    }

    private static IReadOnlyDictionary<string, string[]> ValidateRequest(
        UpdateSiteUserDto request,
        Guid? id) =>
        ValidateValues(request.Login, request.DisplayName, request.RoleCodes, request.Status);

    private static IReadOnlyDictionary<string, string[]> ValidateValues(
        string login,
        string displayName,
        IReadOnlyList<string>? roleCodes,
        string status)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

        if (string.IsNullOrWhiteSpace(login))
        {
            errors["login"] = ["Укажите логин"];
        }
        else if (login.Trim().Length > 120)
        {
            errors["login"] = ["Логин не должен превышать 120 символов"];
        }

        if (string.IsNullOrWhiteSpace(displayName))
        {
            errors["displayName"] = ["Укажите имя пользователя"];
        }

        if (roleCodes is null || roleCodes.Count == 0)
        {
            errors["roleCodes"] = ["Выберите роль"];
        }

        if (!AllowedStatuses.Contains(NormalizeStatus(status), StringComparer.OrdinalIgnoreCase))
        {
            errors["status"] = ["Недопустимый статус пользователя"];
        }

        return errors;
    }

    private static string NormalizeStatus(string status) =>
        status.Trim().ToLowerInvariant();

    private static string NormalizeScopeValue(string value) =>
        value.Trim().ToLowerInvariant();

    private SiteUserAccessDto MapUserAccess(SiteUserEntity user)
    {
        var mapped = MapUser(user);
        return new SiteUserAccessDto(
            user.Id,
            mapped.Roles,
            mapped.DirectPermissions,
            mapped.Permissions,
            user.AccessScopes
                .OrderBy(scope => scope.ModuleKey)
                .ThenBy(scope => scope.ScopeType)
                .ThenBy(scope => ResolveScopeName(scope))
                .Select(MapScope)
                .ToArray());
    }

    private SiteUserAccessScopeDto MapScope(SiteUserAccessScopeEntity scope) =>
        new(
            scope.Id,
            scope.ModuleKey,
            scope.ScopeType,
            scope.ScopeId,
            ResolveScopeName(scope));

    private string ResolveScopeName(SiteUserAccessScopeEntity scope)
    {
        if (scope.ModuleKey.Equals("emu", StringComparison.OrdinalIgnoreCase)
            && scope.ScopeType.Equals("emu_section", StringComparison.OrdinalIgnoreCase))
        {
            return dbContext.EmuWorkSections
                .AsNoTracking()
                .Where(section => section.Id == scope.ScopeId)
                .Select(section => section.Name)
                .FirstOrDefault() ?? scope.ScopeId.ToString();
        }

        return scope.ScopeId.ToString();
    }

    private static SiteUserDto MapUser(SiteUserEntity user)
    {
        var roles = user.Roles
            .Select(item => item.Role.Code)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order()
            .ToArray();

        var directPermissions = user.Permissions
            .Select(item => item.Permission.Code)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order()
            .ToArray();

        var permissions = user.Roles
            .SelectMany(item => item.Role.Permissions)
            .Select(item => item.Permission.Code)
            .Concat(directPermissions)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order()
            .ToArray();

        return new SiteUserDto(
            user.Id,
            user.Login,
            user.DisplayName,
            roles,
            user.Status,
            user.CreatedAt,
            user.LastLoginAt,
            permissions,
            directPermissions);
    }

    private static RoleDto MapRole(RoleEntity role) =>
        new(
            role.Id,
            role.Code,
            role.Name,
            role.Permissions
                .Select(item => item.Permission.Code)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Order()
                .ToArray());

    private static string CreateTemporaryPassword() =>
        $"Patrol-{Random.Shared.Next(100_000, 999_999)}!";

    private static IReadOnlyDictionary<string, string[]> Error(string key, string message) =>
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            [key] = [message]
        };

    private static IReadOnlyDictionary<string, string[]> EmptyErrors() =>
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
}
