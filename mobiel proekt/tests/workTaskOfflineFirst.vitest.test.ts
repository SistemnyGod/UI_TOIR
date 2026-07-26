import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkTasks: vi.fn(),
  listLocalWorkTasks: vi.fn(),
  saveWorkTasks: vi.fn()
}));

vi.mock("@/api/emuApi", () => ({
  getWorkTasks: mocks.getWorkTasks,
  getWorkItemsV2: vi.fn()
}));

vi.mock("@/db/repositories/workTaskRepository", () => ({
  listLocalWorkTasks: mocks.listLocalWorkTasks,
  saveWorkTasks: mocks.saveWorkTasks,
  listLocalWorkItems: vi.fn(),
  saveWorkItems: vi.fn()
}));

import { loadWorkTasksOfflineFirst } from "@/services/workTaskService";

describe("EMU offline-first loading", () => {
  it("returns local tasks before a hanging API refresh", async () => {
    const localTasks = [{ taskId: "local-task", title: "Локальная работа" }];
    mocks.listLocalWorkTasks.mockResolvedValue(localTasks);
    mocks.getWorkTasks.mockReturnValue(new Promise(() => undefined));

    const result = await Promise.race([
      loadWorkTasksOfflineFirst(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 100))
    ]);

    expect(result).toEqual(localTasks);
  });
});
