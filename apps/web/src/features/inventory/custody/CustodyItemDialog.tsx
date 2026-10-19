import { useId, useRef, useState } from "react";
import type { InventorySettingsDto, UpsertInventoryItemDto } from "../../../api/contracts";
import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import { CUSTODY_ITEM_GROUPS } from "./custodyCommon";
import { useCustodyCommand } from "./useCustodyCommand";

type ItemForm = { brandName: string; comment: string; group: string; modelName: string; name: string; price: string; serialNumber: string; sku: string; unitId: string };
export function CustodyItemDialog({ settings, onClose, onSave }: { settings?: InventorySettingsDto; onClose: () => void; onSave: (payload: UpsertInventoryItemDto) => Promise<void | boolean> }) {
  const [itemForm, setItemForm] = useState<ItemForm>(() => ({ brandName: "", comment: "", group: CUSTODY_ITEM_GROUPS[0], modelName: "", name: "", price: "", serialNumber: "", sku: "", unitId: settings?.units[0]?.id ?? "" }));
  const initial = useRef(JSON.stringify(itemForm));
  const formId = useId(), command = useCustodyCommand(onClose);
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: JSON.stringify(itemForm) !== initial.current, pending: command.pending, onClose });
  function submit() {
    if (!itemForm.name.trim() || !itemForm.sku.trim()) { command.setError("Укажите название и инвентарный номер предмета."); return; }
    const price = itemForm.price.trim() ? Number(itemForm.price.trim().replace(/\s/g, "").replace(",", ".")) : 0;
    if (!Number.isFinite(price) || price < 0) { command.setError("Укажите неотрицательную цену, например 1250,50."); return; }
    if (itemForm.unitId && !settings?.units.some(unit => unit.id === itemForm.unitId)) { command.setError("Выбранная единица больше недоступна. Выберите другую."); return; }
    void command.run(() => onSave({ actualItemName: itemForm.name.trim(), article: itemForm.serialNumber.trim() || itemForm.sku.trim(), brandName: itemForm.brandName.trim() || null, categoryId: null,
      comment: [`Группа: ${itemForm.group}`, itemForm.serialNumber.trim() ? `Серийный номер: ${itemForm.serialNumber.trim()}` : "", itemForm.comment.trim()].filter(Boolean).join(". "), defaultUnitPriceMinor: Math.round(price * 100), isActive: true, isConsumable: false, itemKind: itemForm.group,
      modelName: itemForm.modelName.trim() || null, name: itemForm.name.trim(), sku: itemForm.sku.trim(), trackingType: "custody", trackLife: false, unitId: itemForm.unitId || null }));
  }
  return <><ModalShell title="Добавить предмет под запись" subtitle="Запись справочника. Количество указывается при выдаче сотруднику." className="custody-item-dialog" onClose={requestClose} pending={command.pending}
    actions={<><Button disabled={command.pending} onClick={requestClose} variant="ghost">Отмена</Button><Button disabled={command.pending} form={formId} type="submit" variant="primary">{command.pending ? "Сохранение…" : "Добавить предмет"}</Button></>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); submit(); }}><fieldset disabled={command.pending}>
              <div className="custody-item-fields">
                <label>
                  Название предмета
                  <input required value={itemForm.name} onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label>
                  Список / группа
                  <select value={itemForm.group} onChange={(event) => setItemForm((current) => ({ ...current, group: event.target.value }))}>
                    {CUSTODY_ITEM_GROUPS.map((row) => <option key={row} value={row}>{row}</option>)}
                  </select>
                </label>
                <label>
                  Идентификатор / инвентарный номер
                  <input required value={itemForm.sku} onChange={(event) => setItemForm((current) => ({ ...current, sku: event.target.value }))} />
                </label>
                <label>
                  Серийный номер
                  <input value={itemForm.serialNumber} onChange={(event) => setItemForm((current) => ({ ...current, serialNumber: event.target.value }))} />
                </label>
                <label>
                  Модель / бренд
                  <input value={itemForm.modelName} onChange={(event) => setItemForm((current) => ({ ...current, modelName: event.target.value }))} />
                </label>
                <label>
                  Цена
                  <input inputMode="decimal" placeholder="0,00" value={itemForm.price} onChange={(event) => setItemForm((current) => ({ ...current, price: event.target.value }))} />
                </label>
                <label>
                  Единица
                  <select value={itemForm.unitId} onChange={(event) => setItemForm((current) => ({ ...current, unitId: event.target.value }))}>
                    <option value="">Не указана</option>
                    {(settings?.units ?? []).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                  </select>
                </label>
                <label className="custody-item-wide">
                  Комментарий
                  <textarea value={itemForm.comment} onChange={(event) => setItemForm((current) => ({ ...current, comment: event.target.value }))} />
                </label>
              </div>

    </fieldset></form>
    {command.error ? <p role="alert" className="field-error">{command.error}</p> : null}
  </ModalShell>{discardDialog}</>;
}
