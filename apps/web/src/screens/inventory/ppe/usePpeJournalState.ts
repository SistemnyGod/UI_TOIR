import { useEffect, useMemo, useState } from "react";
import type { InventoryPpeCardDto } from "../../../api/contracts";
import { getPpeCardCounts, statusLabel } from "./ppeCommon";

export function usePpeJournalState(rows: InventoryPpeCardDto[]) {
  const [query, setQuery] = useState("");
  const [selectedCardId, setSelectedCardId] = useState(rows[0]?.id ?? "");
  const counts = useMemo(() => getPpeCardCounts(rows), [rows]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = useMemo(
    () =>
      normalizedQuery
        ? rows.filter((row) =>
            [
              row.employeeName,
              row.position,
              statusLabel(row.status),
              row.status,
              `СИЗ-${row.id.slice(0, 8)}`,
              row.id,
            ]
              .filter(Boolean)
              .some((value) => value.toLowerCase().includes(normalizedQuery)),
          )
        : rows,
    [normalizedQuery, rows],
  );
  const selectedCard = rows.find((row) => row.id === selectedCardId) ?? visibleRows[0] ?? rows[0] ?? null;

  useEffect(() => {
    if (!rows.length) {
      setSelectedCardId("");
      return;
    }

    if (!rows.some((row) => row.id === selectedCardId)) {
      setSelectedCardId(rows[0].id);
    }
  }, [rows, selectedCardId]);

  return {
    counts,
    query,
    selectedCard,
    selectedCardId,
    setQuery,
    setSelectedCardId,
    visibleRows,
  };
}
