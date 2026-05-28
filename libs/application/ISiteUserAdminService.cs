using Patrol360.Contracts;

namespace Patrol360.Application;

public interface ISiteUserAdminService
{
    IReadOnlyList<SiteUserDto> GetUsers();

    SiteUserDto? GetUser(Guid id);

    IReadOnlyList<RoleDto> GetRoles();

    CreateSiteUserResult CreateUser(CreateSiteUserDto request);

    UpdateSiteUserResult UpdateUser(Guid id, UpdateSiteUserDto request);

    UpdateSiteUserResult BlockUser(Guid id);

    UpdateSiteUserResult UnblockUser(Guid id);

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
