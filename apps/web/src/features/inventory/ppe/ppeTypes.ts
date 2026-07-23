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
  brandModelArticle?: string;
  catalogName?: string;
  dueAt?: string | null;
  issuePeriodText?: string | null;
  issuedAt?: string | null;
  isSectionTitle?: boolean;
  issueMethod?: "personal" | "dispenser";
  itemName: string;
  model: string;
  modelOptions?: string[];
  normPoint: string;
  printItemName?: string | null;
  quantity: number;
  quantityText?: string | null;
  status: string;
  unit: string;
  unitPrice: number;
  amount: number;
};

export type PpeEmployeeCardDetails = {
  clothingSize?: string;
  gender?: string;
  handProtectionSize?: string;
  headSize?: string;
  height?: string;
  respiratorSize?: string;
  shoeSize?: string;
};

export type PrintData = {
  cardId?: string;
  createdAt?: string;
  employee?: InventoryEmployeeDto | null;
  employeeDetails?: PpeEmployeeCardDetails;
  employeeName: string;
  lines: PrintLine[];
  position: string;
};

export type PpeDrawer =
  | { type: "card"; detail: InventoryPpeCardDetailDto; history: InventoryHistoryDto[] }
  | { type: "history"; title: string; rows: InventoryHistoryDto[]; meta?: Array<[string, string]> }
  | null;

export type PpeWizardLine = {
  brandModelArticle?: string;
  catalogName?: string;
  dueAt: string;
  existingLineId?: string;
  issuePeriodText: string;
  issueMethod?: "personal" | "dispenser";
  issuedAt: string;
  isSectionTitle?: boolean;
  item: InventoryItemDto;
  normPoint: string;
  printItemName: string;
  priceText: string;
  quantityText: string;
  status: string;
  warehouseId: string;
};

export type PpeWizardState = {
  cardId?: string;
  comment: string;
  employeeId: string;
  employeeDetails?: PpeEmployeeCardDetails;
  lines: PpeWizardLine[];
  mode: "create" | "edit";
  step: number;
};

export type PickerLineInput = {
  brandModelArticle?: string;
  catalogName?: string;
  dueAt?: string;
  issuePeriodText?: string;
  isSectionTitle?: boolean;
  item: InventoryItemDto;
  normPoint?: string;
  printItemName?: string;
  priceText?: string;
  quantityText?: string;
  status?: string;
};

export type PpeCardCounts = {
  active: number;
  amount: number;
  closed: number;
  issued: number;
  problem: number;
  total: number;
  zeroPrice: number;
};
