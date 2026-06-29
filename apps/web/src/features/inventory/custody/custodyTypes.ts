import type {
  CreateInventoryCustodyRecordDto,
  InventoryCustodyDocumentDetailDto,
  InventoryHistoryDto,
} from "../../../api/contracts";

export type CustodyDrawer =
  | { type: "document"; detail: InventoryCustodyDocumentDetailDto }
  | { type: "history"; title: string; rows: InventoryHistoryDto[]; meta?: Array<[string, string]> }
  | null;

export type RecordForm = CreateInventoryCustodyRecordDto & {
  comment: string;
  quantityText: string;
};

export type CustodyDocumentAction = "archive" | "close" | "open";

export const emptyRecordForm: RecordForm = {
  comment: "",
  documentId: null,
  employeeId: "",
  itemId: "",
  quantity: 1,
  quantityText: "1",
  warehouseId: "",
};
