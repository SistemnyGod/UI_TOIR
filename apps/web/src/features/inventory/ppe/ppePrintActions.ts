import { printDataFromDetail, saveApiFile } from "./ppeCommon";
import type { PpeActionContext, PpeFileDownloadAction } from "./ppeRepositoryActionTypes";
import type { PrintMode } from "./ppeTypes";

export function createPpePrintActions({ inventoryRepository, items, onNotify, setBusyAction, setPreview }: PpeActionContext) {
  async function downloadFile(action: PpeFileDownloadAction) {
    try {
      saveApiFile(await action());
    } catch (downloadError) {
      onNotify(downloadError instanceof Error ? downloadError.message : "Не удалось сформировать файл");
    }
  }

  async function previewSavedCard(cardId: string, mode: PrintMode) {
    try {
      setBusyAction(`preview-${cardId}`);
      const detail = await inventoryRepository.getPpeCard(cardId);
      setPreview({ data: printDataFromDetail(detail, items), mode });
    } catch (previewError) {
      onNotify(previewError instanceof Error ? previewError.message : "Не удалось открыть предпросмотр");
    } finally {
      setBusyAction("");
    }
  }

  return {
    downloadFile,
    previewSavedCard,
  };
}
