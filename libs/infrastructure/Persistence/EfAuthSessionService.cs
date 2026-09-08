using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
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
    private static readonly TimeSpan LastSeenWriteInterval = TimeSpan.FromMinutes(5);
    private readonly PasswordHasher<SiteUserEntity> passwordHasher = new();

    public AuthLoginResult Login(LoginRequestDto request) =>
        Login(request, null, null);

    public AuthLoginResult Login(LoginRequestDto request, string? ipAddress, string? userAgent)
    {
        var errors = ValidateLoginRequest(request);
        if (errors.Count > 0)
        {
            return new AuthLoginResult(null, false, errors);
        }

        var user = LoadUser(NormalizeLogin(request.Login));
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
            ExpiresAt = now.Add(request.RememberMe ? RememberedSessionLifetime : SessionLifetime),
            IpAddress = ipAddress,
            UserAgent = userAgent,
            LastSeenAt = now
        };

        user.LastLoginAt = now;
        dbContext.SiteUserSessions.Add(session);
        AddAudit(user.Id, user.Id, user.DisplayName, "login", null, "Site user signed in.", null, null, ipAddress, userAgent);
        dbContext.SaveChanges();

        return new AuthLoginResult(
            new AuthSessionDto(MapUser(user), accessToken, session.ExpiresAt, user.RequirePasswordChange),
            false,
            EmptyErrors());
    }

    public SessionUserDto? GetCurrentUser(string accessToken)
    {
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return null;
        }

        var session = LoadSession(HashToken(accessToken));
        var now = DateTimeOffset.UtcNow;
        if (session is null || session.RevokedAt is not null || session.ExpiresAt <= now || !IsActive(session.SiteUser))
        {
            return null;
        }

        if (session.LastSeenAt is null || session.LastSeenAt <= now.Subtract(LastSeenWriteInterval))
        {
            session.LastSeenAt = now;
            dbContext.SaveChanges();
        }

        return MapUser(session.SiteUser);
    }

    public bool Logout(string accessToken)
    {
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return false;
        }

        var session = LoadSession(HashToken(accessToken), includeUser: false);
        if (session is null || session.RevokedAt is not null)
        {
            return false;
        }

        session.RevokedAt = DateTimeOffset.UtcNow;
        AddAudit(
            session.SiteUserId,
            session.SiteUserId,
            session.SiteUser?.DisplayName,
            "logout",
            null,
            "Site user signed out.",
            null,
            null,
            session.IpAddress,
            session.UserAgent);
        dbContext.SaveChanges();
        return true;
    }

    public AuthChangePasswordResult ChangePassword(string accessToken, ChangePasswordDto request)
    {
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return UnauthorizedPasswordResult();
        }

        var errors = ValidateChangePasswordRequest(request);
        if (errors.Count > 0)
        {
            return new AuthChangePasswordResult(null, false, errors);
        }

        var session = LoadSession(HashToken(accessToken));
        var now = DateTimeOffset.UtcNow;
        if (session is null || session.RevokedAt is not null || session.ExpiresAt <= now || !IsActive(session.SiteUser))
        {
            return UnauthorizedPasswordResult();
        }

        var user = session.SiteUser;
        if (passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword) == PasswordVerificationResult.Failed)
        {
            return new AuthChangePasswordResult(null, false, Error("currentPassword", "Current password is incorrect."));
        }

        user.PasswordHash = passwordHasher.HashPassword(user, request.NewPassword);
        user.RequirePasswordChange = false;

        foreach (var otherSession in dbContext.SiteUserSessions.Where(item =>
                     item.SiteUserId == user.Id &&
                     item.Id != session.Id &&
                     item.RevokedAt == null))
        {
            otherSession.RevokedAt = now;
        }

        session.RevokedAt = now;
        var newToken = GenerateAccessToken();
        var replacement = new SiteUserSessionEntity
        {
            Id = Guid.NewGuid(),
            SiteUserId = user.Id,
            TokenHash = HashToken(newToken),
            CreatedAt = now,
            ExpiresAt = now.Add(SessionLifetime),
            IpAddress = session.IpAddress,
            UserAgent = session.UserAgent,
            LastSeenAt = now
        };
        dbContext.SiteUserSessions.Add(replacement);

        AddAudit(
            user.Id,
            user.Id,
            user.DisplayName,
            "password.changed",
            "administration",
            "Password changed. Password values are never stored in audit.",
            null,
            new { RequirePasswordChange = false },
            session.IpAddress,
            session.UserAgent);
        dbContext.SaveChanges();

        return new AuthChangePasswordResult(
            new AuthSessionDto(MapUser(user), newToken, replacement.ExpiresAt, false),
            false,
            EmptyErrors());
    }

    private SiteUserEntity? LoadUser(string normalizedLogin) =>
        dbContext.SiteUsers
            .Include(siteUser => siteUser.Roles)
                .ThenInclude(userRole => userRole.Role)
                    .ThenInclude(role => role.Permissions)
                        .ThenInclude(rolePermission => rolePermission.Permission)
            .Include(siteUser => siteUser.Permissions)
                .ThenInclude(userPermission => userPermission.Permission)
            .AsSplitQuery()
            .FirstOrDefault(siteUser => siteUser.NormalizedLogin == normalizedLogin);

    private SiteUserSessionEntity? LoadSession(string tokenHash, bool includeUser = true)
    {
        var query = dbContext.SiteUserSessions.AsQueryable();
        if (includeUser)
        {
            query = query
                .Include(item => item.SiteUser)
                    .ThenInclude(siteUser => siteUser.Roles)
                        .ThenInclude(userRole => userRole.Role)
                            .ThenInclude(role => role.Permissions)
                                .ThenInclude(rolePermission => rolePermission.Permission)
                .Include(item => item.SiteUser)
                    .ThenInclude(siteUser => siteUser.Permissions)
                        .ThenInclude(userPermission => userPermission.Permission);
            query = query.AsSplitQuery();
        }
        else
        {
            query = query.Include(item => item.SiteUser);
        }

        return query.FirstOrDefault(item => item.TokenHash == tokenHash);
    }

    private static IReadOnlyDictionary<string, string[]> ValidateLoginRequest(LoginRequestDto request)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

        if (string.IsNullOrWhiteSpace(request.Login))
        {
            errors["login"] = ["Login is required."];
        }

        if (string.IsNullOrWhiteSpace(request.Password))
        {
            errors["password"] = ["Password is required."];
        }

        return errors;
    }

    private static IReadOnlyDictionary<string, string[]> ValidateChangePasswordRequest(ChangePasswordDto request)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

        if (string.IsNullOrWhiteSpace(request.CurrentPassword))
        {
            errors["currentPassword"] = ["Current password is required."];
        }

        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 8)
        {
            errors["newPassword"] = ["New password must contain at least 8 characters."];
        }

        if (!string.Equals(request.NewPassword, request.ConfirmPassword, StringComparison.Ordinal))
        {
            errors["confirmPassword"] = ["Passwords do not match."];
        }

        return errors;
    }

    private static AuthLoginResult UnauthorizedResult() =>
        new(null, true, EmptyErrors());

    private static AuthChangePasswordResult UnauthorizedPasswordResult() =>
        new(null, true, EmptyErrors());

    private static IReadOnlyDictionary<string, string[]> EmptyErrors() =>
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

    private static IReadOnlyDictionary<string, string[]> Error(string key, string message) =>
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase) { [key] = [message] };

    private static SessionUserDto MapUser(SiteUserEntity user)
    {
        var roles = user.Roles
            .Select(item => item.Role.Code)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order()
            .ToArray();

        var rolePermissions = user.Roles
            .SelectMany(item => item.Role.Permissions)
            .Select(item => item.Permission.Code)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var allows = user.Permissions
            .Where(item => string.Equals(item.Effect, "allow", StringComparison.OrdinalIgnoreCase))
            .Select(item => item.Permission.Code)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var denies = user.Permissions
            .Where(item => string.Equals(item.Effect, "deny", StringComparison.OrdinalIgnoreCase))
            .Select(item => item.Permission.Code)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        rolePermissions.UnionWith(allows);
        rolePermissions.ExceptWith(denies);

        return new SessionUserDto(
            user.Id,
            user.Login,
            user.DisplayName,
            roles,
            rolePermissions.Order(StringComparer.OrdinalIgnoreCase).ToArray(),
            user.RequirePasswordChange);
    }

    private void AddAudit(
        Guid siteUserId,
        Guid? actorUserId,
        string? actorName,
        string eventType,
        string? moduleKey,
        string details,
        object? before,
        object? after,
        string? ipAddress,
        string? userAgent)
    {
        dbContext.SiteUserAuditEvents.Add(new SiteUserAuditEventEntity
        {
            Id = Guid.NewGuid(),
            SiteUserId = siteUserId,
            ActorUserId = actorUserId,
            ActorName = actorName,
            EventType = eventType,
            ModuleKey = moduleKey,
            Details = details,
            BeforeJson = before is null ? null : JsonSerializer.Serialize(before),
            AfterJson = after is null ? null : JsonSerializer.Serialize(after),
            CreatedAt = DateTimeOffset.UtcNow,
            IpAddress = ipAddress,
            UserAgent = userAgent
        });
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
