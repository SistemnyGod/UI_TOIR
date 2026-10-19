import { HardHat, Package, Wrench } from "lucide-react";
import type { InventoryItemDto } from "../../../api/contracts";

export function formatStandards(standards: InventoryItemDto["standards"]) {
  return standards?.length ? standards.map(row => row.name ? `${row.designation} — ${row.name}` : row.designation).join("; ") : "Не указаны";
}

export function renderItemIcon(item: InventoryItemDto, size = 22) {
  const category = `${item.category} ${item.itemKind}`.toLowerCase();
  if (category.includes("спец") || category.includes("siz") || category.includes("сиз")) {
    return <HardHat size={size} aria-hidden="true" />;
  }
  if (category.includes("инстру") || category.includes("tool")) {
    return <Wrench size={size} aria-hidden="true" />;
  }
  return <Package size={size} aria-hidden="true" />;
}

export function getItemTone(item: InventoryItemDto) {
  const category = `${item.category} ${item.itemKind}`.toLowerCase();
  if (category.includes("спец") || category.includes("сиз")) return "tone-violet";
  if (category.includes("инстру")) return "tone-blue";
  return "tone-green";
}

export function getTrackingLabel(value: string) {
  if (value === "identifier") return "Инвентарный";
  if (value === "custody") return "Под запись";
  return "Количественный";
}

export function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return new Intl.NumberFormat("ru-RU", { currency: "RUB", style: "currency" }).format(0);
  return new Intl.NumberFormat("ru-RU", { currency: "RUB", style: "currency" }).format(value / 100);
}

