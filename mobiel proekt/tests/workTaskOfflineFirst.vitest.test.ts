vi.mock("@/auth/tokenStorage", () => ({ getStoredOwnerUserId: async () => "test-owner" }));
vi.mock("@/core/environments", () => ({ currentContourId: "test" }));
vi.mock("@/auth/dataOwnerContext", () => ({ captureDataOwnerContext: async () => ({ ownerUserId: "test-owner", contourId: "test" }) }));
vi.mock("@/db/database", () => ({ getDatabase: async () => ({ getFirstAsync: async () => ({ paging: 0 }) }) }));
vi.mock("@/api/mobileApi", () => ({ getWorkItemsPage: vi.fn() }));
vi.mock("@/db/repositories/patrolContextRepository", () => ({ getPatrolDeviceContext: async () => ({ employeeId: null, assignmentId: null }) }));
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkTasks: vi.fn(),
  getWorkItemsV2: vi.fn(),
  listLocalWorkTasks: vi.fn(),
  saveWorkTasks: vi.fn(),
  listLocalWorkItems: vi.fn(),
  listLocalWorkItemsPage: vi.fn(),
  saveWorkItems: vi.fn(),
  logMobileError: vi.fn()
}));

vi.mock("@/api/emuApi", () => ({
  getWorkTasks: mocks.getWorkTasks,
  getWorkItemsV2: mocks.getWorkItemsV2,
  normalizeWorkItems: (items: unknown[]) => items
}));

vi.mock("@/db/repositories/workTaskRepository", () => ({
  listLocalWorkTasks: mocks.listLocalWorkTasks,
  saveWorkTasks: mocks.saveWorkTasks,
  listLocalWorkItems: mocks.listLocalWorkItems,
  listLocalWorkItemsPage: mocks.listLocalWorkItemsPage,
  saveWorkItems: mocks.saveWorkItems
}));

vi.mock("@/services/mobileErrorReporter", () => ({
  logMobileError: mocks.logMobileError
}));

import { loadWorkItemsOfflineFirst, loadWorkTasksOfflineFirst } from "@/services/workTaskService";

describe("EMU offline-first loading", () => {
  it("keeps local items and reports a failed background refresh", async () => {
    const localItems = [{ itemId: "local-item", title: "Локальная работа" }];
    const refreshError = new Error("server unavailable");
    mocks.listLocalWorkItems.mockResolvedValue(localItems);
    mocks.listLocalWorkItemsPage.mockResolvedValue({ items: localItems, nextCursor: null });
    mocks.getWorkItemsV2.mockRejectedValue(refreshError);
    const onRefreshFailed = vi.fn();

    const result = await loadWorkItemsOfflineFirst(undefined, onRefreshFailed);
    await vi.waitFor(() => expect(onRefreshFailed).toHaveBeenCalledWith(refreshError));

    expect(result).toEqual(localItems);
    expect(mocks.logMobileError).toHaveBeenCalledWith("emu.work-items.refresh.failed", refreshError);
  });

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
