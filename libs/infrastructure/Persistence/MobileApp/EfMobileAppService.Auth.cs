using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    public MobileSessionIdentity? GetCurrentSession(string accessToken)
    {
        var session = FindActiveSession(accessToken);
        return session?.MobileAccount is null
            ? null
            : new MobileSessionIdentity(session.MobileAccountId, session.MobileAccount.Login);
    }

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

        var deviceId = NormalizeOptionalText(request.DeviceId);
        var now = DateTimeOffset.UtcNow;
        var previousSessions = dbContext.MobileAccountSessions
            .Where(item => item.MobileAccountId == account.Id
                && item.DeviceId == deviceId
                && item.RevokedAt == null)
            .ToList();
        foreach (var previousSession in previousSessions)
        {
            previousSession.RevokedAt = now;
            previousSession.PushTokenRevokedAt = now;
            previousSession.Status = "Заменена";
        }

        if (previousSessions.Count > 0)
        {
            AddMobileSessionAuditEvent(
                account,
                "mobile_account.session_replaced",
                $"При повторном входе отозваны предыдущие сессии устройства {deviceId}: {previousSessions.Count}.");
        }

        var sessionBundle = CreateSession(account, deviceId, request.DeviceName, request.Platform, request.AppVersion, ipAddress);
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
        var sessionQuery = dbContext.MobileAccountSessions
            .Include(item => item.MobileAccount)
                .ThenInclude(account => account!.EmployeeBindings);
        var oldSession = sessionQuery.FirstOrDefault(item => item.RefreshTokenHash == tokenHash);

        if (oldSession is null)
        {
            var replayedSession = dbContext.MobileAccountSessions
                .Include(item => item.MobileAccount)
                .FirstOrDefault(item => item.PreviousRefreshTokenHash == tokenHash
                    && item.PreviousRefreshTokenValidUntil > now
                    && item.DeviceId == request.DeviceId);
            if (replayedSession is not null)
            {
                if (replayedSession.RevokedAt is not null)
                {
                    return UnauthorizedResult("session_revoked");
                }

                if (replayedSession.RefreshExpiresAt <= now)
                {
                    return UnauthorizedResult("device_reenrollment_required");
                }

                if (replayedSession.MobileAccount is null || !CanUseMobileApp(replayedSession.MobileAccount))
                {
                    return UnauthorizedResult("account_disabled");
                }

                if (!string.IsNullOrWhiteSpace(replayedSession.PreviousAccessTokenProtected)
                    && !string.IsNullOrWhiteSpace(replayedSession.PreviousRefreshTokenProtected))
                {
                    try
                    {
                        var replayAccessToken = RefreshReplayProtector.Unprotect(replayedSession.PreviousAccessTokenProtected);
                        var replayRefreshToken = RefreshReplayProtector.Unprotect(replayedSession.PreviousRefreshTokenProtected);
                        return new MobileAuthResult(
                            MapAuthSession(replayedSession.MobileAccount, replayedSession, replayAccessToken, replayRefreshToken),
                            false,
                            EmptyErrors());
                    }
                    catch (CryptographicException)
                    {
                        // A corrupted replay record is treated as token reuse below.
                    }
                }

                replayedSession.RevokedAt = now;
                replayedSession.PushTokenRevokedAt = now;
                replayedSession.Status = "Завершена";
                AddMobileSessionAuditEvent(
                    replayedSession.MobileAccount,
                    "mobile_account.refresh_token_reuse",
                    $"Не удалось восстановить предыдущий refresh-ответ сессии {replayedSession.Id}; сессия отозвана.");
                dbContext.SaveChanges();
                return UnauthorizedResult("refresh_token_reuse");
            }

            return UnauthorizedResult("device_reenrollment_required");
        }
        if (oldSession.RevokedAt is not null)
        {
            return UnauthorizedResult("session_revoked");
        }

        if (oldSession.RefreshExpiresAt <= now)
        {
            return UnauthorizedResult("device_reenrollment_required");
        }

        if (!string.Equals(oldSession.DeviceId, request.DeviceId, StringComparison.Ordinal))
        {
            return UnauthorizedResult("device_reenrollment_required");
        }

        if (oldSession.MobileAccount is null || !CanUseMobileApp(oldSession.MobileAccount))
        {
            return UnauthorizedResult("account_disabled");
        }

        var accessToken = EfAuthSessionService.GenerateAccessToken();
        var refreshToken = EfAuthSessionService.GenerateAccessToken();
        oldSession.TokenHash = EfAuthSessionService.HashToken(accessToken);
        oldSession.PreviousRefreshTokenHash = oldSession.RefreshTokenHash;
        oldSession.PreviousAccessTokenProtected = RefreshReplayProtector.Protect(accessToken);
        oldSession.PreviousRefreshTokenProtected = RefreshReplayProtector.Protect(refreshToken);
        oldSession.PreviousRefreshTokenValidUntil = now.Add(RefreshReplayDetectionWindow);
        oldSession.RefreshTokenHash = EfAuthSessionService.HashToken(refreshToken);
        oldSession.RefreshGeneration += 1;
        oldSession.ExpiresAt = now.Add(AccessTokenLifetime);
        oldSession.RefreshExpiresAt = now.Add(RefreshSessionLifetime);
        oldSession.LastSeenAt = now;
        oldSession.IpAddress = NormalizeOptionalText(ipAddress, "-");
        oldSession.Status = "Онлайн";
        oldSession.MobileAccount.Session = "Онлайн";
        oldSession.MobileAccount.LastSeenAt = now;

        try
        {
            dbContext.SaveChanges();
        }
        catch (DbUpdateConcurrencyException)
        {
            return UnauthorizedResult("refresh_retry");
        }

        return new MobileAuthResult(
            MapAuthSession(oldSession.MobileAccount, oldSession, accessToken, refreshToken),
            false,
            EmptyErrors());
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
            PreviousRefreshTokenHash = string.Empty,
            PreviousAccessTokenProtected = string.Empty,
            PreviousRefreshTokenProtected = string.Empty,
            PreviousRefreshTokenValidUntil = null,
            RefreshGeneration = 0,
            CreatedAt = now,
            ExpiresAt = now.Add(AccessTokenLifetime),
            RefreshExpiresAt = now.Add(RefreshSessionLifetime),
            LastSeenAt = now,
        };

        dbContext.MobileAccountSessions.Add(session);
        return new MobileSessionBundle(session, accessToken, refreshToken);
    }

    private MobileAuthSessionDto MapAuthSession(
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
            session.RefreshExpiresAt,
            MobileContourId);

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
