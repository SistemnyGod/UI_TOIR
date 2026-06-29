import type { InventoryPpeCardLineDto } from "../../../api/contracts";
import { lineHistoryMeta } from "./ppeCardActions";
import type { PpeActionContext } from "./ppeRepositoryActionTypes";

export function createPpeHistoryActions({ inventoryRepository, onNotify, setBusyAction, setDrawer }: PpeActionContext) {
  async function openCardLinesHistory(cardId: string) {
    try {
      setBusyAction(`history-${cardId}`);
      const history = await inventoryRepository.getPpeCardLinesHistory(cardId, { pageSize: 75 });
      setDrawer({ type: "history", title: "История строк СИЗ", rows: history.rows });
    } catch (loadError) {
      onNotify(loadError instanceof Error ? loadError.message : "Не удалось открыть историю строк СИЗ");
    } finally {
      setBusyAction("");
    }
  }

  async function openLineHistory(cardId: string, line: InventoryPpeCardLineDto) {
    try {
      setBusyAction(`line-history-${line.id}`);
      const history = await inventoryRepository.getPpeCardLineHistory(cardId, line.id, { pageSize: 50 });
      setDrawer({
        type: "history",
        title: `История строки: ${line.itemName}`,
        rows: history.rows,
        meta: lineHistoryMeta(line),
      });
    } catch (loadError) {
      onNotify(loadError instanceof Error ? loadError.message : "Не удалось открыть историю строки СИЗ");
    } finally {
      setBusyAction("");
    }
  }

  return {
    openCardLinesHistory,
    openLineHistory,
  };
}
