import type { ApiFile } from "./ppeTypes";

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
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

export function moneyMinorToInput(value?: number | null) {
  if (!value) return "0";
  return (value / 100).toFixed(2).replace(".", ",");
}

export function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value);
}

export function parsePositiveQuantity(value: string) {
  const normalized = value.trim().replace(",", ".");
  const match = normalized.match(/^(\d+(?:\.\d+)?)(?:\s|$)/);
  const quantity = match ? Number(match[1]) : Number(normalized);
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
