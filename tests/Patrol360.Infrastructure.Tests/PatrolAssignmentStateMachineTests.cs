using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed class PatrolAssignmentStateMachineTests
{
    [Fact]
    public void Patrol_assignment_commands_follow_the_server_state_machine()
    {
        var acceptWaiting = PatrolAssignmentStateMachine.Evaluate(
            "acceptPatrolRequest",
            AssignmentStatusValues.Waiting);
        Assert.Equal(PatrolTransitionKind.Allowed, acceptWaiting.Kind);
        Assert.Equal(AssignmentStatusValues.Accepted, acceptWaiting.TargetStatus);

        var acceptAccepted = PatrolAssignmentStateMachine.Evaluate(
            "acceptPatrolRequest",
            AssignmentStatusValues.Accepted);
        Assert.Equal(PatrolTransitionKind.Duplicate, acceptAccepted.Kind);

        var acceptInProgress = PatrolAssignmentStateMachine.Evaluate(
            "acceptPatrolRequest",
            AssignmentStatusValues.InProgress);
        Assert.Equal(PatrolTransitionKind.Conflict, acceptInProgress.Kind);

        var acceptPaused = PatrolAssignmentStateMachine.Evaluate(
            "acceptPatrolRequest",
            AssignmentStatusValues.Paused);
        Assert.Equal(PatrolTransitionKind.Conflict, acceptPaused.Kind);

        var startAccepted = PatrolAssignmentStateMachine.Evaluate(
            "startPatrolAssignment",
            AssignmentStatusValues.Accepted);
        Assert.Equal(PatrolTransitionKind.Allowed, startAccepted.Kind);
        Assert.Equal(AssignmentStatusValues.InProgress, startAccepted.TargetStatus);

        var startInProgress = PatrolAssignmentStateMachine.Evaluate(
            "startPatrolAssignment",
            AssignmentStatusValues.InProgress);
        Assert.Equal(PatrolTransitionKind.Duplicate, startInProgress.Kind);

        var startPaused = PatrolAssignmentStateMachine.Evaluate(
            "startPatrolAssignment",
            AssignmentStatusValues.Paused);
        Assert.Equal(PatrolTransitionKind.Conflict, startPaused.Kind);

        Assert.Equal(
            PatrolTransitionKind.Allowed,
            PatrolAssignmentStateMachine.Evaluate(
                "pausePatrolAssignment",
                AssignmentStatusValues.InProgress).Kind);
        Assert.Equal(
            PatrolTransitionKind.Duplicate,
            PatrolAssignmentStateMachine.Evaluate(
                "pausePatrolAssignment",
                AssignmentStatusValues.Paused).Kind);
        Assert.Equal(
            PatrolTransitionKind.Allowed,
            PatrolAssignmentStateMachine.Evaluate(
                "resumePatrolAssignment",
                AssignmentStatusValues.Paused).Kind);
        Assert.Equal(
            PatrolTransitionKind.Duplicate,
            PatrolAssignmentStateMachine.Evaluate(
                "resumePatrolAssignment",
                AssignmentStatusValues.InProgress).Kind);
        Assert.Equal(
            PatrolTransitionKind.Allowed,
            PatrolAssignmentStateMachine.Evaluate(
                "handoffPatrolAssignment",
                AssignmentStatusValues.InProgress).Kind);
        Assert.Equal(
            PatrolTransitionKind.Duplicate,
            PatrolAssignmentStateMachine.Evaluate(
                "handoffPatrolAssignment",
                AssignmentStatusValues.NeedsDispatcherDecision).Kind);
        Assert.Equal(
            PatrolTransitionKind.Rejected,
            PatrolAssignmentStateMachine.Evaluate(
                "handoffPatrolAssignment",
                AssignmentStatusValues.Accepted).Kind);
    }
}
