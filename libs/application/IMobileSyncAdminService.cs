using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IMobileSyncAdminService
{
    IReadOnlyList<MobileSyncConflictListItemDto> GetConflicts();

    IReadOnlyList<MobileDeviceHealthDto> GetDeviceHealth();

    MobileSyncConflictDetailDto? GetConflict(string clientOperationId);

    MobileSyncConflictResolutionDto? SetResolution(
        string clientOperationId,
        MobileSyncConflictResolutionRequestDto request,
        string actor);
}
