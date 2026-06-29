import { useState } from "react";
import type { InventoryEmployeeDto, InventoryItemDto } from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { createPpeCardActions } from "./ppeCardActions";
import { createPpeHistoryActions } from "./ppeHistoryActions";
import { createPpePrintActions } from "./ppePrintActions";
import type { PpeActionContext } from "./ppeRepositoryActionTypes";
import { createPpeWizardActions } from "./ppeWizardActions";
import type { PpeDrawer, PpeWizardState, PrintData, PrintMode } from "./ppeTypes";

type UsePpeRepositoryActionsOptions = {
  employees: InventoryEmployeeDto[];
  items: InventoryItemDto[];
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
  setSelectedCardId: (id: string) => void;
};

export function usePpeRepositoryActions({
  employees,
  items,
  onNotify,
  onReload,
  setSelectedCardId,
}: UsePpeRepositoryActionsOptions) {
  const inventoryRepository = useInventoryRepository();
  const [drawer, setDrawer] = useState<PpeDrawer>(null);
  const [busyAction, setBusyAction] = useState("");
  const [wizard, setWizard] = useState<PpeWizardState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preview, setPreview] = useState<{ data: PrintData; mode: PrintMode } | null>(null);

  const context: PpeActionContext = {
    employees,
    inventoryRepository,
    items,
    onNotify,
    onReload,
    setBusyAction,
    setDrawer,
    setPickerOpen,
    setPreview,
    setSelectedCardId,
    setWizard,
  };

  const { openCard, updateLineStatus } = createPpeCardActions(context);
  const historyActions = createPpeHistoryActions(context);
  const printActions = createPpePrintActions(context);
  const wizardActions = createPpeWizardActions({
    ...context,
    openCard,
    wizard,
  });

  const wizardEmployee = wizard ? employees.find((employee) => employee.id === wizard.employeeId) ?? null : null;

  return {
    ...historyActions,
    ...printActions,
    ...wizardActions,
    busyAction,
    drawer,
    openCard,
    pickerOpen,
    preview,
    setDrawer,
    setPickerOpen,
    setPreview,
    setWizard,
    updateLineStatus,
    wizard,
    wizardEmployee,
  };
}
