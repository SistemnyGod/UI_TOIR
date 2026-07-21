using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using Patrol360.Application;

namespace Patrol360.Api.Authorization;

public sealed class MobileBearerAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IMobileSessionAuthenticationService mobileSessionAuthenticationService)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "MobileBearer";
    public const string PolicyName = "MobileSession";

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

        var session = mobileSessionAuthenticationService.GetCurrentSession(accessToken);
        if (session is null)
        {
            return Task.FromResult(AuthenticateResult.Fail("Mobile bearer session is invalid or expired."));
        }

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, session.MobileAccountId.ToString()),
            new Claim(ClaimTypes.Name, session.Login),
            new Claim("mobile_account_id", session.MobileAccountId.ToString())
        };
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName));
        var ticket = new AuthenticationTicket(principal, SchemeName);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
