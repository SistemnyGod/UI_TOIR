import { ChevronRight } from "lucide-react";
import type { InventoryPpeHistoryRowDto } from "../../../api/contracts";
import { Button, ModalShell } from "../../../shared/ui";

function statusLabel(value: string) { return ({ defective: "Неисправно", issued: "Выдано", returned: "Возвращено", written_off: "Списано" } as Record<string, string>)[value] ?? value; }
export function PpeHistoryEventDialog({ row, onClose, onOpenEmployee }: { row: InventoryPpeHistoryRowDto; onClose: () => void; onOpenEmployee: () => void }) {
  const action = ({ defective: "Неисправность", issued: "Выдача", returned: "Возврат", written_off: "Списание" } as Record<string, string>)[row.action] ?? row.actionLabel;
  const date = new Date(row.createdAt);
  const hasTransition = Boolean(row.fromStatus && row.fromStatus !== row.toStatus);
  return <ModalShell title="Детали события" subtitle={`${action} · ${Number.isNaN(date.getTime()) ? row.createdAt : date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}`} className="ppe-history-event-dialog" onClose={onClose}
    actions={<><Button variant="ghost" onClick={onClose}>Закрыть просмотр</Button><Button variant="primary" onClick={onOpenEmployee}>Открыть карточку сотрудника</Button></>}>
    <div className="ppe-history-event-summary"><span className={`ppe-v2-action-badge is-${row.action}`}>{action}</span><strong>{row.normItemName || row.itemName}</strong><span>{row.employeeName}</span><div>{hasTransition ? <><span className={`ppe-v2-status is-${row.fromStatus}`}>{statusLabel(row.fromStatus)}</span><ChevronRight aria-hidden="true" size={16} /></> : <span className="ppe-v2-status">Начальное состояние</span>}<span className={`ppe-v2-status is-${row.toStatus}`}>{statusLabel(row.toStatus)}</span></div></div>
    <dl className="ppe-history-event-details"><div><dt>Фактическая номенклатура</dt><dd>{row.itemName}</dd></div>{row.normItemName ? <div><dt>Позиция по норме</dt><dd>{row.normItemName}</dd></div> : null}<div><dt>Количество</dt><dd>{row.quantity} {row.unit}</dd></div><div><dt>Инициатор</dt><dd>{row.actor || "Система"}</dd></div><div className="is-wide"><dt>Комментарий</dt><dd>{row.comment || "Без комментария"}</dd></div></dl>
  </ModalShell>;
}
