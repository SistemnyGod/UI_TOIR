import type {
  InventoryEmployeeDto,
  InventoryHistoryDto,
  InventoryItemDto,
  InventoryPpeCardDetailDto,
} from "../../../api/contracts";

export type ApiFile = {
  blob: Blob;
  fileName: string;
};

export type PrintMode = "card" | "sheet";

export type PrintLine = {
  dueAt?: string | null;
  issuedAt?: string | null;
  itemName: string;
  model: string;
  normPoint: string;
  quantity: number;
  status: string;
  unit: string;
  unitPrice: number;
  amount: number;
};

export type PrintData = {
  cardId?: string;
  createdAt?: string;
  employee?: InventoryEmployeeDto | null;
  employeeName: string;
  lines: PrintLine[];
  position: string;
};

export type PpeDrawer =
  | { type: "card"; detail: InventoryPpeCardDetailDto; history: InventoryHistoryDto[] }
  | { type: "history"; title: string; rows: InventoryHistoryDto[]; meta?: Array<[string, string]> }
  | null;

export type PpeWizardLine = {
  dueAt: string;
  existingLineId?: string;
  item: InventoryItemDto;
  normPoint: string;
  priceText: string;
  quantityText: string;
  status: string;
  warehouseId: string;
};

export type PpeWizardState = {
  cardId?: string;
  comment: string;
  employeeId: string;
  lines: PpeWizardLine[];
  mode: "create" | "edit";
  step: number;
};

export type PickerLineInput = {
  dueAt?: string;
  item: InventoryItemDto;
  normPoint?: string;
  priceText?: string;
  quantityText?: string;
  status?: string;
};

export type PpeCardCounts = {
  active: number;
  closed: number;
  issued: number;
  problem: number;
  total: number;
};
