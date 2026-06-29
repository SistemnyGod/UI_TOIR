import type { InventoryPpeCardLineDto } from "../../../api/contracts";
import { statusLabel } from "./ppeCommon";
import type { PpeActionContext } from "./ppeRepositoryActionTypes";

export function createPpeCardActions({ inventoryRepository, onNotify, onReload, setBusyAction, setDrawer }: PpeActionContext) {
  async function openCard(cardId: string) {
    try {
      setBusyAction(`open-${cardId}`);
      const [detail, history] = await Promise.all([
        inventoryRepository.getPpeCard(cardId),
        inventoryRepository.getPpeCardHistory(cardId, { pageSize: 50 }),
      ]);
      setDrawer({ type: "card", detail, history: history.rows });
    } catch (loadError) {
      onNotify(loadError instanceof Error ? loadError.message : "Не удалось открыть карточку СИЗ");
    } finally {
      setBusyAction("");
    }
  }

  async function updateLineStatus(cardId: string, lineId: string, status: string) {
    try {
      setBusyAction(`${status}-${lineId}`);
      await inventoryRepository.updatePpeCardLineStatus(cardId, lineId, { status });
      onNotify("Статус строки СИЗ обновлен");
      await onReload();
      await openCard(cardId);
    } catch (updateError) {
      onNotify(updateError instanceof Error ? updateError.message : "Не удалось обновить строку СИЗ");
    } finally {
      setBusyAction("");
    }
  }

  return {
    openCard,
    updateLineStatus,
  };
}

export function lineHistoryMeta(line: InventoryPpeCardLineDto): Array<[string, string]> {
  return [
    ["Позиция", line.itemName],
    ["Статус", statusLabel(line.status)],
  ];
}
