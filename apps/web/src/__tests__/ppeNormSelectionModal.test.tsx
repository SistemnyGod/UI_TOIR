import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { InventoryItemDto, InventoryPpeNormCandidateDto } from "../api/contracts";
import { PpeNormSelectionModal } from "../features/inventory/ppe/PpeNormSelectionModal";

const item = {
  id: "item-winter-boots",
  name: "Ботинки кожаные зимние ВЛО",
  unit: "пара",
} as InventoryItemDto;

const candidate = {
  normRowId: "norm-winter-boots",
  normSetId: "set-1",
  normSetVersion: 1,
  normItemName: "Сапоги или ботинки утепленные для пониженных температур",
  normPoint: "п. 4.7",
  quantity: 1,
  quantityText: "1 пара",
  issuePeriodText: "1 пара на 1,5 года",
  lifeMonths: 18,
  alreadyIssuedQuantity: 0,
  availableQuantity: 1,
  mappingId: null,
  previouslyConfirmedCount: 0,
  status: "candidate",
  reasons: ["Совпадает вид СИЗ: обувь"],
  warnings: [],
} satisfies InventoryPpeNormCandidateDto;

describe("PPE norm selection modal", () => {
  it("keeps additional issue fields out of the ordinary norm flow until explicitly requested", async () => {
    const user = userEvent.setup();
    render(<PpeNormSelectionModal candidates={[candidate]} error="" item={item} loading={false} onAddAdditional={vi.fn()} onClose={vi.fn()} onConfirm={vi.fn()} quantity={1} sizeText="42" />);

    expect(screen.getByText("Возможное соответствие")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Основание дополнительной выдачи/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Подходящей нормы нет — оформить дополнительную выдачу" }));

    expect(screen.getByRole("textbox", { name: /Основание дополнительной выдачи/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Подтвердить дополнительную выдачу" })).toBeDisabled();
  });
});
