import { useState } from "react";
import type {
  CreateInventoryPpeCardDto,
  InventoryEmployeeDto,
  InventoryPpeCardLineDto,
  InventorySettingsDto,
} from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import {
  formatDate,
  getDefaultDueDate,
  parsePositiveQuantity,
  printDataFromDetail,
  saveApiFile,
  statusLabel,
  toItemFromPpeLine,
} from "./ppeCommon";
import type {
  ApiFile,
  PickerLineInput,
  PpeDrawer,
  PpeWizardLine,
  PpeWizardState,
  PrintData,
  PrintMode,
} from "./ppeTypes";

type UsePpeRepositoryActionsOptions = {
  employees: InventoryEmployeeDto[];
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
  setSelectedCardId: (id: string) => void;
  settings?: InventorySettingsDto;
};

export function usePpeRepositoryActions({
  employees,
  onNotify,
  onReload,
  setSelectedCardId,
  settings,
}: UsePpeRepositoryActionsOptions) {
  const inventoryRepository = useInventoryRepository();
  const [drawer, setDrawer] = useState<PpeDrawer>(null);
  const [busyAction, setBusyAction] = useState("");
  const [wizard, setWizard] = useState<PpeWizardState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preview, setPreview] = useState<{ data: PrintData; mode: PrintMode } | null>(null);

  const wizardEmployee = wizard ? employees.find((employee) => employee.id === wizard.employeeId) ?? null : null;

  async function openCard(cardId: string) {
    try {
      setBusyAction(`open-${cardId}`);
      const [detail, history] = await Promise.all([
        inventoryRepository.getPpeCard(cardId),
        inventoryRepository.getPpeCardHistory(cardId, { pageSize: 50 }),
      ]);
      setDrawer({ type: "card", detail, history: history.rows });
    } catch (loadError) {
      onNotify(loadError instanceof Error ? loadError.message : "Не удалось открыть карточку СИЗ");
    } finally {
      setBusyAction("");
    }
  }

  async function openCardLinesHistory(cardId: string) {
    try {
      setBusyAction(`history-${cardId}`);
      const history = await inventoryRepository.getPpeCardLinesHistory(cardId, { pageSize: 75 });
      setDrawer({ type: "history", title: "История строк СИЗ", rows: history.rows });
    } catch (loadError) {
      onNotify(loadError instanceof Error ? loadError.message : "Не удалось открыть историю строк СИЗ");
    } finally {
      setBusyAction("");
    }
  }

  async function openLineHistory(cardId: string, line: InventoryPpeCardLineDto) {
    try {
      setBusyAction(`line-history-${line.id}`);
      const history = await inventoryRepository.getPpeCardLineHistory(cardId, line.id, { pageSize: 50 });
      setDrawer({
        type: "history",
        title: `История строки: ${line.itemName}`,
        rows: history.rows,
        meta: [
          ["Позиция", line.itemName],
          ["Склад", line.warehouseName || "Не указан"],
          ["Статус", statusLabel(line.status)],
        ],
      });
    } catch (loadError) {
      onNotify(loadError instanceof Error ? loadError.message : "Не удалось открыть историю строки СИЗ");
    } finally {
      setBusyAction("");
    }
  }

  async function updateLineStatus(cardId: string, lineId: string, status: string) {
    try {
      setBusyAction(`${status}-${lineId}`);
      await inventoryRepository.updatePpeCardLineStatus(cardId, lineId, { status });
      onNotify("Статус строки СИЗ обновлен");
      await onReload();
      await openCard(cardId);
    } catch (updateError) {
      onNotify(updateError instanceof Error ? updateError.message : "Не удалось обновить строку СИЗ");
    } finally {
      setBusyAction("");
    }
  }

  async function downloadFile(action: () => Promise<ApiFile>) {
    try {
      saveApiFile(await action());
    } catch (downloadError) {
      onNotify(downloadError instanceof Error ? downloadError.message : "Не удалось сформировать файл");
    }
  }

  function openCreateWizard() {
    setWizard({
      comment: "",
      employeeId: employees[0]?.id ?? "",
      lines: [],
      mode: "create",
      step: 0,
    });
    setPickerOpen(false);
  }

  async function openEditWizard(cardId: string) {
    try {
      setBusyAction(`edit-${cardId}`);
      const detail = await inventoryRepository.getPpeCard(cardId);
      setWizard({
        cardId: detail.id,
        comment: "",
        employeeId: detail.employeeId,
        lines: detail.lines.map((line) => ({
          dueAt: line.dueAt?.slice(0, 10) ?? "",
          existingLineId: line.id,
          item: toItemFromPpeLine(line),
          normPoint: "",
          priceText: "0",
          quantityText: String(line.quantity),
          status: line.status,
          warehouseId: line.warehouseId ?? "",
        })),
        mode: "edit",
        step: 0,
      });
      setPickerOpen(false);
    } catch (loadError) {
      onNotify(loadError instanceof Error ? loadError.message : "Не удалось открыть карточку для редактирования");
    } finally {
      setBusyAction("");
    }
  }

  function addWizardLines(nextLines: PickerLineInput[]) {
    if (!wizard) return;

    const currentIds = new Set(wizard.lines.map((line) => line.item.id));
    const defaultWarehouseId =
      settings?.warehouses.find((row) => row.isActive)?.id ?? settings?.warehouses[0]?.id ?? "";
    const mappedLines = nextLines
      .filter((line) => !currentIds.has(line.item.id))
      .map((line) => ({
        dueAt: line.dueAt ?? getDefaultDueDate(line.item.defaultLifeMonths),
        item: line.item,
        normPoint: line.normPoint ?? line.item.normItemName ?? "",
        priceText:
          line.priceText ??
          String(line.item.defaultUnitPriceMinor ? Math.round(line.item.defaultUnitPriceMinor / 100) : 0),
        quantityText: line.quantityText ?? "1",
        status: line.status ?? "not_issued",
        warehouseId: defaultWarehouseId,
      }));

    if (!mappedLines.length) {
      setPickerOpen(false);
      return;
    }

    const today = new Date().toISOString();
    setWizard({
      ...wizard,
      comment: wizard.comment || `Карточка СИЗ от ${formatDate(today, "date")}`,
      lines: [...wizard.lines, ...mappedLines],
      step: Math.max(wizard.step, 2),
    });
    setPickerOpen(false);
  }

  function patchWizardLine(index: number, patch: Partial<PpeWizardLine>) {
    if (!wizard) return;
    setWizard({
      ...wizard,
      lines: wizard.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    });
  }

  async function saveWizard(confirmIssue: boolean) {
    if (!wizard) return;

    if (!wizard.employeeId) {
      onNotify("Выберите сотрудника для карточки СИЗ");
      return;
    }

    try {
      setBusyAction("wizard-save");
      const payload: CreateInventoryPpeCardDto = { comment: wizard.comment || null, employeeId: wizard.employeeId };
      const card = wizard.cardId
        ? await inventoryRepository.getPpeCard(wizard.cardId)
        : await inventoryRepository.createPpeCard(payload);

      const createdLines: InventoryPpeCardLineDto[] = [];
      for (const line of wizard.lines.filter((row) => !row.existingLineId)) {
        const quantity = parsePositiveQuantity(line.quantityText);
        if (!quantity) continue;

        const created = await inventoryRepository.addPpeCardLine(card.id, {
          comment: line.normPoint || null,
          dueAt: line.dueAt || null,
          itemId: line.item.id,
          quantity,
          status: line.status,
          warehouseId: line.warehouseId || null,
        });
        createdLines.push(created);
      }

      if (confirmIssue) {
        for (const line of createdLines.filter((row) => row.warehouseId && row.status !== "issued")) {
          await inventoryRepository.updatePpeCardLineStatus(card.id, line.id, { status: "issued" });
        }
      }

      onNotify(wizard.cardId ? "Карточка СИЗ обновлена" : "Карточка СИЗ создана");
      setSelectedCardId(card.id);
      setWizard(null);
      setPickerOpen(false);
      await onReload();
      await openCard(card.id);
    } catch (saveError) {
      onNotify(saveError instanceof Error ? saveError.message : "Не удалось сохранить карточку СИЗ");
    } finally {
      setBusyAction("");
    }
  }

  async function previewSavedCard(cardId: string, mode: PrintMode) {
    try {
      setBusyAction(`preview-${cardId}`);
      const detail = await inventoryRepository.getPpeCard(cardId);
      setPreview({ data: printDataFromDetail(detail), mode });
    } catch (previewError) {
      onNotify(previewError instanceof Error ? previewError.message : "Не удалось открыть предпросмотр");
    } finally {
      setBusyAction("");
    }
  }

  return {
    addWizardLines,
    busyAction,
    downloadFile,
    drawer,
    openCard,
    openCardLinesHistory,
    openCreateWizard,
    openEditWizard,
    openLineHistory,
    patchWizardLine,
    pickerOpen,
    preview,
    previewSavedCard,
    saveWizard,
    setDrawer,
    setPickerOpen,
    setPreview,
    setWizard,
    updateLineStatus,
    wizard,
    wizardEmployee,
  };
}

