import { FileText, Package, Wrench, HardHat, Pencil, Archive, type LucideIcon } from "lucide-react";
import type { InventoryItemDto } from "../../../api/contracts";
import { Button, ModalShell, useDialogAction } from "../../../shared/ui";
import { PpeMovementHistoryPanel } from "../PpeMovementHistoryPanel";
import { formatStandards, formatMoney, getTrackingLabel } from "./itemPresentation";
import "./itemDialogs.css";

export function ItemDetailDialog({
  item,
  onClose,
  onEdit,
  onHide,
}: {
  item: InventoryItemDto;
  onClose: () => void;
  onEdit?: (item: InventoryItemDto) => void;
  onHide?: (item: InventoryItemDto) => void;
}) {
  return (
    <ModalShell
      title="Карточка позиции номенклатуры"
      className="item-catalog-detail"
      subtitle={[item.category, item.article || item.sku].filter(Boolean).join(" · ") || "Справочник СИЗ"}
      actions={(
        <>
          <Button onClick={onClose} variant="ghost">Закрыть</Button>
          {onHide && item.isActive ? <Button aria-label="Скрыть позицию" onClick={() => onHide(structuredClone(item))} variant="danger"><Archive size={16} aria-hidden="true" />Скрыть</Button> : null}
          {onEdit ? <Button onClick={() => onEdit(structuredClone(item))} variant="primary"><Pencil size={16} aria-hidden="true" />Редактировать</Button> : null}
        </>
      )}
      onClose={onClose}
    >
      <h3 className="item-catalog-name">{item.name}</h3>
      <p className="item-catalog-state">{item.isActive ? "Активная позиция" : "Скрыта из активного каталога"}</p>
      <div className="inventory-detail-grid">
        <DetailStat icon={FileText} label="Артикул" value={item.article || item.sku || "-"} />
        <DetailStat icon={Package} label="Категория" value={item.category || "-"} />
        <DetailStat icon={Wrench} label="Тип учета" value={getTrackingLabel(item.trackingType)} />
        <DetailStat icon={HardHat} label="Срок службы" value={item.defaultLifeMonths ? `${item.defaultLifeMonths} мес.` : "-"} />
        <DetailStat icon={Package} label="Цена" value={formatMoney(item.defaultUnitPriceMinor)} />
        <DetailStat icon={FileText} label="Стандарты" value={formatStandards(item.standards)} />
      </div>
      <section className="inventory-detail-comment">
        <h3>Описание</h3>
        <p>{item.comment || "Описание пока не заполнено."}</p>
      </section>
      <PpeMovementHistoryPanel emptyText="По этому предмету пока нет выдач, возвратов или списаний СИЗ." hideItem itemId={item.id} pageSize={8} title="История движения по предмету" />
    </ModalShell>
  );
}

export function ConfirmHideDialog({
  item,
  onCancel,
  onConfirm,
  saving,
}: {
  item: InventoryItemDto;
  onCancel: () => void;
  onConfirm: () => Promise<void | boolean>;
  saving: boolean;
}) {
  const action = useDialogAction(saving);
  const closeSafely = () => { if (!action.pending) onCancel(); };
  return (
    <ModalShell
      title="Скрыть позицию номенклатуры"
      className="item-catalog-confirm"
      pending={action.pending}
      subtitle="Позиция и её история сохранятся. Изменится доступность в активном каталоге."
      actions={(
        <>
          <Button disabled={action.pending} onClick={closeSafely} variant="ghost">Отмена</Button>
          <Button disabled={action.pending} onClick={() => void action.run(onConfirm)} variant="danger"><Archive size={16} aria-hidden="true" />{action.pending ? "Скрываем…" : "Скрыть позицию"}</Button>
        </>
      )}
      onClose={closeSafely}
    >
      <p className="inventory-confirm-copy">Скрыть <strong>{item.name}</strong> из активной номенклатуры?</p>
      {action.error ? <p role="alert" className="item-catalog-error">{action.error}</p> : null}
    </ModalShell>
  );
}
function DetailStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="inventory-detail-stat">
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

