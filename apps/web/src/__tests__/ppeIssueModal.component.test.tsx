import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CreateInventoryPpeIssueDto, InventoryItemDto, InventoryPpeCardNormRowDto } from "../api/contracts";
import { PpeIssueModal } from "../features/inventory/ppe/PpeIssueModal";
import { PpeButton, PpeModalShell } from "../features/inventory/ppe/PpeUi";

const firstItem = {
  id: "item-a",
  name: "Костюм рабочий",
  sku: "SKU-A",
  article: "ART-A",
  brandName: "Техноавиа",
  modelName: "Стандарт",
  defaultUnitPriceMinor: 250000,
  unit: "шт.",
} as InventoryItemDto;

const secondItem = {
  id: "item-b",
  name: "Костюм защитный Профессионал",
  sku: "SKU-B",
  article: "ART-B",
  brandName: "Восток-Сервис",
  modelName: "Профессионал",
  defaultUnitPriceMinor: 310000,
  unit: "шт.",
} as InventoryItemDto;

const normRow = {
  id: "norm-row-1",
  normItemName: "Костюм для защиты от общих производственных загрязнений",
  normPoint: "п. 4560",
  issuePeriodText: "2 года",
  quantity: 1,
  quantityText: "1 шт.",
  brandModelArticle: "",
  defaultUnitPriceMinor: null,
} as InventoryPpeCardNormRowDto;

function IssueHarness({ onSubmit }: { onSubmit: (payload: CreateInventoryPpeIssueDto) => Promise<void> }) {
  const [open, setOpen] = useState(true);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [item, setItem] = useState<InventoryItemDto>(firstItem);
  const [model, setModel] = useState("Техноавиа · Стандарт · ART-A");
  const [price, setPrice] = useState<number | null>(firstItem.defaultUnitPriceMinor);

  return (
    <>
      {open ? (
        <PpeIssueModal
          initialBrandModelArticle={model}
          initialQuantity={1}
          initialUnitPriceMinor={price}
          item={item}
          normRow={normRow}
          onChooseItem={() => setCatalogOpen(true)}
          onClose={() => setOpen(false)}
          onSubmit={onSubmit}
        />
      ) : null}
      {catalogOpen ? (
        <PpeModalShell
          ariaLabel="Каталог номенклатуры"
          footer={<PpeButton onClick={() => setCatalogOpen(false)}>Отмена</PpeButton>}
          onClose={() => setCatalogOpen(false)}
          title="Выбор номенклатуры"
        >
          <PpeButton
            onClick={() => {
              setItem(secondItem);
              setModel("Восток-Сервис · Профессионал · ART-B");
              setPrice(secondItem.defaultUnitPriceMinor);
              setCatalogOpen(false);
            }}
            variant="primary"
          >
            Выбрать Профессионал
          </PpeButton>
        </PpeModalShell>
      ) : null}
    </>
  );
}

describe("PPE actual issue modal", () => {
  it("keeps the parent dialog open, refreshes selected item data and blocks a future issue date", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    render(<IssueHarness onSubmit={onSubmit} />);

    expect(await screen.findByRole("dialog", { name: "Выдать СИЗ" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Изменить/ }));
    expect(await screen.findByRole("dialog", { name: "Каталог номенклатуры" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Каталог номенклатуры" })).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Выдать СИЗ" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Изменить/ }));
    await user.click(await screen.findByRole("button", { name: "Выбрать Профессионал" }));
    await waitFor(() => expect(screen.getByLabelText("Модель / марка / артикул")).toHaveValue("Восток-Сервис · Профессионал · ART-B"));
    expect(screen.getByLabelText("Цена, ₽")).toHaveValue("3100");

    const issueDate = screen.getByLabelText("Дата выдачи *");
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await user.clear(issueDate);
    await user.type(issueDate, tomorrow);
    expect(screen.getByRole("button", { name: "Подтвердить выдачу" })).toBeDisabled();
    expect(screen.getByText("Дата выдачи не может быть в будущем.")).toBeInTheDocument();

    const today = new Date().toISOString().slice(0, 10);
    await user.clear(issueDate);
    await user.type(issueDate, today);
    await user.click(screen.getByRole("button", { name: "Подтвердить выдачу" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      brandModelArticle: "Восток-Сервис · Профессионал · ART-B",
      itemId: "item-b",
      quantity: 1,
      unitPriceMinor: 310000,
    }));
  });
});
