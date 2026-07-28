const serverTerminalAssignmentStatuses = new Set(["completed", "completedServer", "cancelled", "cancelledServer"]);
const locallyAdvancedAssignmentStatuses = new Set([
  "inProgress",
  "paused",
  "completedLocal",
  "syncing",
  "syncError",
  "authRequired",
  "needsDispatcherDecision",
  "releasePending"
]);

export function resolveRemappedAssignmentStatus(localStatus: string, serverStatus: string) {
  if (serverTerminalAssignmentStatuses.has(serverStatus)) {
    return serverStatus;
  }
  if (locallyAdvancedAssignmentStatuses.has(localStatus)) {
    return localStatus;
  }
  return serverStatus === "assigned" ? localStatus : serverStatus;
}
