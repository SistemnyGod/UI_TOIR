import { describe, expect, it, vi } from "vitest";

vi.mock("@/core/environments", () => ({ currentContourId: "test" }));

import { insertOutboxCommandInTransaction } from "@/db/repositories/outboxSql";

function command(dependencies: string[] = []) {
  return {
    clientOperationId: "new",
    ownerUserId: "owner",
    commandType: "savePatrolPointResult" as const,
    entityType: "patrolPoint" as const,
    entityLocalId: "point",
    payload: { dependencies },
    createdAtLocal: "2026-09-22T00:00:00.000Z",
    attemptCount: 0,
    status: "pending" as const
  };
}

describe("outbox dependency graph", () => {
  it("does not read the queue for a command without dependencies", async () => {
    const executor = { getAllAsync: vi.fn(), getFirstAsync: vi.fn().mockResolvedValue({ nextSequence: 1 }), runAsync: vi.fn() };
    await insertOutboxCommandInTransaction(executor, command());
    expect(executor.getAllAsync).not.toHaveBeenCalled();
  });

  it("reads only reachable dependency batches and rejects broken payloads", async () => {
    const executor = {
      getAllAsync: vi.fn().mockResolvedValue([{ id: "previous", payloadJson: "{" }]),
      getFirstAsync: vi.fn().mockResolvedValue({ nextSequence: 1 }),
      runAsync: vi.fn()
    };
    await expect(insertOutboxCommandInTransaction(executor, command(["previous"]))).rejects.toThrow("Не удалось проверить зависимости");
    expect(executor.getAllAsync.mock.calls[0][0]).toContain("client_operation_id IN");
  });

  it("rejects a reachable dependency list with non-string identifiers", async () => {
    const executor = {
      getAllAsync: vi.fn().mockResolvedValue([{ id: "previous", payloadJson: JSON.stringify({ dependencies: [42] }) }]),
      getFirstAsync: vi.fn().mockResolvedValue({ nextSequence: 1 }),
      runAsync: vi.fn()
    };
    await expect(insertOutboxCommandInTransaction(executor, command(["previous"]))).rejects.toThrow("повреждённые зависимости");
  });
});
