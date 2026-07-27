namespace Patrol360.Infrastructure.Persistence;

internal enum PatrolTransitionKind
{
    Allowed,
    Duplicate,
    Rejected,
    Conflict,
}

internal readonly record struct PatrolTransitionDecision(
    PatrolTransitionKind Kind,
    string? TargetStatus,
    string Message);

internal static class PatrolAssignmentStateMachine
{
    public static PatrolTransitionDecision Evaluate(string commandType, string? status)
    {
        var normalizedCommand = commandType.Trim();
        var currentStatus = status?.Trim() ?? string.Empty;

        return normalizedCommand switch
        {
            "acceptPatrolRequest" => EvaluateAccept(currentStatus),
            "startPatrolAssignment" => EvaluateStart(currentStatus),
            "pausePatrolAssignment" => EvaluatePause(currentStatus),
            "resumePatrolAssignment" => EvaluateResume(currentStatus),
            "handoffPatrolAssignment" => EvaluateHandoff(currentStatus),
            _ => new(
                PatrolTransitionKind.Rejected,
                null,
                "Unsupported patrol assignment state transition."),
        };
    }

    private static PatrolTransitionDecision EvaluateAccept(string status)
    {
        if (IsOneOf(status, AssignmentStatusValues.Assigned, AssignmentStatusValues.Waiting))
        {
            return new(
                PatrolTransitionKind.Allowed,
                AssignmentStatusValues.Accepted,
                "Patrol request accepted.");
        }

        if (status.Equals(AssignmentStatusValues.Accepted, StringComparison.Ordinal))
        {
            return new(
                PatrolTransitionKind.Duplicate,
                AssignmentStatusValues.Accepted,
                "Patrol request was already accepted.");
        }

        if (IsOneOf(
                status,
                AssignmentStatusValues.InProgress,
                AssignmentStatusValues.Paused,
                AssignmentStatusValues.NeedsDispatcherDecision,
                AssignmentStatusValues.Completed,
                AssignmentStatusValues.Cancelled))
        {
            return new(
                PatrolTransitionKind.Conflict,
                null,
                "Patrol request cannot be accepted from its current state.");
        }

        return new(
            PatrolTransitionKind.Rejected,
            null,
            "Patrol request is not available for acceptance.");
    }

    private static PatrolTransitionDecision EvaluateStart(string status)
    {
        if (status.Equals(AssignmentStatusValues.Accepted, StringComparison.Ordinal))
        {
            return new(
                PatrolTransitionKind.Allowed,
                AssignmentStatusValues.InProgress,
                "Patrol assignment started.");
        }

        if (status.Equals(AssignmentStatusValues.InProgress, StringComparison.Ordinal))
        {
            return new(
                PatrolTransitionKind.Duplicate,
                AssignmentStatusValues.InProgress,
                "Patrol assignment was already started.");
        }

        if (IsOneOf(
                status,
                AssignmentStatusValues.Paused,
                AssignmentStatusValues.NeedsDispatcherDecision,
                AssignmentStatusValues.Completed,
                AssignmentStatusValues.Cancelled))
        {
            return new(
                PatrolTransitionKind.Conflict,
                null,
                "Patrol assignment cannot be started from its current state.");
        }

        return new(
            PatrolTransitionKind.Rejected,
            null,
            "Only an accepted patrol assignment can be started.");
    }

    private static PatrolTransitionDecision EvaluatePause(string status)
    {
        if (status.Equals(AssignmentStatusValues.InProgress, StringComparison.Ordinal))
        {
            return new(
                PatrolTransitionKind.Allowed,
                AssignmentStatusValues.Paused,
                "Patrol assignment paused.");
        }

        if (status.Equals(AssignmentStatusValues.Paused, StringComparison.Ordinal))
        {
            return new(
                PatrolTransitionKind.Duplicate,
                AssignmentStatusValues.Paused,
                "Patrol assignment was already paused.");
        }

        if (IsOneOf(
                status,
                AssignmentStatusValues.NeedsDispatcherDecision,
                AssignmentStatusValues.Completed,
                AssignmentStatusValues.Cancelled))
        {
            return new(
                PatrolTransitionKind.Conflict,
                null,
                "Patrol assignment cannot be paused from its current state.");
        }

        return new(
            PatrolTransitionKind.Rejected,
            null,
            "Only an in-progress patrol assignment can be paused.");
    }

    private static PatrolTransitionDecision EvaluateResume(string status)
    {
        if (status.Equals(AssignmentStatusValues.Paused, StringComparison.Ordinal))
        {
            return new(
                PatrolTransitionKind.Allowed,
                AssignmentStatusValues.InProgress,
                "Patrol assignment resumed.");
        }

        if (status.Equals(AssignmentStatusValues.InProgress, StringComparison.Ordinal))
        {
            return new(
                PatrolTransitionKind.Duplicate,
                AssignmentStatusValues.InProgress,
                "Patrol assignment was already resumed.");
        }

        if (IsOneOf(
                status,
                AssignmentStatusValues.NeedsDispatcherDecision,
                AssignmentStatusValues.Completed,
                AssignmentStatusValues.Cancelled))
        {
            return new(
                PatrolTransitionKind.Conflict,
                null,
                "Patrol assignment cannot be resumed from its current state.");
        }

        return new(
            PatrolTransitionKind.Rejected,
            null,
            "Only a paused patrol assignment can be resumed.");
    }

    private static PatrolTransitionDecision EvaluateHandoff(string status)
    {
        if (status.Equals(AssignmentStatusValues.InProgress, StringComparison.Ordinal))
        {
            return new(
                PatrolTransitionKind.Allowed,
                AssignmentStatusValues.NeedsDispatcherDecision,
                "Patrol assignment sent to dispatcher.");
        }

        if (status.Equals(AssignmentStatusValues.NeedsDispatcherDecision, StringComparison.Ordinal))
        {
            return new(
                PatrolTransitionKind.Duplicate,
                AssignmentStatusValues.NeedsDispatcherDecision,
                "Patrol assignment was already sent to dispatcher.");
        }

        if (IsOneOf(
                status,
                AssignmentStatusValues.Completed,
                AssignmentStatusValues.Cancelled))
        {
            return new(
                PatrolTransitionKind.Conflict,
                null,
                "Patrol assignment cannot be handed off from its current state.");
        }

        return new(
            PatrolTransitionKind.Rejected,
            null,
            "Only an in-progress patrol assignment can be handed off.");
    }

    private static bool IsOneOf(string value, params string[] expected)
    {
        foreach (var candidate in expected)
        {
            if (value.Equals(candidate, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }
}
