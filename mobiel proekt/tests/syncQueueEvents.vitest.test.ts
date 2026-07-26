import { describe, expect, it, vi } from "vitest";

import { emitSyncEvent, subscribeToSyncEvents } from "@/sync/syncEvents";

describe("sync queue refresh events", () => {
  it("notifies the queue when a sync status changes", () => {
    const reloadQueue = vi.fn();
    const unsubscribe = subscribeToSyncEvents(() => reloadQueue());

    emitSyncEvent({
      acceptedOperationIds: ["operation-1"],
      completedAssignmentIds: []
    });

    unsubscribe();

    expect(reloadQueue).toHaveBeenCalledTimes(1);
  });
});