export type SyncQueueAuthItem = {
  status: string;
};

export function countWaitingAuthItems(items: readonly SyncQueueAuthItem[]) {
  return items.reduce((count, item) => count + (item.status === "waiting_auth" ? 1 : 0), 0);
}