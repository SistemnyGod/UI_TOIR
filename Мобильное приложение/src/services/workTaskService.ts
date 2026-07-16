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

export async function loadWorkItemsOfflineFirst() {
  try {
    return await syncWorkItems();
  } catch {
    return listLocalWorkItems();
  }
}

export async function loadWorkTasksOfflineFirst() {
  try {
    return await syncWorkTasks();
  } catch {
    return listLocalWorkTasks();
  }
}
