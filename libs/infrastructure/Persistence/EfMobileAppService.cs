using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService(
    Patrol360DbContext dbContext,
    IEmuWorkService emuWorkService,
    IMobileDiagnosticReportStore diagnosticReportStore,
    IPatrolTimeZone patrolTimeZone) : IMobileAppService, IMobileSessionAuthenticationService
{
    private static readonly TimeSpan AccessTokenLifetime = TimeSpan.FromHours(8);
    // A mobile refresh credential represents an enrolled device and remains
    // valid until logout, device revocation or account blocking. Access tokens
    // stay short lived and are renewed whenever the phone can reach the API.
    private static readonly DateTimeOffset PersistentDeviceSessionExpiry = DateTimeOffset.MaxValue;
    private const long MaxMobilePhotoBytes = 6 * 1024 * 1024;
    private const long MaxMobileVideoBytes = 30 * 1024 * 1024;
    private const string MobileEmuDoneStatus = "Завершил";
    private static readonly PasswordHasher<MobileAccountEntity> PasswordHasher = new();
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly string[] PilotRouteNames = ["Обход печей", "Помол"];
}
