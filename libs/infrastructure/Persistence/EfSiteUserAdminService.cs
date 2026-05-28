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

        var roles = ResolveRoles(request.RoleCodes);
        if (roles.Count == 0)
        {
            return new CreateSiteUserResult(null, Error("roleCodes", "Выберите роль"));
        }

        var now = DateTimeOffset.UtcNow;
        var temporaryPassword = CreateTemporaryPassword();
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

        var roles = ResolveRoles(request.RoleCodes);
        if (roles.Count == 0)
        {
            return new UpdateSiteUserResult(null, Error("roleCodes", "Выберите роль"));
        }

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

        dbContext.SaveChanges();
        return new UpdateSiteUserResult(MapUser(user), EmptyErrors());
    }

    public UpdateSiteUserResult BlockUser(Guid id) => SetStatus(id, "blocked");

    public UpdateSiteUserResult UnblockUser(Guid id) => SetStatus(id, "active");

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
            .Include(user => user.Roles)
                .ThenInclude(userRole => userRole.Role)
                    .ThenInclude(role => role.Permissions)
                        .ThenInclude(rolePermission => rolePermission.Permission);

    private IReadOnlyList<RoleEntity> ResolveRoles(IReadOnlyList<string>? roleCodes)
    {
        var codes = (roleCodes ?? [])
            .Select(code => code.Trim())
            .Where(code => code.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return dbContext.Roles.Where(role => codes.Contains(role.Code)).ToArray();
    }

    private static IReadOnlyDictionary<string, string[]> ValidateRequest(
        CreateSiteUserDto request,
        Guid? id) =>
        ValidateValues(request.Login, request.DisplayName, request.RoleCodes, request.Status);

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

    private static SiteUserDto MapUser(SiteUserEntity user)
    {
        var roles = user.Roles
            .Select(item => item.Role.Code)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order()
            .ToArray();

        var permissions = user.Roles
            .SelectMany(item => item.Role.Permissions)
            .Select(item => item.Permission.Code)
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
            permissions);
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
