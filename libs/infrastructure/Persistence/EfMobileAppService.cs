using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService(Patrol360DbContext dbContext, IEmuWorkService emuWorkService) : IMobileAppService
{
    private static readonly TimeSpan AccessTokenLifetime = TimeSpan.FromHours(8);
    private static readonly TimeSpan RefreshTokenLifetime = TimeSpan.FromDays(14);
    private const long MaxMobilePhotoBytes = 6 * 1024 * 1024;
    private const long MaxMobileVideoBytes = 30 * 1024 * 1024;
    private const string MobileEmuDoneStatus = "Завершил";
    private static readonly PasswordHasher<MobileAccountEntity> PasswordHasher = new();
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly string[] PilotRouteNames = ["Обход печей", "Помол"];
}
