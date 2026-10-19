import { beforeEach, describe, expect, it } from "vitest";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";
beforeEach(() => { Object.defineProperty(window, "localStorage", { configurable: true, value: createMemoryStorage() }); Object.defineProperty(window, "sessionStorage", { configurable: true, value: createMemoryStorage() }); });

describe("PPE issue mock API", () => {
  it("returns norm candidates in confirmation priority order", async () => {
    const repository = createMockInventoryRepository();
    const [employees, settings, items] = await Promise.all([
      repository.getEmployees({ pageSize: 100 }),
      repository.getSettings(),
      repository.getPpeItems({ pageSize: 100 }),
    ]);
    const employee = employees.rows.find((candidate) =>
      settings.positionNorms.some((norm) => norm.positionName.trim().toLocaleLowerCase("ru") === candidate.position.trim().toLocaleLowerCase("ru")),
    );
    const catalogItem = items.rows.find((candidate) => candidate.itemKind === "ppe" && candidate.isActive);
    expect(employee).toBeTruthy();
    expect(catalogItem).toBeTruthy();

    const candidates = await repository.getPpeNormCandidates(catalogItem!.id, {
      employeeId: employee!.id,
      issueDate: "2026-07-23",
      quantity: 1,
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]).toEqual(expect.objectContaining({
      availableQuantity: expect.any(Number),
      normRowId: expect.any(String),
      status: expect.stringMatching(/confirmed_mapping|candidate|incompatible|limit_exhausted/),
    }));
  });

  it("persists draft requisites and creates issue rows atomically", async () => {
    const repository = createMockInventoryRepository();
    const [employees, settings] = await Promise.all([
      repository.getEmployees({ pageSize: 100 }),
      repository.getSettings(),
    ]);
    const employee = employees.rows.find((candidate) =>
      settings.positionNorms.some((norm) => norm.positionName.trim().toLocaleLowerCase("ru") === candidate.position.trim().toLocaleLowerCase("ru")),
    );
    expect(employee).toBeTruthy();

    const draft = await repository.createPpeCardDraft({
      basis: "Приказ № 100",
      cardDate: "2026-07-23T12:00:00.000Z",
      employeeId: employee!.id,
      issueType: "planned",
      responsibleName: "Иванов И.И.",
      source: "active_norms",
    });
    const updated = await repository.updatePpeCardDraft(draft.id, {
      basis: "Приказ № 101",
      cardDate: "2026-07-24T12:00:00.000Z",
      employeeDetails: draft.employeeDetails,
      expectedVersion: draft.version ?? 0,
      issueType: "replacement",
      responsibleName: "Петров П.П.",
    });
    expect(updated).toMatchObject({
      basis: "Приказ № 101",
      issueType: "replacement",
      responsibleName: "Петров П.П.",
    });

    const rows = (updated.normRows ?? []).filter((row) => row.rowType === "item" && row.mappedItemId).slice(0, 2);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const before = await repository.getPpeHistory({ employeeId: employee!.id, pageSize: 100 });
    await expect(repository.createPpeIssueBatch(updated.id, {
      expectedVersion: updated.version ?? 0,
      lines: [
        {
          cardNormRowId: rows[0].id,
          issueMethod: "personal",
          issuedAt: "2026-07-24T12:00:00.000Z",
          itemId: rows[0].mappedItemId!,
          quantity: 1,
          unitPriceMinor: null,
        },
        {
          cardNormRowId: rows[1].id,
          issueMethod: "personal",
          issuedAt: "2026-07-24T12:00:00.000Z",
          itemId: "missing-item",
          quantity: 1,
          unitPriceMinor: null,
        },
      ],
    })).rejects.toThrow();
    const afterFailure = await repository.getPpeHistory({ employeeId: employee!.id, pageSize: 100 });
    expect(afterFailure.total).toBe(before.total);

    const batchPayload = {
      expectedVersion: updated.version ?? 0,
      idempotencyKey: "ppe-batch-test-key",
      lines: rows.map((row) => ({
        cardNormRowId: row.id,
        issueMethod: "personal" as const,
        issuedAt: "2026-07-24T12:00:00.000Z",
        itemId: row.mappedItemId!,
        quantity: 1,
        unitPriceMinor: null,
      })),
    };
    const saved = await repository.createPpeIssueBatch(updated.id, batchPayload);
    expect(saved.lines.filter((line) => line.status === "issued")).toHaveLength(rows.length);
    const repeated = await repository.createPpeIssueBatch(updated.id, batchPayload);
    expect(repeated.lines).toHaveLength(saved.lines.length);
  });
});
function createMemoryStorage(): Storage {
  const rows = new Map<string, string>();
  return {
    clear: () => rows.clear(),
    getItem: (key: string) => rows.get(key) ?? null,
    key: (index: number) => Array.from(rows.keys())[index] ?? null,
    get length() { return rows.size; },
    removeItem: (key: string) => { rows.delete(key); },
    setItem: (key: string, value: string) => { rows.set(key, value); },
  };
}
