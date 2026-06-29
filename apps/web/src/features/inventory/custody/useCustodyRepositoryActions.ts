import { useState } from "react";
import type { InventoryCustodyRecordDto } from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { recordStatusLabel, saveApiFile } from "./custodyCommon";
import type { CustodyDocumentAction, CustodyDrawer } from "./custodyTypes";

export function useCustodyRepositoryActions({
  onNotify,
  onReload,
  setDrawer,
}: {
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
  setDrawer: (drawer: CustodyDrawer) => void;
}) {
  const inventoryRepository = useInventoryRepository();
  const [busyAction, setBusyAction] = useState("");

  async function openDocument(documentId: string) {
    try {
      setBusyAction(`open-${documentId}`);
      const [detail, history] = await Promise.all([
        inventoryRepository.getCustodyDocument(documentId),
        inventoryRepository.getCustodyDocumentHistory(documentId, { pageSize: 50 }),
      ]);
      setDrawer({ type: "document", detail: { ...detail, history: history.rows } });
    } catch (loadError) {
      onNotify(loadError instanceof Error ? loadError.message : "Не удалось открыть акт под запись");
    } finally {
      setBusyAction("");
    }
  }

  async function openRecordHistory(row: InventoryCustodyRecordDto) {
    try {
      setBusyAction(`history-${row.id}`);
      const history = await inventoryRepository.getCustodyRecordHistory(row.id, { pageSize: 50 });
      setDrawer({
        type: "history",
        title: `История строки: ${row.itemName}`,
        rows: history.rows,
        meta: [
          ["Сотрудник", row.employeeName],
          ["Позиция", row.itemName],
          ["Статус", recordStatusLabel(row.status)],
        ],
      });
    } catch (loadError) {
      onNotify(loadError instanceof Error ? loadError.message : "Не удалось открыть историю строки");
    } finally {
      setBusyAction("");
    }
  }

  async function updateRecordStatus(row: InventoryCustodyRecordDto, status: string, documentId?: string, comment?: string) {
    try {
      setBusyAction(`${status}-${row.id}`);
      await inventoryRepository.updateCustodyRecordStatus(row.id, {
        comment: comment?.trim() ? comment.trim() : null,
        status,
      });
      onNotify(status === "returned"
        ? "Возврат под запись зафиксирован"
        : status === "written_off"
          ? "Списание под запись зафиксировано"
          : status === "lost"
            ? "Неисправность предмета зафиксирована"
            : "Статус строки под запись обновлен");
      await onReload();
      if (documentId) await openDocument(documentId);
    } catch (updateError) {
      onNotify(updateError instanceof Error ? updateError.message : "Не удалось обновить строку под запись");
    } finally {
      setBusyAction("");
    }
  }

  async function archiveRecord(row: InventoryCustodyRecordDto, documentId?: string) {
    try {
      setBusyAction(`archive-${row.id}`);
      await inventoryRepository.archiveCustodyRecord(row.id);
      onNotify("Строка под запись перенесена в архив");
      await onReload();
      if (documentId) await openDocument(documentId);
    } catch (archiveError) {
      onNotify(archiveError instanceof Error ? archiveError.message : "Не удалось архивировать строку");
    } finally {
      setBusyAction("");
    }
  }

  async function updateDocumentState(documentId: string, action: CustodyDocumentAction) {
    try {
      setBusyAction(`${action}-${documentId}`);
      if (action === "close") await inventoryRepository.closeCustodyDocument(documentId);
      if (action === "open") await inventoryRepository.openCustodyDocument(documentId);
      if (action === "archive") await inventoryRepository.archiveCustodyDocument(documentId);

      onNotify(action === "close" ? "Акт закрыт" : action === "open" ? "Акт открыт" : "Акт перенесен в архив");
      await onReload();
      if (action === "archive") setDrawer(null);
      else await openDocument(documentId);
    } catch (updateError) {
      onNotify(updateError instanceof Error ? updateError.message : "Не удалось изменить статус акта");
    } finally {
      setBusyAction("");
    }
  }

  async function downloadFile(action: () => Promise<{ blob: Blob; fileName: string }>) {
    try {
      saveApiFile(await action());
      onNotify("Файл сформирован");
    } catch (downloadError) {
      onNotify(downloadError instanceof Error ? downloadError.message : "Не удалось сформировать файл");
    }
  }

  return {
    archiveRecord,
    busyAction,
    downloadFile,
    openDocument,
    openRecordHistory,
    updateDocumentState,
    updateRecordStatus,
  };
}

