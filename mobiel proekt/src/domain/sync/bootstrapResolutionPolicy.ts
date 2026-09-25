const localStatusesThatRequirePendingCommand = new Set([
  "inProgress",
  "paused",
  "completedLocal",
  "syncing",
  "syncError",
  "authRequired",
  "needsDispatcherDecision",
  "releasePending"
]);

const serverTerminalStatuses = new Set([
  "completed",
  "completedServer",
  "cancelled",
  "cancelledServer"
]);

const monotonicLifecycleRank = new Map<string, number>([
  ["assigned", 0],
  ["available", 0],
  ["accepted", 1],
  ["inProgress", 2],
  ["paused", 3],
  ["completedLocal", 4]
]);

export function resolveBootstrapAssignmentStatus(
  localStatus: string | null,
  serverStatus: string,
  hasUnfinishedCommand: boolean
) {
  if (serverTerminalStatuses.has(serverStatus)) {
    return serverStatus;
  }

  if (hasUnfinishedCommand && localStatus && localStatusesThatRequirePendingCommand.has(localStatus)) {
    return localStatus;
  }

  // Pause/resume are reversible states. They must follow the server's current
  // version once there is no local command waiting to be acknowledged; treating
  // pause as a higher lifecycle rank leaves a device paused after another
  // device resumed the same assignment.
  if (!hasUnfinishedCommand
    && (localStatus === "paused" || localStatus === "inProgress")
    && (serverStatus === "paused" || serverStatus === "inProgress")) {
    return serverStatus;
  }

  const localRank = localStatus ? monotonicLifecycleRank.get(localStatus) : undefined;
  const serverRank = monotonicLifecycleRank.get(serverStatus);
  if (localRank !== undefined && localRank >= 2 && serverRank !== undefined && localRank > serverRank) {
    return localStatus as string;
  }

  return serverStatus;
}
