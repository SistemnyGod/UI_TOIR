import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { readLegacyIssueDrafts } from "../features/inventory/ppe/legacyIssueDraftRecovery";
const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
beforeEach(() => {
  const rows = new Map<string, string>();
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    clear: () => rows.clear(), getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => rows.set(key, value),
    key: (index: number) => [...rows.keys()][index] ?? null, get length() { return rows.size; },
  } });
});
afterEach(() => { if (descriptor) Object.defineProperty(window, "localStorage", descriptor); });
describe("old PPE browser draft recovery", () => {
  it("exports only the owner's raw drafts without changing or issuing them", () => {
    window.localStorage.clear();
    const prefix = "patrol360.inventory.ppe.issue-workflow.v3.";
    window.localStorage.setItem(prefix + "owner.card", "broken or historical JSON");
    window.localStorage.setItem(prefix + "other.card", "other person's data");
    window.localStorage.setItem(prefix + "owner.active", prefix + "other.card");
    window.localStorage.setItem(prefix + "owner.employee", "employee-id");
    window.localStorage.setItem("patrol360.inventory.ppe.issue-workflow.v2", "unknown owner");
    expect(readLegacyIssueDrafts("owner")).toEqual({ [prefix + "owner.card"]: "broken or historical JSON" });
    expect(window.localStorage.length).toBe(5);
  });
  it("does not read unscoped drafts or prevent opening server documents when storage fails", () => {
    expect(readLegacyIssueDrafts("")).toEqual({});
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => { throw new Error("Unavailable"); } });
    expect(readLegacyIssueDrafts("owner")).toEqual({});
  });
});
