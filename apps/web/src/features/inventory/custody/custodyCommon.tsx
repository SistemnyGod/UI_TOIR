import type { InventoryCustodyDocumentDto, InventoryCustodyRecordDto, InventoryItemDto } from "../../../api/contracts";

export const documentStatusLabels: Record<string, string> = {
  archived: "Архив",
  closed: "Закрыт",
  open: "Открыт",
};

export const recordStatusLabels: Record<string, string> = {
  archived: "Архив",
  issued: "На руках",
  in_use: "На руках",
  lost: "Неисправно",
  returned: "Возвращено",
  written_off: "Списано",
};

export const CUSTODY_ITEM_GROUPS = ["Рации", "Инструменты", "Ключи", "Прочее"] as const;

export type CustodyMovementAction = "issued" | "returned" | "written_off" | "lost";

export const custodyMovementActionLabels: Record<CustodyMovementAction, string> = {
  issued: "Выдано",
  lost: "Неисправно",
  returned: "Возвращено",
  written_off: "Списано",
};

export function documentStatusLabel(status?: string | null) {
  if (!status) return "Не указано";
  return documentStatusLabels[status] ?? status;
}

export function recordStatusLabel(status?: string | null) {
  if (!status) return "Не указано";
  return recordStatusLabels[status] ?? status;
}

export function entityLabel(value: string) {
  const labels: Record<string, string> = {
    custody_document: "Акт под запись",
    custody_record: "Строка под запись",
    stock_move: "Движение учета",
    system_log: "Системный журнал",
  };
  return labels[value] ?? value;
}

export function actionLabel(value: string) {
  const labels: Record<string, string> = {
    archive: "Архивировано",
    archived: "Архивировано",
    closed: "Закрыто",
    created: "Создано",
    issued: "Выдано",
    lost: "Неисправно",
    opened: "Открыто",
    returned: "Возвращено",
    status_changed: "Смена статуса",
    updated: "Изменено",
    written_off: "Списано",
  };
  return labels[value] ?? recordStatusLabel(value);
}

export function statusDescription(value: string) {
  return value
    .replaceAll("issued", "На руках")
    .replaceAll("in_use", "На руках")
    .replaceAll("returned", "Возвращено")
    .replaceAll("written_off", "Списано")
    .replaceAll("lost", "Неисправно")
    .replaceAll("open", "Открыт")
    .replaceAll("closed", "Закрыт");
}

export function detectCustodyGroup(parts: Array<string | null | undefined>) {
  const text = parts.filter(Boolean).join(" ").toLowerCase();

  if (/раци|радиостанц|radio|walkie/.test(text)) return "Рации";
  if (/ключ/.test(text)) return "Ключи";
  if (/инструмент|дрел|шуруп|перфорат|makita|bosch|berger|hans|адаптер|набор|молот|отвертк|торцев/.test(text)) {
    return "Инструменты";
  }

  return "Прочее";
}

export function getCustodyItemGroup(item: InventoryItemDto) {
  return detectCustodyGroup([item.category, item.itemKind, item.name, item.sku, item.article, item.comment]);
}

export function getCustodyRecordGroup(row: InventoryCustodyRecordDto) {
  return detectCustodyGroup([row.itemName, row.comment, row.unit]);
}

export function isProblemCustodyRecord(row: InventoryCustodyRecordDto) {
  return row.status === "lost"
    || row.status === "written_off"
    || /полом|неисправ|провер/i.test(row.comment ?? "");
}

export function isActiveCustodyRecord(row: InventoryCustodyRecordDto) {
  return row.status === "in_use" || row.status === "issued";
}

export function formatDate(value?: string | null) {
  if (!value) return "Нет данных";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(date);
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

export function getDocumentIdByRecordId(documents: InventoryCustodyDocumentDto[], records: InventoryCustodyRecordDto[]) {
  const documentIds = new Set(documents.map((row) => row.id));
  return new Map(records.map((row) => [row.id, documentIds.has(row.documentId) ? row.documentId : row.documentId]));
}

export function saveApiFile(file: { blob: Blob; fileName: string }) {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="inventory-custody-meta">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function CustodyStatus({ scope, status }: { scope: "document" | "record"; status: string }) {
  const label = scope === "document" ? documentStatusLabel(status) : recordStatusLabel(status);
  return <span className={`inventory-custody-status ${status}`}>{label}</span>;
}

export function CustodyState({ kind, text, title }: { kind: "empty" | "error" | "loading"; text: string; title: string }) {
  return (
    <div className={`inventory-custody-state is-${kind}`}>
      <span>AM</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
