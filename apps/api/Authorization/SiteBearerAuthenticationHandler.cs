using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using Patrol360.Application;

namespace Patrol360.Api.Authorization;

public sealed class SiteBearerAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IAuthSessionService authSessionService)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "SiteBearer";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (Context.GetEndpoint()?.Metadata.GetMetadata<IAllowAnonymous>() is not null)
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var accessToken = BearerTokenReader.Read(Request);
        if (accessToken is null)
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var user = authSessionService.GetCurrentUser(accessToken);
        if (user is null)
        {
            return Task.FromResult(AuthenticateResult.Fail("Bearer session is invalid or expired."));
        }

        if (user.RequirePasswordChange && !IsPasswordRecoveryRoute(Request.Path))
        {
            return Task.FromResult(AuthenticateResult.Fail("Password change is required."));
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Login),
            new("require_password_change", user.RequirePasswordChange ? "true" : "false"),
        };
        claims.AddRange(user.Roles.Select(role => new Claim(ClaimTypes.Role, role)));
        claims.AddRange(user.Permissions.Select(permission => new Claim("permission", permission)));

        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName));
        var ticket = new AuthenticationTicket(principal, SchemeName);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }

    private static bool IsPasswordRecoveryRoute(PathString path) =>
        path.StartsWithSegments("/api/v1/auth/me")
        || path.StartsWithSegments("/api/v1/auth/change-password")
        || path.StartsWithSegments("/api/v1/auth/logout");
}
