using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    public MobileAuthResult Login(MobileLoginRequestDto request, string ipAddress)
    {
        var errors = ValidateLoginRequest(request);
        if (errors.Count > 0)
        {
            return new MobileAuthResult(null, false, errors);
        }

        var login = NormalizeLogin(request.Login);
        var account = dbContext.MobileAccounts
            .Include(item => item.EmployeeBindings)
            .FirstOrDefault(item => item.Login == login);

        if (account is null)
        {
            return UnauthorizedResult();
        }

        var verification = PasswordHasher.VerifyHashedPassword(account, account.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
        {
            return UnauthorizedResult();
        }

        if (!IsActiveStatus(account.Status))
        {
            return UnauthorizedResult();
        }

        if (GetBoundEmployeeIds(account).Count == 0)
        {
            return new MobileAuthResult(null, false, new Dictionary<string, string[]>
            {
                ["account"] = ["Мобильный аккаунт не привязан к сотруднику. Привяжите сотрудника в web-панели и повторите вход."],
            });
        }

        var sessionBundle = CreateSession(account, request.DeviceId, request.DeviceName, request.Platform, request.AppVersion, ipAddress);
        var session = sessionBundle.Session;
        account.Session = "Онлайн";
        account.LastSeenAt = session.CreatedAt;
        account.Device = request.DeviceName;
        account.Version = request.AppVersion;

        AddMobileSessionAuditEvent(
            account,
            "mobile_account.login",
            $"Вход с устройства {session.Device}; платформа {session.Platform}; версия {session.AppVersion}.");

        dbContext.SaveChanges();

        return new MobileAuthResult(MapAuthSession(account, session, sessionBundle.AccessToken, sessionBundle.RefreshToken), false, EmptyErrors());
    }

    public MobileAuthResult Refresh(MobileRefreshRequestDto request, string ipAddress)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken) || string.IsNullOrWhiteSpace(request.DeviceId))
        {
            return new MobileAuthResult(null, false, new Dictionary<string, string[]>
            {
                ["refreshToken"] = ["Refresh token is required."],
            });
        }

        var tokenHash = EfAuthSessionService.HashToken(request.RefreshToken);
        var now = DateTimeOffset.UtcNow;
        var oldSession = dbContext.MobileAccountSessions
            .Include(item => item.MobileAccount)
                .ThenInclude(account => account!.EmployeeBindings)
            .FirstOrDefault(item => item.RefreshTokenHash == tokenHash);

        if (oldSession is null
            || oldSession.RevokedAt is not null
            || oldSession.RefreshExpiresAt <= now
            || !string.Equals(oldSession.DeviceId, request.DeviceId, StringComparison.Ordinal)
            || oldSession.MobileAccount is null
            || !CanUseMobileApp(oldSession.MobileAccount))
        {
            return UnauthorizedResult();
        }

        oldSession.RevokedAt = now;
        oldSession.Status = "Завершена";

        var sessionBundle = CreateSession(
            oldSession.MobileAccount,
            oldSession.DeviceId,
            oldSession.Device,
            oldSession.Platform,
            oldSession.AppVersion,
            ipAddress);
        var session = sessionBundle.Session;
        oldSession.MobileAccount.Session = "Онлайн";
        oldSession.MobileAccount.LastSeenAt = now;

        dbContext.SaveChanges();

        return new MobileAuthResult(MapAuthSession(oldSession.MobileAccount, session, sessionBundle.AccessToken, sessionBundle.RefreshToken), false, EmptyErrors());
    }

    public bool Logout(string accessToken)
    {
        var session = FindActiveSession(accessToken);
        if (session is null)
        {
            return false;
        }

        var now = DateTimeOffset.UtcNow;
        session.RevokedAt = now;
        session.PushTokenRevokedAt = now;
        session.Status = "Завершена";
        if (session.MobileAccount is not null)
        {
            session.MobileAccount.LastSeenAt = now;
            session.MobileAccount.Session = dbContext.MobileAccountSessions.Any(item =>
                item.MobileAccountId == session.MobileAccountId
                && item.Id != session.Id
                && item.RevokedAt == null
                && item.ExpiresAt > now)
                    ? "Онлайн"
                    : "Офлайн";
            AddMobileSessionAuditEvent(
                session.MobileAccount,
                "mobile_account.logout",
                $"Выход с устройства {session.Device}; сессия {session.Id}.");
        }
        dbContext.SaveChanges();
        return true;
    }

    private void AddMobileSessionAuditEvent(MobileAccountEntity account, string action, string details)
    {
        dbContext.MobileAccountAuditEvents.Add(new MobileAccountAuditEventEntity
        {
            Id = Guid.NewGuid(),
            MobileAccountId = account.Id,
            Action = action,
            Details = details,
            Actor = account.Login,
            CreatedAt = DateTimeOffset.UtcNow
        });
    }


    private MobileSessionBundle CreateSession(
        MobileAccountEntity account,
        string deviceId,
        string deviceName,
        string platform,
        string appVersion,
        string ipAddress)
    {
        var now = DateTimeOffset.UtcNow;
        var accessToken = EfAuthSessionService.GenerateAccessToken();
        var refreshToken = EfAuthSessionService.GenerateAccessToken();
        var session = new MobileAccountSessionEntity
        {
            Id = Guid.NewGuid(),
            MobileAccountId = account.Id,
            Status = "Онлайн",
            DeviceId = NormalizeOptionalText(deviceId),
            Device = NormalizeOptionalText(deviceName, "Kenshi Armor C1s"),
            Platform = NormalizeOptionalText(platform, "Android"),
            AppVersion = NormalizeOptionalText(appVersion, "0.1.0"),
            IpAddress = NormalizeOptionalText(ipAddress, "-"),
            PushToken = string.Empty,
            TokenHash = EfAuthSessionService.HashToken(accessToken),
            RefreshTokenHash = EfAuthSessionService.HashToken(refreshToken),
            CreatedAt = now,
            ExpiresAt = now.Add(AccessTokenLifetime),
            RefreshExpiresAt = now.Add(RefreshTokenLifetime),
            LastSeenAt = now,
        };

        dbContext.MobileAccountSessions.Add(session);
        return new MobileSessionBundle(session, accessToken, refreshToken);
    }

    private static MobileAuthSessionDto MapAuthSession(
        MobileAccountEntity account,
        MobileAccountSessionEntity session,
        string accessToken,
        string refreshToken) =>
        new(
            MapUser(account),
            MapDevice(account, session),
            accessToken,
            refreshToken,
            session.ExpiresAt,
            session.RefreshExpiresAt);

    private MobileAccountSessionEntity? FindActiveSession(string accessToken)
    {
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return null;
        }

        var tokenHash = EfAuthSessionService.HashToken(accessToken);
        var now = DateTimeOffset.UtcNow;
        var session = dbContext.MobileAccountSessions
            .Include(item => item.MobileAccount)
                .ThenInclude(account => account!.EmployeeBindings)
            .FirstOrDefault(item => item.TokenHash == tokenHash);

        if (session is null
            || session.RevokedAt is not null
            || session.ExpiresAt <= now
            || session.MobileAccount is null
            || !CanUseMobileApp(session.MobileAccount))
        {
            return null;
        }

        return session;
    }
}
