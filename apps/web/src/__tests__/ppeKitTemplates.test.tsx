import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";
import { KitTemplates } from "../features/inventory/ppe/KitTemplates";
import type { PpeKitTemplateDto } from "../api/contracts";
import type { DraftLine } from "../features/inventory/ppe/documentWorkflow";
import { ApiError } from "../api/client";

const line: DraftLine = { id: "draft", normRowId: "norm-row", itemId: "item", itemName: "Старое имя", unitSymbol: "шт.", normName: "Каска", approved: true, quantity: 1, lifeMonths: 12, unitPriceMinor: 100, issueDate: "2026-09-14", sizeText: "58", exceptionReason: "", manualControlConfirmed: false };
const template: PpeKitTemplateDto = { id: "template", name: "Комплект", normSetId: "norm-set", ownerUserId: "owner", ownerName: "Владелец", isShared: false, version: 1, updatedAt: "2026-09-14T00:00:00Z", lines: [{ normRowId: "norm-row", itemId: "item", itemName: "Новое имя каталога", unitSymbol: "шт.", quantity: 2, lifeMonths: 18, unitPriceMinor: 200 }] };

beforeEach(() => {
  for (const key of ["localStorage", "sessionStorage"]) {
    const values = new Map<string, string>();
    vi.stubGlobal(key, { getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => values.set(name, value), removeItem: (name: string) => values.delete(name), clear: () => values.clear() });
  }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(repository = createMockInventoryRepository(), onApply = vi.fn()) {
  vi.spyOn(repository, "getPpeKitTemplates").mockResolvedValue([template]);
  render(<InventoryRepositoryProvider value={repository}><KitTemplates userId="owner" canManageShared={false} normSetId="norm-set" rows={[{ id: "norm-row", normItemName: "Каска" } as never]} lines={[line]} date="2026-10-01" onClose={vi.fn()} onApply={onApply} /></InventoryRepositoryProvider>);
  return { repository, onApply };
}

describe("PPE kit templates", () => {
  it("applies the server-validated current catalog values and clears private fields", async () => {
    const { repository, onApply } = setup(); vi.spyOn(repository, "validatePpeKitTemplate").mockResolvedValue(template);
    await userEvent.click(await screen.findByText(/Комплект · 1 позиций/)); await userEvent.click(screen.getByRole("button", { name: "Применить шаблон" }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    const updater = onApply.mock.calls[0][0]; const applied = updater([])[0];
    expect(applied).toMatchObject({ itemName: "Новое имя каталога", quantity: 2, issueDate: "2026-10-01", sizeText: "" });
  });

  it("shows server validation errors without applying", async () => {
    const { repository, onApply } = setup(); vi.spyOn(repository, "validatePpeKitTemplate").mockRejectedValue(new ApiError("Validation failed", 400, { problem: { errors: { mapping: ["Соответствие больше не утверждено"] } } }));
    await userEvent.click(await screen.findByText(/Комплект · 1 позиций/)); await userEvent.click(screen.getByRole("button", { name: "Применить шаблон" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Соответствие больше не утверждено"); expect(onApply).not.toHaveBeenCalled();
  });

  it("previews local contents and remembers a successful import without deleting local data", async () => {
    localStorage.setItem("patrol360.ppe.kits.v1.owner", JSON.stringify([{ id: "legacy", name: "Старый комплект", normSetId: "norm-set", lines: [line] }]));
    const repository = createMockInventoryRepository(); vi.spyOn(repository, "createPpeKitTemplate").mockResolvedValue(template); setup(repository);
    await userEvent.click(await screen.findByText(/Старый комплект · 1 позиций/)); expect(screen.getByText(/Старое имя · 1 шт/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Импортировать этот шаблон" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Импортирован" })).toBeDisabled());
    expect(localStorage.getItem("patrol360.ppe.kits.v1.owner")).toContain("legacy"); expect(sessionStorage.getItem("patrol360.ppe.kits.v1.owner.imported")).toContain("legacy");
  });
});
