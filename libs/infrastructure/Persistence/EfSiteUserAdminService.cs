using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfSiteUserAdminService(Patrol360DbContext dbContext) : ISiteUserAdminService
{
    private static readonly string[] AllowedStatuses = ["active", "inactive", "blocked"];
    private static readonly string[] AllowedEffects = ["allow", "deny"];
    private static readonly Dictionary<string, (string Name, string Description)> ModuleNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ["patrol"] = ("\u041e\u0431\u0445\u043e\u0434", "\u041c\u0430\u0440\u0448\u0440\u0443\u0442\u044b, \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f \u0438 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u044b"),
        ["inventory"] = ("\u0411\u0443\u0445\u0433\u0430\u043b\u0442\u0435\u0440\u0438\u044f", "\u0421\u043a\u043b\u0430\u0434, \u0432\u044b\u0434\u0430\u0447\u0430, \u0421\u0418\u0417 \u0438 \u043e\u0442\u0447\u0435\u0442\u044b"),
        ["emu"] = ("\u042d\u041c\u0423", "\u0420\u0430\u0431\u043e\u0442\u044b, \u0441\u043c\u0435\u043d\u043d\u044b\u0435 \u043e\u0442\u0447\u0435\u0442\u044b \u0438 \u0443\u0447\u0430\u0441\u0442\u043a\u0438"),
        ["perco"] = ("PERCo", "\u041f\u0440\u043e\u0445\u043e\u0434\u044b, \u0441\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0430\u0446\u0438\u044f \u0438 \u0436\u0443\u0440\u043d\u0430\u043b"),
        ["administration"] = ("\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435", "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438, \u0440\u043e\u043b\u0438 \u0438 \u0441\u0438\u0441\u0442\u0435\u043c\u043d\u044b\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438"),
        ["system"] = ("\u0421\u0438\u0441\u0442\u0435\u043c\u0430", "\u0421\u0438\u0441\u0442\u0435\u043c\u043d\u044b\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043d\u0438\u044f"),
    };
    private readonly PasswordHasher<SiteUserEntity> passwordHasher = new();

    public IReadOnlyList<SiteUserDto> GetUsers() =>
        QueryUsers()
            .OrderBy(user => user.Login)
            .AsEnumerable()
            .Select(MapUser)
            .ToArray();

    public SiteUserListResponseDto GetUsersQuery(SiteUserQuery query)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, 100);
        var users = QueryUsers();

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim();
            users = users.Where(user => user.Login.Contains(search) || user.DisplayName.Contains(search));
        }

        if (!string.IsNullOrWhiteSpace(query.Role))
        {
            var role = query.Role.Trim().ToLowerInvariant();
            users = users.Where(user => user.Roles.Any(item => item.Role.Code.ToLower() == role));
        }

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            var status = query.Status.Trim().ToLowerInvariant();
            users = users.Where(user => user.Status.ToLower() == status);
        }

        var total = users.Count();
        var items = users.OrderBy(user => user.Login)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .AsEnumerable()
            .Select(MapUser)
            .ToArray();
        return new SiteUserListResponseDto(items, page, pageSize, total);
    }

    public SiteUserDto? GetUser(Guid id) =>
        QueryUsers().Where(user => user.Id == id).AsEnumerable().Select(MapUser).FirstOrDefault();

    public IReadOnlyList<RoleDto> GetRoles() =>
        dbContext.Roles
            .Include(role => role.Permissions)
                .ThenInclude(rolePermission => rolePermission.Permission)
            .OrderBy(role => role.Code)
            .AsEnumerable()
            .Select(MapRole)
            .ToArray();

    public SiteUserAccessCatalogDto GetAccessCatalog()
    {
        var roles = GetRoles();
        var permissions = dbContext.Permissions
            .AsNoTracking()
            .OrderBy(permission => permission.ModuleKey)
            .ThenBy(permission => permission.DisplayOrder)
            .ThenBy(permission => permission.Code)
            .ToArray();

        var modules = permissions
            .GroupBy(permission => permission.ModuleKey, StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                var metadata = ModuleNames.TryGetValue(group.Key, out var value)
                    ? value
                    : (group.Key, "\u0420\u0430\u0437\u0440\u0435\u0448\u0435\u043d\u0438\u044f \u043c\u043e\u0434\u0443\u043b\u044f");
                return new AccessModuleDto(
                    group.Key,
                    metadata.Item1,
                    metadata.Item2,
                    group.Select(MapPermission).ToArray());
            })
            .ToArray();

        return new SiteUserAccessCatalogDto(roles, modules);
    }

    public SiteUserAccessDto? GetUserAccess(Guid id) =>
        QueryUsers().Where(user => user.Id == id).AsEnumerable().Select(MapUserAccess).FirstOrDefault();

    public CreateSiteUserResult CreateUser(CreateSiteUserDto request) =>
        CreateUserAsActor(request, null);

    public CreateSiteUserResult CreateUserAsActor(CreateSiteUserDto request, SiteUserActorContext? actor)
    {
        var errors = ValidateCreateRequest(request);
        if (errors.Count > 0)
        {
            return new CreateSiteUserResult(null, errors);
        }

        var normalizedLogin = EfAuthSessionService.NormalizeLogin(request.Login);
        if (dbContext.SiteUsers.Any(user => user.NormalizedLogin == normalizedLogin))
        {
            return new CreateSiteUserResult(null, Error("login", "\u041b\u043e\u0433\u0438\u043d \u0443\u0436\u0435 \u0437\u0430\u043d\u044f\u0442"));
        }

        var roleErrors = ValidateRoleCodes(request.RoleCodes);
        if (roleErrors.Count > 0)
        {
            return new CreateSiteUserResult(null, roleErrors);
        }

        var overrideErrors = ValidatePermissionOverrides(request.PermissionOverrides, request.PermissionCodes);
        if (overrideErrors.Count > 0)
        {
            return new CreateSiteUserResult(null, overrideErrors);
        }

        var roles = ResolveRoles(request.RoleCodes);
        var now = DateTimeOffset.UtcNow;
        var temporaryPassword = string.IsNullOrWhiteSpace(request.InitialPassword)
            ? CreateTemporaryPassword()
            : request.InitialPassword.Trim();
        var user = new SiteUserEntity
        {
            Id = Guid.NewGuid(),
            Login = request.Login.Trim(),
            NormalizedLogin = normalizedLogin,
            DisplayName = request.DisplayName.Trim(),
            Status = NormalizeStatus(request.Status),
            CreatedAt = now,
            RequirePasswordChange = request.RequirePasswordChange
        };
        user.PasswordHash = passwordHasher.HashPassword(user, temporaryPassword);
        user.Roles = roles.Select(role => new SiteUserRoleEntity
        {
            SiteUserId = user.Id,
            RoleId = role.Id,
            Role = role
        }).ToList();

        var overrides = BuildCreationOverrides(request, roles);
        ReplacePermissionOverrides(user, overrides);
        dbContext.SiteUsers.Add(user);
        AddAudit(user.Id, actor, "user.created", null, "User created", null, new { user.Login, user.DisplayName });
        dbContext.SaveChanges();

        return new CreateSiteUserResult(new SiteUserCreatedDto(MapUser(user), temporaryPassword), EmptyErrors());
    }

    public UpdateSiteUserResult UpdateUser(Guid id, UpdateSiteUserDto request) =>
        UpdateUserAsActor(id, request, null);

    public UpdateSiteUserResult UpdateUserAsActor(Guid id, UpdateSiteUserDto request, SiteUserActorContext? actor)
    {
        var user = QueryUsers().FirstOrDefault(item => item.Id == id);
        if (user is null)
        {
            return new UpdateSiteUserResult(null, Error("user", "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d"));
        }

        var errors = ValidateUpdateRequest(request);
        if (errors.Count > 0)
        {
            return new UpdateSiteUserResult(null, errors);
        }

        var normalizedLogin = EfAuthSessionService.NormalizeLogin(request.Login);
        if (dbContext.SiteUsers.Any(item => item.Id != id && item.NormalizedLogin == normalizedLogin))
        {
            return new UpdateSiteUserResult(null, Error("login", "\u041b\u043e\u0433\u0438\u043d \u0443\u0436\u0435 \u0437\u0430\u043d\u044f\u0442"));
        }

        var roleErrors = ValidateRoleCodes(request.RoleCodes);
        if (roleErrors.Count > 0)
        {
            return new UpdateSiteUserResult(null, roleErrors);
        }

        var overrideErrors = ValidatePermissionOverrides(request.PermissionOverrides, request.PermissionCodes);
        if (overrideErrors.Count > 0)
        {
            return new UpdateSiteUserResult(null, overrideErrors);
        }

        var nextRoles = ResolveRoles(request.RoleCodes);
        var nextIsActiveAdmin = NormalizeStatus(request.Status) == "active" && nextRoles.Any(IsAdminRole);
        if (WouldRemoveLastActiveAdmin(user, nextIsActiveAdmin))
        {
            return new UpdateSiteUserResult(null, Error("roleCodes", "\u041d\u0435\u043b\u044c\u0437\u044f \u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0441\u0438\u0441\u0442\u0435\u043c\u0443 \u0431\u0435\u0437 \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0433\u043e \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0430"));
        }

        var before = new { user.Login, user.DisplayName, user.Status, Roles = user.Roles.Select(item => item.Role.Code).ToArray() };
        user.Login = request.Login.Trim();
        user.NormalizedLogin = normalizedLogin;
        user.DisplayName = request.DisplayName.Trim();
        user.Status = NormalizeStatus(request.Status);
        if (request.RequirePasswordChange is not null)
        {
            user.RequirePasswordChange = request.RequirePasswordChange.Value;
        }

        user.Roles.Clear();
        foreach (var role in nextRoles)
        {
            user.Roles.Add(new SiteUserRoleEntity { SiteUserId = user.Id, RoleId = role.Id, Role = role });
        }

        if (request.PermissionOverrides is not null || request.PermissionCodes is not null)
        {
            ReplacePermissionOverrides(user, NormalizeOverrides(request.PermissionOverrides, request.PermissionCodes));
        }

        AddAudit(user.Id, actor, "user.updated", null, "Profile, role or status updated", before, new { user.Login, user.DisplayName, user.Status, Roles = nextRoles.Select(role => role.Code).ToArray() });
        dbContext.SaveChanges();
        return new UpdateSiteUserResult(MapUser(user), EmptyErrors());
    }

    public UpdateSiteUserResult UpdateUserPermissions(Guid id, UpdateSiteUserPermissionsDto request) =>
        UpdateUserPermissionOverrides(id, request, null);

    public UpdateSiteUserResult UpdateUserPermissionOverrides(Guid id, UpdateSiteUserPermissionsDto request, SiteUserActorContext? actor)
    {
        var user = QueryUsers().FirstOrDefault(item => item.Id == id);
        if (user is null)
        {
            return new UpdateSiteUserResult(null, Error("user", "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d"));
        }

        var errors = ValidatePermissionOverrides(request.PermissionOverrides, request.PermissionCodes);
        if (errors.Count > 0)
        {
            return new UpdateSiteUserResult(null, errors);
        }

        var before = user.Permissions.Select(item => new { Code = item.Permission.Code, item.Effect }).ToArray();
        ReplacePermissionOverrides(user, NormalizeOverrides(request.PermissionOverrides, request.PermissionCodes));
        if (WouldRemoveLastAdminPermission(user))
        {
            return new UpdateSiteUserResult(null, Error("permissionOverrides", "\u041d\u0435\u043b\u044c\u0437\u044f \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0435 \u043f\u0440\u0430\u0432\u043e \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f\u043c\u0438"));
        }

        AddAudit(user.Id, actor, "permissions.updated", "administration", "Permission overrides updated", before, user.Permissions.Select(item => new { Code = item.Permission.Code, item.Effect }).ToArray());
        dbContext.SaveChanges();
        return new UpdateSiteUserResult(MapUser(user), EmptyErrors());
    }

    public UpdateSiteUserResult BlockUser(Guid id) => BlockUserAsActor(id, null);

    public UpdateSiteUserResult BlockUserAsActor(Guid id, SiteUserActorContext? actor)
    {
        var user = QueryUsers().FirstOrDefault(item => item.Id == id);
        if (user is null) return new UpdateSiteUserResult(null, Error("user", "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d"));
        if (actor?.UserId == id) return new UpdateSiteUserResult(null, Error("status", "\u041d\u0435\u043b\u044c\u0437\u044f \u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u043e\u0431\u0441\u0442\u0432\u0435\u043d\u043d\u0443\u044e \u0443\u0447\u0451\u0442\u043d\u0443\u044e \u0437\u0430\u043f\u0438\u0441\u044c"));
        if (user.Roles.Any(item => IsAdminRole(item.Role)) && IsOnlyActiveAdmin(user))
        {
            return new UpdateSiteUserResult(null, Error("status", "\u041d\u0435\u043b\u044c\u0437\u044f \u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0433\u043e \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0433\u043e \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0430"));
        }
        user.Status = "blocked";
        AddAudit(user.Id, actor, "user.blocked", "administration", "User blocked", null, new { user.Status });
        dbContext.SaveChanges();
        return new UpdateSiteUserResult(MapUser(user), EmptyErrors());
    }

    public UpdateSiteUserResult UnblockUser(Guid id) => UnblockUserAsActor(id, null);

    public UpdateSiteUserResult UnblockUserAsActor(Guid id, SiteUserActorContext? actor)
    {
        var user = QueryUsers().FirstOrDefault(item => item.Id == id);
        if (user is null) return new UpdateSiteUserResult(null, Error("user", "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d"));
        user.Status = "active";
        AddAudit(user.Id, actor, "user.unblocked", "administration", "User unblocked", null, new { user.Status });
        dbContext.SaveChanges();
        return new UpdateSiteUserResult(MapUser(user), EmptyErrors());
    }

    public UpdateSiteUserScopesResult UpdateUserScopes(Guid id, UpdateSiteUserScopesDto request, Guid? actorUserId = null) =>
        UpdateUserScopesAsActor(id, request, actorUserId is null ? null : new SiteUserActorContext(actorUserId, null));

    public UpdateSiteUserScopesResult UpdateUserScopesAsActor(Guid id, UpdateSiteUserScopesDto request, SiteUserActorContext? actor)
    {
        var user = QueryUsers().FirstOrDefault(item => item.Id == id);
        if (user is null) return new UpdateSiteUserScopesResult(null, Error("user", "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d"));
        var scopeErrors = ValidateScopes(request.Scopes);
        if (scopeErrors.Count > 0) return new UpdateSiteUserScopesResult(null, scopeErrors);

        var before = user.AccessScopes.Select(scope => scope.ScopeId).ToArray();
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
                SortOrder = scope.SortOrder,
                CreatedAt = now,
                CreatedByUserId = actor?.UserId
            })
            .GroupBy(scope => new { scope.ModuleKey, scope.ScopeType, scope.ScopeId })
            .Select(group => group.First())
            .ToList();

        var scopeAll = user.Permissions.FirstOrDefault(item => item.Permission.Code == "emu.scope.all");
        if (scopeAll is null)
        {
            var permission = dbContext.Permissions.FirstOrDefault(item => item.Code == "emu.scope.all");
            if (permission is not null)
            {
                user.Permissions.Add(new SiteUserPermissionEntity
                {
                    SiteUserId = user.Id,
                    PermissionId = permission.Id,
                    Permission = permission,
                    Effect = request.ScopeMode.Equals("all", StringComparison.OrdinalIgnoreCase) ? "allow" : "deny"
                });
            }
        }
        else
        {
            scopeAll.Effect = request.ScopeMode.Equals("all", StringComparison.OrdinalIgnoreCase) ? "allow" : "deny";
        }

        AddAudit(user.Id, actor, "scopes.updated", "emu", "EMU section scope updated", before, new { request.ScopeMode, Sections = user.AccessScopes.Select(scope => scope.ScopeId).ToArray() });
        dbContext.SaveChanges();
        return new UpdateSiteUserScopesResult(MapUserAccess(user), EmptyErrors());
    }

    public ResetSiteUserPasswordDto? ResetPassword(Guid id) => ResetPasswordAsActor(id, null);

    public ResetSiteUserPasswordDto? ResetPasswordAsActor(Guid id, SiteUserActorContext? actor)
    {
        var user = dbContext.SiteUsers.FirstOrDefault(item => item.Id == id);
        if (user is null) return null;
        var password = CreateTemporaryPassword();
        var resetAt = DateTimeOffset.UtcNow;
        user.PasswordHash = passwordHasher.HashPassword(user, password);
        user.RequirePasswordChange = true;
        AddAudit(user.Id, actor, "password.reset", "administration", "Temporary password generated", null, new { resetAt });
        dbContext.SaveChanges();
        return new ResetSiteUserPasswordDto(password, resetAt);
    }

    public SiteUserAuditPageDto GetUserAudit(Guid id, SiteUserAuditQuery query)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, 100);
        var rows = dbContext.SiteUserAuditEvents.AsNoTracking().Where(item => item.SiteUserId == id);
        if (query.DateFrom is not null) rows = rows.Where(item => item.CreatedAt >= query.DateFrom.Value);
        if (query.DateTo is not null) rows = rows.Where(item => item.CreatedAt <= query.DateTo.Value);
        if (!string.IsNullOrWhiteSpace(query.EventType)) rows = rows.Where(item => item.EventType == query.EventType);
        if (!string.IsNullOrWhiteSpace(query.ModuleKey)) rows = rows.Where(item => item.ModuleKey == query.ModuleKey);
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim();
            rows = rows.Where(item => item.Details.Contains(search) || (item.ActorName ?? "").Contains(search));
        }

        var total = rows.Count();
        var items = rows.OrderByDescending(item => item.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(item => new SiteUserAuditEventDto(item.Id, item.SiteUserId, item.ActorName, item.EventType, item.ModuleKey, item.Details, item.BeforeJson, item.AfterJson, item.CreatedAt, item.IpAddress))
            .ToArray();
        var changed = dbContext.SiteUserAuditEvents.Count(item => item.SiteUserId == id && item.CreatedAt >= DateTimeOffset.UtcNow.AddDays(-30) && item.EventType.Contains("permissions"));
        return new SiteUserAuditPageDto(items, page, pageSize, total, changed);
    }

    public SiteUserSessionsDto GetUserSessions(Guid id, string? currentToken)
    {
        var now = DateTimeOffset.UtcNow;
        var currentHash = string.IsNullOrWhiteSpace(currentToken) ? null : EfAuthSessionService.HashToken(currentToken);
        var sessions = dbContext.SiteUserSessions.AsNoTracking()
            .Where(item => item.SiteUserId == id && item.RevokedAt == null && item.ExpiresAt > now)
            .OrderByDescending(item => item.LastSeenAt ?? item.CreatedAt)
            .Select(item => new SiteUserSessionDto(item.Id, item.CreatedAt, item.LastSeenAt, item.ExpiresAt, item.IpAddress, item.UserAgent, currentHash != null && item.TokenHash == currentHash))
            .ToArray();
        return new SiteUserSessionsDto(sessions, sessions.Length);
    }

    private IQueryable<SiteUserEntity> QueryUsers() =>
        dbContext.SiteUsers.AsSplitQuery()
            .Include(user => user.Roles).ThenInclude(userRole => userRole.Role).ThenInclude(role => role.Permissions).ThenInclude(rolePermission => rolePermission.Permission)
            .Include(user => user.Permissions).ThenInclude(userPermission => userPermission.Permission)
            .Include(user => user.AccessScopes);

    private IReadOnlyList<RoleEntity> ResolveRoles(IReadOnlyList<string>? roleCodes)
    {
        var codes = NormalizeCodes(roleCodes);
        return codes.Length == 0 ? [] : dbContext.Roles.Where(role => codes.Contains(role.Code.ToLower())).Include(role => role.Permissions).ThenInclude(item => item.Permission).ToArray();
    }

    private IReadOnlyList<PermissionEntity> ResolvePermissions(IReadOnlyList<string>? permissionCodes)
    {
        var codes = NormalizeCodes(permissionCodes);
        return codes.Length == 0 ? [] : dbContext.Permissions.Where(permission => codes.Contains(permission.Code.ToLower())).ToArray();
    }

    private List<PermissionOverrideDto> BuildCreationOverrides(CreateSiteUserDto request, IReadOnlyList<RoleEntity> roles)
    {
        var explicitOverrides = NormalizeOverrides(request.PermissionOverrides, request.PermissionCodes);
        var selectedModules = (request.EnabledModuleKeys ?? []).Select(value => value.Trim()).Where(value => value.Length > 0).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var roleCodes = roles.SelectMany(role => role.Permissions.Select(item => item.Permission.Code)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var result = explicitOverrides.ToDictionary(item => item.Code, StringComparer.OrdinalIgnoreCase);

        foreach (var permission in dbContext.Permissions.AsNoTracking().OrderBy(item => item.DisplayOrder))
        {
            if (selectedModules.Contains(permission.ModuleKey))
            {
                if (permission.IsViewDefault && !roleCodes.Contains(permission.Code) && !result.ContainsKey(permission.Code))
                    result[permission.Code] = new PermissionOverrideDto(permission.Code, "allow");
            }
            else if (roleCodes.Contains(permission.Code) && !result.ContainsKey(permission.Code))
            {
                result[permission.Code] = new PermissionOverrideDto(permission.Code, "deny");
            }
        }

        return result.Values.ToList();
    }

    private void ReplacePermissionOverrides(SiteUserEntity user, IReadOnlyList<PermissionOverrideDto> overrides)
    {
        user.Permissions.Clear();
        foreach (var item in overrides)
        {
            var permission = ResolvePermissions([item.Code]).FirstOrDefault();
            if (permission is null) continue;
            user.Permissions.Add(new SiteUserPermissionEntity
            {
                SiteUserId = user.Id,
                PermissionId = permission.Id,
                Permission = permission,
                Effect = NormalizeEffect(item.Effect)
            });
        }
    }

    private IReadOnlyList<PermissionOverrideDto> NormalizeOverrides(IReadOnlyList<PermissionOverrideDto>? overrides, IReadOnlyList<string>? legacyCodes)
    {
        if (overrides is not null) return overrides.Select(item => new PermissionOverrideDto(item.Code.Trim().ToLowerInvariant(), NormalizeEffect(item.Effect))).ToList();
        return (legacyCodes ?? []).Select(code => new PermissionOverrideDto(code, "allow")).ToList();
    }

    private IReadOnlyDictionary<string, string[]> ValidatePermissionOverrides(IReadOnlyList<PermissionOverrideDto>? overrides, IReadOnlyList<string>? legacyCodes)
    {
        var normalized = NormalizeOverrides(overrides, legacyCodes);
        var codes = normalized.Select(item => item.Code).ToArray();
        var knownCodes = dbContext.Permissions.Where(permission => codes.Contains(permission.Code.ToLower())).Select(permission => permission.Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var unknownCodes = codes.Where(code => !knownCodes.Contains(code)).ToArray();
        if (unknownCodes.Length > 0) return Error("permissionOverrides", $"Unknown permissions: {string.Join(", ", unknownCodes)}");
        if (normalized.Any(item => !AllowedEffects.Contains(item.Effect, StringComparer.OrdinalIgnoreCase))) return Error("permissionOverrides", "Permission effect must be allow or deny");
        return EmptyErrors();
    }

    private IReadOnlyDictionary<string, string[]> ValidateRoleCodes(IReadOnlyList<string>? roleCodes)
    {
        var codes = NormalizeCodes(roleCodes);
        if (codes.Length == 0) return Error("roleCodes", "Choose at least one role");
        var knownCodes = dbContext.Roles.Where(role => codes.Contains(role.Code.ToLower())).Select(role => role.Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var unknownCodes = codes.Where(code => !knownCodes.Contains(code)).ToArray();
        return unknownCodes.Length == 0 ? EmptyErrors() : Error("roleCodes", $"Unknown roles: {string.Join(", ", unknownCodes)}");
    }

    private IReadOnlyDictionary<string, string[]> ValidateScopes(IReadOnlyList<SiteUserAccessScopeUpsertDto>? scopes)
    {
        var rows = scopes ?? [];
        if (rows.Count > 500) return Error("scopes", "Cannot save more than 500 scopes");
        if (rows.Any(scope => !NormalizeScopeValue(scope.ModuleKey).Equals("emu", StringComparison.OrdinalIgnoreCase) || !NormalizeScopeValue(scope.ScopeType).Equals("emu_section", StringComparison.OrdinalIgnoreCase)))
            return Error("scopes", "Only EMU section scopes are supported");
        if (rows.Any(scope => scope.ScopeId == Guid.Empty)) return Error("scopes", "Every scope must contain a section id");
        var ids = rows.Select(scope => scope.ScopeId).ToArray();
        if (ids.Length != ids.Distinct().Count()) return Error("scopes", "Duplicate sections are not allowed");
        var known = dbContext.EmuWorkSections.Where(section => ids.Contains(section.Id)).Select(section => section.Id).ToHashSet();
        return ids.Any(id => !known.Contains(id)) ? Error("scopes", "Unknown EMU section") : EmptyErrors();
    }

    private IReadOnlyDictionary<string, string[]> ValidateCreateRequest(CreateSiteUserDto request)
    {
        var errors = ValidateValues(request.Login, request.DisplayName, request.RoleCodes, request.Status);
        if (!string.IsNullOrWhiteSpace(request.InitialPassword) && request.InitialPassword.Trim().Length < 8)
            errors = Merge(errors, Error("initialPassword", "Password must be at least 8 characters"));
        return errors;
    }

    private static IReadOnlyDictionary<string, string[]> ValidateUpdateRequest(UpdateSiteUserDto request) =>
        ValidateValues(request.Login, request.DisplayName, request.RoleCodes, request.Status);

    private static IReadOnlyDictionary<string, string[]> ValidateValues(string login, string displayName, IReadOnlyList<string>? roleCodes, string status)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(login)) errors["login"] = ["Enter a login"];
        else if (login.Trim().Length > 120) errors["login"] = ["Login must not exceed 120 characters"];
        if (string.IsNullOrWhiteSpace(displayName)) errors["displayName"] = ["Enter a display name"];
        if (roleCodes is null || roleCodes.Count == 0) errors["roleCodes"] = ["Choose a role"];
        if (!AllowedStatuses.Contains(NormalizeStatus(status), StringComparer.OrdinalIgnoreCase)) errors["status"] = ["Invalid user status"];
        return errors;
    }

    private static IReadOnlyDictionary<string, string[]> Merge(IReadOnlyDictionary<string, string[]> left, IReadOnlyDictionary<string, string[]> right) =>
        left.Concat(right).ToDictionary(item => item.Key, item => item.Value, StringComparer.OrdinalIgnoreCase);

    private static string[] NormalizeCodes(IReadOnlyList<string>? codes) =>
        (codes ?? []).Select(code => code.Trim()).Where(code => code.Length > 0).Select(code => code.ToLowerInvariant()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

    private static string NormalizeStatus(string value) => value.Trim().ToLowerInvariant();

    private static string NormalizeScopeValue(string value) => value.Trim().ToLowerInvariant();

    private static string NormalizeEffect(string value) => value.Trim().ToLowerInvariant();

    private static bool IsAdminRole(RoleEntity role) => role.Code.Equals("admin", StringComparison.OrdinalIgnoreCase);

    private bool WouldRemoveLastActiveAdmin(SiteUserEntity user, bool nextIsActiveAdmin) =>
        user.Status.Equals("active", StringComparison.OrdinalIgnoreCase) && user.Roles.Any(item => IsAdminRole(item.Role)) && !nextIsActiveAdmin && IsOnlyActiveAdmin(user);

    private bool IsOnlyActiveAdmin(SiteUserEntity user) =>
        dbContext.SiteUsers.Count(item => item.Status == "active" && item.Roles.Any(role => role.Role.Code == "admin")) <= 1;

    private bool WouldRemoveLastAdminPermission(SiteUserEntity user) =>
        user.Status.Equals("active", StringComparison.OrdinalIgnoreCase) && IsOnlyActiveAdmin(user) && !MapUser(user).Permissions.Contains("site_users.write", StringComparer.OrdinalIgnoreCase);

    private void AddAudit(Guid userId, SiteUserActorContext? actor, string eventType, string? moduleKey, string details, object? before, object? after)
    {
        dbContext.SiteUserAuditEvents.Add(new SiteUserAuditEventEntity
        {
            Id = Guid.NewGuid(),
            SiteUserId = userId,
            ActorUserId = actor?.UserId,
            ActorName = actor?.DisplayName,
            EventType = eventType,
            ModuleKey = moduleKey,
            Details = details,
            BeforeJson = before is null ? null : JsonSerializer.Serialize(before),
            AfterJson = after is null ? null : JsonSerializer.Serialize(after),
            CreatedAt = DateTimeOffset.UtcNow,
            IpAddress = actor?.IpAddress,
            UserAgent = actor?.UserAgent
        });
    }

    private SiteUserAccessDto MapUserAccess(SiteUserEntity user)
    {
        var mapped = MapUser(user);
        var scopes = user.AccessScopes.OrderBy(scope => scope.SortOrder).ThenBy(scope => ResolveScopeName(scope)).Select(MapScope).ToArray();
        var mode = mapped.Permissions.Contains("emu.scope.all", StringComparer.OrdinalIgnoreCase) ? "all" : "selected";
        return new SiteUserAccessDto(user.Id, mapped.Roles, mapped.DirectPermissions, mapped.Permissions, scopes, mapped.PermissionOverrides, mode);
    }

    private SiteUserAccessScopeDto MapScope(SiteUserAccessScopeEntity scope) =>
        new(scope.Id, scope.ModuleKey, scope.ScopeType, scope.ScopeId, ResolveScopeName(scope), scope.SortOrder);

    private string ResolveScopeName(SiteUserAccessScopeEntity scope) =>
        scope.ModuleKey.Equals("emu", StringComparison.OrdinalIgnoreCase) && scope.ScopeType.Equals("emu_section", StringComparison.OrdinalIgnoreCase)
            ? dbContext.EmuWorkSections.AsNoTracking().Where(section => section.Id == scope.ScopeId).Select(section => section.Name).FirstOrDefault() ?? scope.ScopeId.ToString()
            : scope.ScopeId.ToString();

    private static SiteUserDto MapUser(SiteUserEntity user)
    {
        var rolePermissions = user.Roles.SelectMany(item => item.Role.Permissions).Select(item => item.Permission.Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var overrides = user.Permissions.Select(item => new PermissionOverrideDto(item.Permission.Code, item.Effect)).ToArray();
        var allowed = overrides.Where(item => item.Effect == "allow").Select(item => item.Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var denied = overrides.Where(item => item.Effect == "deny").Select(item => item.Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
        rolePermissions.UnionWith(allowed);
        rolePermissions.ExceptWith(denied);
        return new SiteUserDto(
            user.Id,
            user.Login,
            user.DisplayName,
            user.Roles.Select(item => item.Role.Code).Distinct(StringComparer.OrdinalIgnoreCase).Order().ToArray(),
            user.Status,
            user.CreatedAt,
            user.LastLoginAt,
            rolePermissions.Order().ToArray(),
            allowed.Order().ToArray(),
            overrides,
            user.RequirePasswordChange);
    }

    private static PermissionCatalogItemDto MapPermission(PermissionEntity permission) =>
        new(permission.Code, permission.Name, permission.ModuleKey, permission.Category, permission.IsViewDefault, permission.DisplayOrder);

    private static RoleDto MapRole(RoleEntity role) =>
        new(role.Id, role.Code, role.Name, role.Permissions.Select(item => item.Permission.Code).Distinct(StringComparer.OrdinalIgnoreCase).Order().ToArray());

    private static string CreateTemporaryPassword() => $"Patrol-{Random.Shared.Next(100_000, 999_999)}!";

    private static IReadOnlyDictionary<string, string[]> Error(string key, string message) =>
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase) { [key] = [message] };

    private static IReadOnlyDictionary<string, string[]> EmptyErrors() =>
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
}
