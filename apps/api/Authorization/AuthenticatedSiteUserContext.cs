using Patrol360.Contracts;

namespace Patrol360.Api.Authorization;

/// <summary>
/// Holds the user that was validated by the site bearer handler for the current request.
/// It is deliberately scoped: sessions and permissions are revalidated on every request.
/// </summary>
public interface IAuthenticatedSiteUserContext
{
    SessionUserDto? User { get; set; }
}

public sealed class AuthenticatedSiteUserContext : IAuthenticatedSiteUserContext
{
    public SessionUserDto? User { get; set; }
}
