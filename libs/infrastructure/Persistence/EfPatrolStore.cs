using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Caching.Memory;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfPatrolStore(Patrol360DbContext dbContext, IMemoryCache dashboardCache, IPatrolTimeZone patrolTimeZone) :
    IPatrolDashboardQuery,
    IRouteCatalogQuery,
    IEmployeeDirectoryQuery,
    IEmployeeDirectoryService,
    IMobileAccountService,
    IPatrolRequestService,
    IAssignmentService,
    IRouteCatalogService
{
    private static readonly PasswordHasher<MobileAccountEntity> MobilePasswordHasher = new();
    private static readonly string[] EditableMobileAccountStatuses = ["Активен", "Не привязан", "Заблокирован"];
    private static readonly string[] AllowedPatrolPhotoContentTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    private const string DashboardSummaryCacheKey = "patrol.dashboard.summary";
    private const int MaxPatrolPhotoSizeBytes = 10 * 1024 * 1024;
}
