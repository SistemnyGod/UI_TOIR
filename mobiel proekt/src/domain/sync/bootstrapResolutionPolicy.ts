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

  const localRank = localStatus ? monotonicLifecycleRank.get(localStatus) : undefined;
  const serverRank = monotonicLifecycleRank.get(serverStatus);
  if (localRank !== undefined && localRank >= 2 && serverRank !== undefined && localRank > serverRank) {
    return localStatus as string;
  }

  return serverStatus;
}