import { getWorkItemsV2, getWorkTasks } from "@/api/emuApi";
import { listLocalWorkItems, listLocalWorkTasks, saveWorkItems, saveWorkTasks } from "@/db/repositories/workTaskRepository";

export async function syncWorkTasks() {
  const tasks = await getWorkTasks();
  await saveWorkTasks(tasks);
  return tasks;
}

export async function syncWorkItems() {
  const items = await getWorkItemsV2();
  await saveWorkItems(items);
  return items;
}

export async function loadWorkItemsOfflineFirst(onRefreshed?: () => void | Promise<void>) {
  const localItems = await listLocalWorkItems();
  void syncWorkItems()
    .then(() => onRefreshed?.())
    .catch(() => undefined);
  return localItems;
}

export async function loadWorkTasksOfflineFirst(onRefreshed?: () => void | Promise<void>) {
  const localTasks = await listLocalWorkTasks();
  void syncWorkTasks()
    .then(() => onRefreshed?.())
    .catch(() => undefined);
  return localTasks;
}
