using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IAssignmentService
{
    IReadOnlyList<AssignmentDto> GetAssignments();

    CreateAssignmentResult Create(CreateAssignmentDto request);

    AssignmentCommandResult? Start(Guid id);

    AssignmentCommandResult? Cancel(Guid id);

    AssignmentCommandResult? Complete(Guid id, CompleteAssignmentDto? request = null);
}

public sealed record CreateAssignmentResult(
    AssignmentDto? Assignment,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Assignment is not null && Errors.Count == 0;
}

public sealed record AssignmentCommandResult(
    AssignmentDto Assignment,
    bool Changed,
    string Message,
    IReadOnlyDictionary<string, string[]>? Errors = null)
{
    public bool Succeeded => Errors is null || Errors.Count == 0;
}
