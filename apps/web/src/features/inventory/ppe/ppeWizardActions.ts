import type { CreateInventoryPpeCardDto } from "../../../api/contracts";
import {
  formatDate,
  getDefaultDueDate,
  getDefaultIssuePeriodText,
  itemModelDescription,
  moneyMinorToInput,
  toItemFromPpeLine,
} from "./ppeCommon";
import { createEmptyEmployeeDetails, toApiEmployeeDetails } from "./ppeEmployeeDetailsActions";
import type { OpenPpeCardAction, PpeActionContext } from "./ppeRepositoryActionTypes";
import type { PickerLineInput, PpeWizardLine, PpeWizardState } from "./ppeTypes";
import { buildWizardLinePayloads } from "./ppeWizardPayloads";

type PpeWizardActionContext = PpeActionContext & {
  openCard: OpenPpeCardAction;
  wizard: PpeWizardState | null;
};

export function createPpeWizardActions({
  employees,
  inventoryRepository,
  onNotify,
  onReload,
  openCard,
  setBusyAction,
  setPickerOpen,
  setSelectedCardId,
  setWizard,
  wizard,
}: PpeWizardActionContext) {
  function openCreateWizard() {
    setWizard({
      comment: "",
      employeeDetails: createEmptyEmployeeDetails(),
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
        comment: detail.comment ?? "",
        employeeDetails: detail.employeeDetails ?? createEmptyEmployeeDetails(),
        employeeId: detail.employeeId,
        lines: detail.lines.map((line) => ({
          brandModelArticle: line.brandModelArticle || line.modelDescription || "",
          catalogName: line.itemName,
          dueAt: line.dueAt?.slice(0, 10) ?? "",
          existingLineId: line.id,
          issuePeriodText: line.issuePeriodText || getDefaultIssuePeriodText(toItemFromPpeLine(line).defaultLifeMonths),
          issuedAt: line.issuedAt?.slice(0, 10) ?? "",
          item: toItemFromPpeLine(line),
          normPoint: line.normPoint || "",
          priceText: moneyMinorToInput(line.unitPriceMinor ?? 0),
          printItemName: line.printItemName || line.itemName,
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
    const mappedLines = nextLines
      .filter((line) => !currentIds.has(line.item.id))
      .map((line): PpeWizardLine => {
        const status = line.status ?? "issuing";
        return {
          brandModelArticle: line.brandModelArticle ?? itemModelDescription(line.item),
          catalogName: line.catalogName ?? line.item.name,
          dueAt: line.dueAt ?? getDefaultDueDate(line.item.defaultLifeMonths),
          issuePeriodText: line.issuePeriodText ?? getDefaultIssuePeriodText(line.item.defaultLifeMonths),
          issuedAt: status === "issued" ? new Date().toISOString().slice(0, 10) : "",
          isSectionTitle: line.isSectionTitle,
          item: line.item,
          normPoint: line.normPoint ?? "п. 1645 Приложения № 1",
          priceText: line.priceText ?? moneyMinorToInput(line.item.defaultUnitPriceMinor),
          printItemName: line.printItemName ?? line.item.normItemName ?? line.item.name,
          quantityText: line.quantityText ?? "1",
          status,
          warehouseId: "",
        };
      });

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

    const linePayloads = buildWizardLinePayloads(wizard.lines, confirmIssue);
    if ("error" in linePayloads) {
      onNotify(linePayloads.error);
      return;
    }

    try {
      setBusyAction("wizard-save");
      const payload: CreateInventoryPpeCardDto = {
        comment: wizard.comment || null,
        employeeDetails: toApiEmployeeDetails(wizard.employeeDetails),
        employeeId: wizard.employeeId,
      };
      const existingDetail = wizard.cardId ? await inventoryRepository.getPpeCard(wizard.cardId) : null;
      const card = wizard.cardId
        ? await inventoryRepository.updatePpeCard(wizard.cardId, payload)
        : await inventoryRepository.createPpeCard(payload);

      for (const { line, payload: linePayload } of linePayloads.payloads) {
        const saved = line.existingLineId
          ? await inventoryRepository.updatePpeCardLine(card.id, line.existingLineId, linePayload)
          : await inventoryRepository.addPpeCardLine(card.id, linePayload);

        const nextStatus = confirmIssue ? "issued" : line.status;
        if (nextStatus && saved.status !== nextStatus) {
          await inventoryRepository.updatePpeCardLineStatus(card.id, saved.id, { status: nextStatus });
        }
      }

      if (existingDetail) {
        const visibleLineIds = new Set(wizard.lines.map((line) => line.existingLineId).filter(Boolean));
        for (const removedLine of existingDetail.lines.filter((line) => !visibleLineIds.has(line.id))) {
          await inventoryRepository.archivePpeCardLine(card.id, removedLine.id);
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

  return {
    addWizardLines,
    openCreateWizard,
    openEditWizard,
    patchWizardLine,
    saveWizard,
  };
}
