import { useEffect, useRef, useState } from "react";
import type { PpeIssueDocumentDto } from "../../../../api/contracts";
import type { PpeIssueJournalPage } from "../../../../api/ppeJournalContracts";
import { useInventoryRepository } from "../../../../repositories/inventoryRepositoryContext";
import { ppeErrorMessage } from "../ppeErrors";
import { downloadPpeFile } from "../downloadPpeFile";

export const emptyJournalFilters = { query: "", department: "", status: "", from: "", to: "", employeeId: "" };
export type JournalFilters = typeof emptyJournalFilters;

export function usePpeIssueJournal(currentUserId: string) {
  const repository = useInventoryRepository();
  const owner = useRef(0);
  const detailRequest = useRef(0);
  const exportRequest = useRef(0);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [filters, setFilters] = useState<JournalFilters>({ ...emptyJournalFilters });
  const [result, setResult] = useState<PpeIssueJournalPage | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [capabilityError, setCapabilityError] = useState("");
  const [actionError, setActionError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<PpeIssueDocumentDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    owner.current++; detailRequest.current++; exportRequest.current++;
    setResult(null); setSelected(null); setEnabled(null); setDetailLoading(false); setExporting(false);
    setFilters({ ...emptyJournalFilters }); setPage(1); setActionError("");
    return () => { owner.current++; detailRequest.current++; exportRequest.current++; };
  }, [repository, currentUserId]);

  // Capabilities do not depend on pagination or the user's search input.
  useEffect(() => {
    let active = true;
    setCapabilityError("");
    void repository.getPpeIssueDocumentCapabilities().then(value => { if (active) setEnabled(value.enabled); })
      .catch(reason => { if (active) setCapabilityError(ppeErrorMessage(reason, "Не удалось проверить доступность выдачи")); });
    return () => { active = false; };
  }, [repository, currentUserId, revision]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true); setListError("");
    const timer = window.setTimeout(() => {
      void repository.getPpeIssueJournal({ ...filters, employeeId: filters.employeeId || undefined, page, pageSize: size }, controller.signal)
        .then(value => { if (active) setResult(value); })
        .catch(reason => { if (active) setListError(ppeErrorMessage(reason, "Не удалось загрузить журнал")); })
        .finally(() => { if (active) setLoading(false); });
    }, 300);
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [repository, currentUserId, revision, filters, page, size]);

  function patchFilters(patch: Partial<JournalFilters>) {
    setFilters(current => ({ ...current, ...patch })); setPage(1);
  }
  function refresh() { setActionError(""); setRevision(value => value + 1); }
  function closeDocument() { detailRequest.current++; setSelected(null); setDetailLoading(false); }

  async function openDocument(id: string) {
    const session = owner.current;
    const request = ++detailRequest.current;
    const current = () => session === owner.current && request === detailRequest.current;
    setDetailLoading(true); setActionError("");
    try { const value = await repository.getPpeIssueDocument(id); if (current()) setSelected(value); }
    catch (reason) { if (current()) setActionError(ppeErrorMessage(reason, "Не удалось открыть документ")); }
    finally { if (current()) setDetailLoading(false); }
  }

  async function exportRows() {
    if (exporting) return;
    const session = owner.current;
    const request = ++exportRequest.current;
    const current = () => session === owner.current && request === exportRequest.current;
    setExporting(true); setActionError("");
    try {
      const file = await repository.exportPpeIssueJournal({ ...filters, employeeId: filters.employeeId || undefined });
      if (current()) downloadPpeFile(file.blob, file.fileName);
    } catch (reason) { if (current()) setActionError(ppeErrorMessage(reason, "Не удалось экспортировать журнал")); }
    finally { if (current()) setExporting(false); }
  }

  return {
    enabled, filters, result, rows: result?.items ?? [], page, setPage, size, setSize, loading,
    error: actionError || listError || capabilityError, selected, detailLoading, exporting,
    patchFilters, refresh, closeDocument, openDocument, exportRows
  };
}
