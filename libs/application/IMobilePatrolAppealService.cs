using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IMobilePatrolAppealService
{
    IReadOnlyList<MobilePatrolAppealDto> ListPatrolAppeals(int page, int pageSize, string? status);
    MobilePatrolAppealDto? ResolvePatrolAppeal(Guid id, ResolveMobilePatrolAppealDto request, Guid? actorId, string actorName);
}
