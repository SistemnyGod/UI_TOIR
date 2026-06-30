using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IPatrolRequestService
{
    IReadOnlyList<PatrolRequestDto> GetRequests(int page = 1, int pageSize = 100);

    CreatePatrolRequestResult Create(CreatePatrolRequestDto request);
}

public sealed record CreatePatrolRequestResult(
    PatrolRequestDto? Request,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Request is not null && Errors.Count == 0;
}
