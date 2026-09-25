import { describe, expect, it } from "vitest";
import { addMonths, applyKitTemplate, filterJournal, type KitTemplate } from "../features/inventory/ppe/documentWorkflow";

describe("PPE reference workflow", () => {
  it("clamps a month end and does not change a date-only value by timezone", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-01-31", null)).toBeNull();
    expect(addMonths("2026-01-31", Infinity)).toBeNull();
    expect(addMonths("2026-01-31", 1.5)).toBeNull();
    expect(addMonths("9999-12-31", 12)).toBeNull();
  });
  it("filters documents inclusively and keeps cancelled separate", () => {
    const rows = [{ id: "1", employeeName: "Иванов", status: "confirmed", documentDate: "2026-01-01", department: "Цех", personnelNo: "007", hasOverdue: true }];
    expect(filterJournal(rows, { query: "007", status: "overdue", from: "2026-01-01", to: "2026-01-01", department: "Цех" })).toHaveLength(1);
    expect(filterJournal(rows, { query: "", status: "draft", from: "", to: "", department: "" })).toHaveLength(0);
  });
  it("does not apply a saved kit to an unapproved mapping or another norm", () => {
    const template = { normSetId: "norm", lines: [{ normRowId: "row", itemId: "item", quantity: 1 }] } as KitTemplate;
    expect(() => applyKitTemplate(template, "different", [])).toThrow();
    expect(() => applyKitTemplate(template, "norm", [])).toThrow();
  });
});
