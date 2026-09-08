using Patrol360.Contracts;

namespace Patrol360.Application;

public interface ISiteUserAdminService
{
    IReadOnlyList<SiteUserDto> GetUsers();

    SiteUserListResponseDto GetUsersQuery(SiteUserQuery query) =>
        BuildPage(GetUsers(), query);

    SiteUserDto? GetUser(Guid id);

    IReadOnlyList<RoleDto> GetRoles();

    SiteUserAccessCatalogDto GetAccessCatalog() =>
        new(GetRoles(), []);

    SiteUserAccessDto? GetUserAccess(Guid id);

    CreateSiteUserResult CreateUser(CreateSiteUserDto request);

    CreateSiteUserResult CreateUserAsActor(CreateSiteUserDto request, SiteUserActorContext? actor) =>
        CreateUser(request);

    UpdateSiteUserResult UpdateUser(Guid id, UpdateSiteUserDto request);

    UpdateSiteUserResult UpdateUserAsActor(Guid id, UpdateSiteUserDto request, SiteUserActorContext? actor) =>
        UpdateUser(id, request);

    UpdateSiteUserResult BlockUser(Guid id);

    UpdateSiteUserResult BlockUserAsActor(Guid id, SiteUserActorContext? actor) =>
        BlockUser(id);

    UpdateSiteUserResult UnblockUser(Guid id);

    UpdateSiteUserResult UnblockUserAsActor(Guid id, SiteUserActorContext? actor) =>
        UnblockUser(id);

    UpdateSiteUserResult UpdateUserPermissions(Guid id, UpdateSiteUserPermissionsDto request);

    UpdateSiteUserResult UpdateUserPermissionOverrides(Guid id, UpdateSiteUserPermissionsDto request, SiteUserActorContext? actor) =>
        UpdateUserPermissions(id, request);

    UpdateSiteUserScopesResult UpdateUserScopes(Guid id, UpdateSiteUserScopesDto request, Guid? actorUserId = null);

    UpdateSiteUserScopesResult UpdateUserScopesAsActor(Guid id, UpdateSiteUserScopesDto request, SiteUserActorContext? actor) =>
        UpdateUserScopes(id, request, actor?.UserId);

    ResetSiteUserPasswordDto? ResetPassword(Guid id);

    ResetSiteUserPasswordDto? ResetPasswordAsActor(Guid id, SiteUserActorContext? actor) =>
        ResetPassword(id);

    SiteUserAuditPageDto GetUserAudit(Guid id, SiteUserAuditQuery query) =>
        new([], query.Page, query.PageSize, 0, 0);

    SiteUserSessionsDto GetUserSessions(Guid id, string? currentToken) =>
        new([], 0);

    private static SiteUserListResponseDto BuildPage(IReadOnlyList<SiteUserDto> users, SiteUserQuery query)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, 100);
        var filtered = users.Where(user =>
            (string.IsNullOrWhiteSpace(query.Search)
                || user.Login.Contains(query.Search, StringComparison.OrdinalIgnoreCase)
                || user.DisplayName.Contains(query.Search, StringComparison.OrdinalIgnoreCase))
            && (string.IsNullOrWhiteSpace(query.Role) || user.Roles.Contains(query.Role, StringComparer.OrdinalIgnoreCase))
            && (string.IsNullOrWhiteSpace(query.Status) || user.Status.Equals(query.Status, StringComparison.OrdinalIgnoreCase)))
            .ToArray();
        return new(filtered.Skip((page - 1) * pageSize).Take(pageSize).ToArray(), page, pageSize, filtered.Length);
    }
}

public sealed record SiteUserQuery(
    string? Search = null,
    string? Role = null,
    string? Status = null,
    int Page = 1,
    int PageSize = 8);

public sealed record SiteUserAuditQuery(
    DateTimeOffset? DateFrom = null,
    DateTimeOffset? DateTo = null,
    string? EventType = null,
    string? ModuleKey = null,
    string? Search = null,
    int Page = 1,
    int PageSize = 10);

public sealed record SiteUserActorContext(
    Guid? UserId,
    string? DisplayName,
    string? IpAddress = null,
    string? UserAgent = null);

public sealed record CreateSiteUserResult(
    SiteUserCreatedDto? Created,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Created is not null && Errors.Count == 0;
}

public sealed record UpdateSiteUserResult(
    SiteUserDto? User,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => User is not null && Errors.Count == 0;
}

public sealed record UpdateSiteUserScopesResult(
    SiteUserAccessDto? Access,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Access is not null && Errors.Count == 0;
}
