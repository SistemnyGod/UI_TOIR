using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfAuthSessionService(Patrol360DbContext dbContext) : IAuthSessionService
{
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromHours(8);
    private static readonly TimeSpan RememberedSessionLifetime = TimeSpan.FromDays(7);
    private readonly PasswordHasher<SiteUserEntity> passwordHasher = new();

    public AuthLoginResult Login(LoginRequestDto request)
    {
        var errors = ValidateLoginRequest(request);
        if (errors.Count > 0)
        {
            return new AuthLoginResult(null, false, errors);
        }

        var normalizedLogin = NormalizeLogin(request.Login);
        var user = dbContext.SiteUsers
            .Include(siteUser => siteUser.Roles)
                .ThenInclude(userRole => userRole.Role)
                    .ThenInclude(role => role.Permissions)
                        .ThenInclude(rolePermission => rolePermission.Permission)
            .FirstOrDefault(siteUser => siteUser.NormalizedLogin == normalizedLogin);

        if (user is null || !IsActive(user))
        {
            return UnauthorizedResult();
        }

        var verification = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
        {
            return UnauthorizedResult();
        }

        var now = DateTimeOffset.UtcNow;
        var accessToken = GenerateAccessToken();
        var session = new SiteUserSessionEntity
        {
            Id = Guid.NewGuid(),
            SiteUserId = user.Id,
            TokenHash = HashToken(accessToken),
            CreatedAt = now,
            ExpiresAt = now.Add(request.RememberMe ? RememberedSessionLifetime : SessionLifetime)
        };

        user.LastLoginAt = now;
        dbContext.SiteUserSessions.Add(session);
        dbContext.SaveChanges();

        return new AuthLoginResult(
            new AuthSessionDto(MapUser(user), accessToken, session.ExpiresAt),
            false,
            EmptyErrors());
    }

    public SessionUserDto? GetCurrentUser(string accessToken)
    {
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return null;
        }

        var tokenHash = HashToken(accessToken);
        var now = DateTimeOffset.UtcNow;
        var session = dbContext.SiteUserSessions
            .Include(item => item.SiteUser)
                .ThenInclude(siteUser => siteUser.Roles)
                    .ThenInclude(userRole => userRole.Role)
                        .ThenInclude(role => role.Permissions)
                            .ThenInclude(rolePermission => rolePermission.Permission)
            .FirstOrDefault(item => item.TokenHash == tokenHash);

        if (session is null || session.RevokedAt is not null || session.ExpiresAt <= now || !IsActive(session.SiteUser))
        {
            return null;
        }

        return MapUser(session.SiteUser);
    }

    public bool Logout(string accessToken)
    {
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return false;
        }

        var tokenHash = HashToken(accessToken);
        var session = dbContext.SiteUserSessions.FirstOrDefault(item => item.TokenHash == tokenHash);
        if (session is null || session.RevokedAt is not null)
        {
            return false;
        }

        session.RevokedAt = DateTimeOffset.UtcNow;
        dbContext.SaveChanges();
        return true;
    }

    private static IReadOnlyDictionary<string, string[]> ValidateLoginRequest(LoginRequestDto request)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

        if (string.IsNullOrWhiteSpace(request.Login))
        {
            errors["login"] = ["Укажите логин"];
        }

        if (string.IsNullOrWhiteSpace(request.Password))
        {
            errors["password"] = ["Укажите пароль"];
        }

        return errors;
    }

    private static AuthLoginResult UnauthorizedResult() =>
        new(null, true, EmptyErrors());

    private static IReadOnlyDictionary<string, string[]> EmptyErrors() =>
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

    private static SessionUserDto MapUser(SiteUserEntity user)
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

        return new SessionUserDto(user.Id, user.Login, user.DisplayName, roles, permissions);
    }

    private static bool IsActive(SiteUserEntity user) =>
        string.Equals(user.Status, "active", StringComparison.OrdinalIgnoreCase);

    internal static string NormalizeLogin(string login) =>
        login.Trim().ToUpperInvariant();

    internal static string HashToken(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    internal static string GenerateAccessToken()
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }
}
