using Patrol360.Contracts;

namespace Patrol360.Application;

public interface ISiteUserAdminService
{
    IReadOnlyList<SiteUserDto> GetUsers();

    SiteUserDto? GetUser(Guid id);

    IReadOnlyList<RoleDto> GetRoles();

    SiteUserAccessDto? GetUserAccess(Guid id);

    CreateSiteUserResult CreateUser(CreateSiteUserDto request);

    UpdateSiteUserResult UpdateUser(Guid id, UpdateSiteUserDto request);

    UpdateSiteUserResult BlockUser(Guid id);

    UpdateSiteUserResult UnblockUser(Guid id);

    UpdateSiteUserResult UpdateUserPermissions(Guid id, UpdateSiteUserPermissionsDto request);

    UpdateSiteUserScopesResult UpdateUserScopes(Guid id, UpdateSiteUserScopesDto request, Guid? actorUserId = null);

    ResetSiteUserPasswordDto? ResetPassword(Guid id);
}

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
