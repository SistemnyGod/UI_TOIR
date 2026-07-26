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

export function resolveBootstrapAssignmentStatus(
  localStatus: string | null,
  serverStatus: string,
  hasUnfinishedCommand: boolean
) {
  if (hasUnfinishedCommand && localStatus && localStatusesThatRequirePendingCommand.has(localStatus)) {
    return localStatus;
  }

  return serverStatus;
}