import { useEffect, useMemo, useState } from "react";
import type { InventoryEmployeeDto, InventoryPpeCardDto } from "../../../api/contracts";
import { statusLabel } from "./ppeCommon";
import { INVENTORY_PPE_MODULE_STATUSES } from "./inventoryPpeConfig";

export function usePpeJournalState(rows: InventoryPpeCardDto[], employees: InventoryEmployeeDto[] = []) {
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedCardId, setSelectedCardId] = useState(rows[0]?.id ?? "");

  const departmentOptions = useMemo(
    () =>
      Array.from(
        new Set(employees.map((employee) => employee.department.trim()).filter(Boolean)),
      ).sort((left, right) => left.localeCompare(right, "ru")),
    [employees],
  );

  const statusOptions = useMemo(
    () => [...INVENTORY_PPE_MODULE_STATUSES].sort((left, right) => statusLabel(left).localeCompare(statusLabel(right), "ru")),
    [],
  );

  const visibleRows = rows;

  const selectedCard = visibleRows.find((row) => row.id === selectedCardId) ?? visibleRows[0] ?? rows[0] ?? null;

  useEffect(() => {
    if (!rows.length) {
      setSelectedCardId("");
      return;
    }

    if (!rows.some((row) => row.id === selectedCardId)) {
      setSelectedCardId(rows[0].id);
    }
  }, [rows, selectedCardId]);

  useEffect(() => {
    if (visibleRows.length && !visibleRows.some((row) => row.id === selectedCardId)) {
      setSelectedCardId(visibleRows[0].id);
    }
  }, [selectedCardId, visibleRows]);

  return {
    departmentFilter,
    departmentOptions,
    priceFilter,
    query,
    resetFilters: () => {
      setQuery("");
      setDepartmentFilter("");
      setPriceFilter("");
      setStatusFilter("");
    },
    selectedCard,
    selectedCardId,
    setDepartmentFilter,
    setPriceFilter,
    setQuery,
    setSelectedCardId,
    setStatusFilter,
    statusFilter,
    statusOptions,
    visibleRows,
  };
}
