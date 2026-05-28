import { getWorkTasks } from "@/api/emuApi";
import { listLocalWorkTasks, saveWorkTasks } from "@/db/repositories/workTaskRepository";

export async function syncWorkTasks() {
  const tasks = await getWorkTasks();
  await saveWorkTasks(tasks);
  return tasks;
}

export async function loadWorkTasksOfflineFirst() {
  try {
    return await syncWorkTasks();
  } catch {
    return listLocalWorkTasks();
  }
}
