using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IAuthSessionService
{
    AuthLoginResult Login(LoginRequestDto request);

    SessionUserDto? GetCurrentUser(string accessToken);

    bool Logout(string accessToken);
}

public sealed record AuthLoginResult(
    AuthSessionDto? Session,
    bool Unauthorized,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Session is not null && !Unauthorized && Errors.Count == 0;
}
