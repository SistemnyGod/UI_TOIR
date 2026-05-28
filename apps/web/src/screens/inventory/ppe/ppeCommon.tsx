import type {
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryPpeCardDetailDto,
  InventoryPpeCardDto,
  InventoryPpeCardLineDto,
  InventoryPositionNormDto,
} from "../../../api/contracts";
import { INVENTORY_PPE_STATUS_LABELS } from "./inventoryPpeConfig";
import type { ApiFile, PickerLineInput, PpeCardCounts, PpeWizardState, PrintData, PrintLine } from "./ppeTypes";

export function PpeKpi({
  label,
  tone = "blue",
  value,
}: {
  label: string;
  tone?: "blue" | "green" | "red" | "slate";
  value: number;
}) {
  return (
    <article className={`inventory-ppe-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function PpeStatus({ status }: { status: string }) {
  return <span className={`inventory-ppe-status ${status}`}>{statusLabel(status)}</span>;
}

export function PpeState({
  kind,
  text,
  title,
}: {
  kind: "empty" | "error" | "loading";
  text: string;
  title: string;
}) {
  return (
    <div className={`inventory-ppe-state is-${kind}`}>
      <span>{kind === "loading" ? "..." : kind === "error" ? "!" : "0"}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <Meta label={label} value={value} />;
}

export function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="inventory-ppe-meta">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function statusLabel(status?: string | null) {
  if (!status) return "Не указан";
  return INVENTORY_PPE_STATUS_LABELS[status] ?? status;
}

export function employeeStatusLabel(status: string) {
  if (status === "archived") return "Архив";
  if (status === "inactive") return "Неактивен";
  return "Активен";
}

export function formatDate(value?: string | null, mode: "date" | "datetime" = "datetime") {
  if (!value) return "Нет данных";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(
    "ru-RU",
    mode === "date" ? { dateStyle: "short" } : { dateStyle: "short", timeStyle: "short" },
  ).format(date);
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    currency: "RUB",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value);
}

export function parsePositiveQuantity(value: string) {
  const quantity = Number(value.trim().replace(",", "."));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

export function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function getDefaultDueDate(lifeMonths?: number | null) {
  if (!lifeMonths) return "";
  const date = new Date();
  date.setMonth(date.getMonth() + lifeMonths);
  return date.toISOString().slice(0, 10);
}

export function toLineFromNorm(
  norm: InventoryPositionNormDto,
  itemsById: Map<string, InventoryItemDto>,
): PickerLineInput {
  const item = itemsById.get(norm.itemId) ?? toItemFromNorm(norm);
  return {
    dueAt: getDefaultDueDate(norm.lifeMonths ?? item.defaultLifeMonths),
    item,
    normPoint: `Норма: ${norm.positionName}`,
    priceText: String(item.defaultUnitPriceMinor ? Math.round(item.defaultUnitPriceMinor / 100) : 0),
    quantityText: String(norm.quantity || 1),
  };
}

export function toItemFromNorm(norm: InventoryPositionNormDto): InventoryItemDto {
  return {
    actualItemName: norm.itemName,
    article: "",
    balance: 0,
    brandName: "",
    category: "",
    categoryId: null,
    clothingSize: "",
    comment: "",
    defaultLifeMonths: norm.lifeMonths ?? 12,
    defaultUnitPriceMinor: 0,
    gloveSize: "",
    headSize: "",
    heightSize: "",
    id: norm.itemId,
    isActive: true,
    isConsumable: false,
    itemKind: "ppe",
    minStockQty: 0,
    modelName: "",
    name: norm.itemName,
    normItemName: norm.itemName,
    protectionClass: "",
    respiratorSize: "",
    shoeSize: "",
    sku: "",
    status: "active",
    stockAvailable: 0,
    stockPhysical: 0,
    stockReserved: 0,
    stockStatus: "normal",
    trackLife: true,
    trackingType: "ppe",
    unit: "шт.",
    unitId: null,
  };
}

export function toItemFromPpeLine(line: InventoryPpeCardLineDto): InventoryItemDto {
  return {
    actualItemName: line.itemName,
    article: "",
    balance: 0,
    brandName: "",
    category: "",
    categoryId: null,
    clothingSize: "",
    comment: "",
    defaultLifeMonths: 12,
    defaultUnitPriceMinor: 0,
    gloveSize: "",
    headSize: "",
    heightSize: "",
    id: line.itemId,
    isActive: true,
    isConsumable: line.status === "issued" && !line.dueAt,
    itemKind: "ppe",
    minStockQty: 0,
    modelName: "",
    name: line.itemName,
    normItemName: line.itemName,
    protectionClass: "",
    respiratorSize: "",
    shoeSize: "",
    sku: "",
    status: "active",
    stockAvailable: 0,
    stockPhysical: 0,
    stockReserved: 0,
    stockStatus: "normal",
    trackLife: true,
    trackingType: "ppe",
    unit: line.unit || "шт.",
    unitId: null,
  };
}

export function getPpeCardCounts(rows: InventoryPpeCardDto[]): PpeCardCounts {
  return rows.reduce<PpeCardCounts>(
    (accumulator, row) => ({
      active: accumulator.active + (row.status === "active" ? 1 : 0),
      closed: accumulator.closed + (row.status === "returned" || row.status === "written_off" ? 1 : 0),
      issued: accumulator.issued + row.linesCount,
      problem: accumulator.problem + (row.status === "warning" || row.status === "overdue" ? 1 : 0),
      total: accumulator.total + 1,
    }),
    { active: 0, closed: 0, issued: 0, problem: 0, total: 0 },
  );
}

export function printDataFromWizard(
  wizard: PpeWizardState,
  employee: InventoryEmployeeDto | null,
): PrintData {
  return {
    cardId: wizard.cardId,
    createdAt: new Date().toISOString(),
    employee,
    employeeName: employee?.fullName ?? "Сотрудник не выбран",
    lines: wizard.lines.map((line) => ({
      amount: (parsePositiveQuantity(line.quantityText) ?? 1) * parsePrice(line.priceText),
      dueAt: line.dueAt || null,
      issuedAt: line.status === "issued" ? new Date().toISOString() : null,
      itemName: line.item.name,
      model: [line.item.brandName, line.item.modelName, line.item.article || line.item.sku].filter(Boolean).join(", "),
      normPoint: line.normPoint,
      quantity: parsePositiveQuantity(line.quantityText) ?? 1,
      status: line.status,
      unit: line.item.unit || "шт.",
      unitPrice: parsePrice(line.priceText),
    })),
    position: employee?.position ?? "",
  };
}

export function printDataFromDetail(detail: InventoryPpeCardDetailDto): PrintData {
  return {
    cardId: detail.id,
    createdAt: detail.createdAt,
    employee: {
      birthDate: null,
      department: detail.employeeDepartment || "",
      employeeGroup: "",
      fullName: detail.employeeName,
      hiredAt: null,
      id: detail.employeeId,
      personnelNo: detail.employeePersonnelNo || "",
      position: detail.position,
      status: "active",
    },
    employeeName: detail.employeeName,
    lines: detail.lines.map((line) => ({
      dueAt: line.dueAt,
      issuedAt: line.issuedAt,
      itemName: line.itemName,
      model: line.modelDescription || "",
      normPoint: line.normPoint || "",
      quantity: line.quantity,
      status: line.status,
      unit: line.unit || "шт.",
      unitPrice: (line.unitPriceMinor ?? 0) / 100,
      amount: (line.amountMinor ?? 0) / 100,
    })),
    position: detail.position,
  };
}

export function isConsumableLine(line: PrintLine) {
  return !line.dueAt && line.status === "issued";
}

export function saveApiFile(file: ApiFile) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(file.blob);
  link.href = url;
  link.download = file.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parsePrice(value: string) {
  const parsed = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
