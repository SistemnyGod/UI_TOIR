import { useEffect, useMemo, useState } from "react";
import type { InventoryCustodyDocumentDto } from "../../../api/contracts";

export function useCustodyJournalState(documentRows: InventoryCustodyDocumentDto[]) {
  const [selectedDocumentId, setSelectedDocumentId] = useState(documentRows[0]?.id ?? "");
  const [query, setQuery] = useState("");

  const selectedDocument = useMemo(
    () => documentRows.find((row) => row.id === selectedDocumentId) ?? documentRows[0] ?? null,
    [documentRows, selectedDocumentId],
  );

  useEffect(() => {
    if (!documentRows.length) {
      setSelectedDocumentId("");
      return;
    }

    if (!documentRows.some((row) => row.id === selectedDocumentId)) {
      setSelectedDocumentId(documentRows[0].id);
    }
  }, [documentRows, selectedDocumentId]);

  return {
    query,
    selectedDocument,
    selectedDocumentId,
    setQuery,
    setSelectedDocumentId,
  };
}
