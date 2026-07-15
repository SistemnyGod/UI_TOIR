using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IAssignmentService
{
    IReadOnlyList<AssignmentDto> GetAssignments(int page = 1, int pageSize = 100, AssignmentFilterDto? filter = null);

    AssignmentSettingsDto GetSettings();

    AssignmentSettingsDto UpdateSettings(UpdateAssignmentSettingsDto request);

    CreateAssignmentResult Create(CreateAssignmentDto request);

    AssignmentCommandResult? Start(Guid id);

    AssignmentCommandResult? Cancel(Guid id);

    AssignmentCommandResult? Complete(Guid id, CompleteAssignmentDto? request = null);
}

public sealed record CreateAssignmentResult(
    AssignmentDto? Assignment,
    IReadOnlyDictionary<string, string[]> Errors,
    CreateAssignmentOutcome Outcome = CreateAssignmentOutcome.Created)
{
    public bool Succeeded => Assignment is not null && Errors.Count == 0;
}

public enum CreateAssignmentOutcome
{
    Created,
    Reused,
    Conflict,
    ValidationFailed
}

public sealed record AssignmentCommandResult(
    AssignmentDto Assignment,
    bool Changed,
    string Message,
    IReadOnlyDictionary<string, string[]>? Errors = null)
{
    public bool Succeeded => Errors is null || Errors.Count == 0;
}
