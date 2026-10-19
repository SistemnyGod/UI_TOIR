import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentKit } from "../features/inventory/ppe/DocumentKit";
import { createDraftLine } from "../features/inventory/ppe/documentDraft";

const standards = [
  { designation: "ГОСТ 12.4.128-83", name: "Каски защитные" },
  { designation: "ТР ТС 019/2011", name: "О безопасности СИЗ" },
];
const row = {
  id: "row", parentRowId: null, rowType: "item", sortOrder: 1, normItemName: "Защита головы",
  normPoint: "п. 1", issuePeriodText: "1 раз в год", quantity: 1, quantityText: "1 шт.", lifeMonths: 12,
  unitSymbol: "шт.", periodMonths: 12, requirementKey: "requirement", alternativeGroup: "",
  mappings: [{ id: "mapping", normRowId: "row", itemId: "item", itemName: "Каска Альфа", itemSku: "A-1", brandModelArticle: "Альфа", defaultUnitPriceMinor: 1000, isDefault: true, comment: "", isApproved: true, normUnitsPerItem: 1, standards }],
};

describe("PPE standards picker", () => {
  it("copies catalog standards into a draft line before the first save", () => {
    expect(createDraftLine(row as never, row.mappings[0] as never, "2026-09-14", false).standards).toEqual(standards);
  });

  it("shows and searches approved items by standard", async () => {
    const user = userEvent.setup();
    render(<DocumentKit canManageTemplates={false} currentUserId="user" normSetId="norm" rows={[row] as never} allRows={[row] as never} lines={[]} editable date="2026-09-14" onLines={vi.fn()} onAddFullKit={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Добавить СИЗ" }));
    expect(screen.getByText(/ГОСТ 12\.4\.128-83 — Каски защитные/)).toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "Поиск" });
    await user.type(search, "ТР ТС 019/2011");
    expect(screen.getByRole("button", { name: /Каска Альфа/ })).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "несуществующий стандарт");
    expect(screen.queryByRole("button", { name: /Каска Альфа/ })).not.toBeInTheDocument();
  });
});
