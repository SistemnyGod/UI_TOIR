using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IMobileSyncAdminService
{
    IReadOnlyList<MobileSyncConflictListItemDto> GetConflicts();

    IReadOnlyList<MobileDeviceHealthDto> GetDeviceHealth();

    MobileSyncConflictDetailDto? GetConflict(Guid mobileAccountId, string clientOperationId);

    MobileSyncConflictResolutionDto? SetResolution(
        Guid mobileAccountId,
        string clientOperationId,
        MobileSyncConflictResolutionRequestDto request,
        string actor);
}
