using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IPatrolDashboardQuery
{
    DashboardSummaryDto GetSummary();

    IReadOnlyList<AssignmentDto> GetActiveAssignments();
}
