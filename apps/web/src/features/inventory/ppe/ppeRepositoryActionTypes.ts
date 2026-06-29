import type { Dispatch, SetStateAction } from "react";
import type { InventoryEmployeeDto, InventoryItemDto } from "../../../api/contracts";
import type { InventoryRepository } from "../../../repositories/inventoryRepository";
import type { ApiFile, PpeDrawer, PpeWizardState, PrintData, PrintMode } from "./ppeTypes";

export type PpePreviewState = { data: PrintData; mode: PrintMode } | null;

export type PpeActionContext = {
  employees: InventoryEmployeeDto[];
  inventoryRepository: InventoryRepository;
  items: InventoryItemDto[];
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
  setBusyAction: Dispatch<SetStateAction<string>>;
  setDrawer: Dispatch<SetStateAction<PpeDrawer>>;
  setPickerOpen: Dispatch<SetStateAction<boolean>>;
  setPreview: Dispatch<SetStateAction<PpePreviewState>>;
  setSelectedCardId: (id: string) => void;
  setWizard: Dispatch<SetStateAction<PpeWizardState | null>>;
};

export type OpenPpeCardAction = (cardId: string) => Promise<void>;

export type PpeFileDownloadAction = () => Promise<ApiFile>;
