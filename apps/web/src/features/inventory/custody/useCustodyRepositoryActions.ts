import { useEffect, useRef, useState } from "react";
import type { InventoryCustodyRecordDto } from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { recordStatusLabel, saveApiFile } from "./custodyCommon";
import type { CustodyDocumentAction, CustodyDrawer } from "./custodyTypes";

export function useCustodyRepositoryActions({ onNotify, onReload, setDrawer }: { onNotify: (message: string) => void; onReload: () => Promise<void>; setDrawer: (drawer: CustodyDrawer) => void }) {
  const repository = useInventoryRepository();
  const [busyAction, setBusyAction] = useState(""), [actionError, setActionError] = useState("");
  const [isMutating, setIsMutating] = useState(false);
  const mounted = useRef(true), readRevision = useRef(0), busyRevision = useRef(0), mutating = useRef(false), shown = useRef<CustodyDrawer>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; readRevision.current += 1; }; }, []);
  function begin(key: string) { const token=++busyRevision.current; setBusyAction(key); return token; }
  function finish(token: number) { if (mounted.current && token===busyRevision.current) setBusyAction(""); }
  function publish(value: CustodyDrawer) { shown.current=value; setDrawer(value); }
  function closeDrawer() { readRevision.current += 1; publish(null); setActionError(""); }
  async function openDocument(documentId: string) {
    const revision=++readRevision.current, token=begin(`open-${documentId}`);
    try {
      const [detail, history] = await Promise.all([repository.getCustodyDocument(documentId), repository.getCustodyDocumentHistory(documentId, { pageSize: 50 })]);
      if (mounted.current && revision===readRevision.current) publish({type:"document",detail:{...detail,history:history.rows}});
    } catch (failure) { if (mounted.current && revision===readRevision.current) onNotify(failure instanceof Error ? failure.message : "Не удалось открыть акт под запись"); }
    finally { finish(token); }
  }
  async function openRecordHistory(row: InventoryCustodyRecordDto) {
    const revision=++readRevision.current, token=begin(`history-${row.id}`);
    try {
      const history = await repository.getCustodyRecordHistory(row.id, { pageSize: 50 });
      if (mounted.current && revision===readRevision.current) publish({ type:"history", title:`История строки: ${row.itemName}`, rows:history.rows, meta:[["Сотрудник",row.employeeName],["Позиция",row.itemName],["Статус",recordStatusLabel(row.status)]] });
    } catch (failure) { if (mounted.current && revision===readRevision.current) onNotify(failure instanceof Error ? failure.message : "Не удалось открыть историю строки"); }
    finally { finish(token); }
  }
  async function mutate(key: string, operation: () => Promise<unknown>, message: string, documentId?: string, closeAfter = false, reportError = false) {
    if (mutating.current) return false;
    mutating.current=true; setIsMutating(true);
    const revision=readRevision.current, token=begin(key);
    setActionError("");
    try {
      await operation();
      if (!mounted.current) return false;
      onNotify(message);
      try { await onReload(); }
      catch { if (mounted.current) setActionError("Операция сохранена. Не удалось обновить список — повторите загрузку."); }
      if (!mounted.current) return true;
      if (documentId && revision===readRevision.current && shown.current?.type==="document" && shown.current.detail.id===documentId) {
        if (closeAfter) closeDrawer(); else void openDocument(documentId);
      }
      return true;
    } catch (failure) {
      if (!mounted.current) return false;
      if (!reportError) throw failure;
      const message = failure instanceof Error ? failure.message : "Не удалось выполнить операцию с актом";
      setActionError(message); return false;
    } finally { mutating.current=false; if (mounted.current) setIsMutating(false); finish(token); }
  }
  function updateRecordStatus(row: InventoryCustodyRecordDto, status: string, documentId?: string, comment?: string) {
    return mutate(`${status}-${row.id}`, () => repository.updateCustodyRecordStatus(row.id,{status,comment:comment?.trim()||null}), status==="returned" ? "Возврат под запись зафиксирован" : status==="written_off" ? "Списание под запись зафиксировано" : status==="lost" ? "Неисправность предмета зафиксирована" : "Статус строки обновлён", documentId);
  }
  function transferRecord(row: InventoryCustodyRecordDto, employeeId: string, documentId?: string, comment?: string) {
    return mutate(`transfer-${row.id}`, () => repository.transferCustodyRecord(row.id,{toEmployeeId:employeeId,comment:comment?.trim()||null}), "Передача предмета зафиксирована", documentId, true);
  }
  function archiveRecord(row: InventoryCustodyRecordDto, documentId?: string) {
    return mutate(`archive-${row.id}`, () => repository.archiveCustodyRecord(row.id), "Строка под запись перенесена в архив", documentId);
  }
  function updateDocumentState(documentId: string, action: CustodyDocumentAction) {
    return mutate(`${action}-${documentId}`, () => action==="close" ? repository.closeCustodyDocument(documentId) : action==="open" ? repository.openCustodyDocument(documentId) : repository.archiveCustodyDocument(documentId), action==="close" ? "Акт закрыт" : action==="open" ? "Акт открыт" : "Акт перенесён в архив", documentId, action==="archive", true);
  }
  async function downloadFile(operation: () => Promise<{ blob: Blob; fileName: string }>) {
    try { const file=await operation(); if (mounted.current) { saveApiFile(file); onNotify("Файл сформирован"); } }
    catch (failure) { if (mounted.current) onNotify(failure instanceof Error ? failure.message : "Не удалось сформировать файл"); }
  }
  return { actionError, archiveRecord, busyAction, isMutating, closeDrawer, downloadFile, openDocument, openRecordHistory, transferRecord, updateDocumentState, updateRecordStatus };
}
