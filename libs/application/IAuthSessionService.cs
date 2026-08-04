using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IAuthSessionService
{
    AuthLoginResult Login(LoginRequestDto request);

    AuthLoginResult Login(LoginRequestDto request, string? ipAddress, string? userAgent) =>
        Login(request);

    SessionUserDto? GetCurrentUser(string accessToken);

    bool Logout(string accessToken);

    AuthChangePasswordResult ChangePassword(string accessToken, ChangePasswordDto request) =>
        new(null, false, new Dictionary<string, string[]> { ["password"] = ["Password change is not available."] });
}

public sealed record AuthLoginResult(
    AuthSessionDto? Session,
    bool Unauthorized,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Session is not null && !Unauthorized && Errors.Count == 0;
}

public sealed record AuthChangePasswordResult(
    AuthSessionDto? Session,
    bool Unauthorized,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Session is not null && !Unauthorized && Errors.Count == 0;
}
