import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Save } from "lucide-react";
import type { InventoryItemDto, InventorySettingsDto } from "../../../api/contracts";
import { Button, ModalShell, useDialogCloseGuard, useDialogAction } from "../../../shared/ui";
import { usePageLeaveGuard } from "../../../shared/navigation/usePageLeaveGuard";
import { createEmptyForm, itemToForm, validateItemForm, type ItemFormState, type ItemFormErrors } from "./catalogItemModel";
import "./itemDialogs.css";

type FormMode = "create" | "edit";
export function ItemFormDialog({
  item,
  mode,
  onClose,
  onSubmit,
  saving,
  settings,
}: {
  item?: InventoryItemDto;
  mode: FormMode;
  onClose: () => void;
  onSubmit: (form: ItemFormState) => Promise<void | boolean>;
  saving: boolean;
  settings?: InventorySettingsDto;
}) {
  const [form, setForm] = useState<ItemFormState>(() => (item ? itemToForm(item) : createEmptyForm(settings)));
  const [errors, setErrors] = useState<ItemFormErrors>({});
  const initial = useRef(JSON.stringify(form));
  const formId = useId(), action = useDialogAction(saving);
  const dirty = JSON.stringify(form) !== initial.current;
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty, pending: action.pending, onClose });
  const { leaveDialog } = usePageLeaveGuard({ dirty, pending: action.pending });

  function patchForm(patch: Partial<ItemFormState>) {
    setForm((value) => ({ ...value, ...patch }));
    setErrors({});
    action.clearError();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validateItemForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    await action.run(() => onSubmit(form));
  }

  return <>
    <ModalShell
      title={mode === "edit" ? "Редактировать позицию номенклатуры" : "Создать позицию номенклатуры"}
      className="item-catalog-editor"
      pending={action.pending}
      initialFocusSelector="[data-item-initial-focus]"
      subtitle="Справочник СИЗ · обязательные поля отмечены звёздочкой"
      actions={(
        <>
          <Button disabled={action.pending} onClick={requestClose} variant="ghost">Отмена</Button>
          <Button disabled={action.pending} form={formId} type="submit" variant="primary"><Save size={16} aria-hidden="true" />{action.pending ? "Сохранение…" : "Сохранить позицию"}</Button>
        </>
      )}
      onClose={requestClose}
    >
      <form className="inventory-item-form" id={formId} onSubmit={handleSubmit}>
        {action.error ? <p className="item-catalog-error" role="alert">{action.error}</p> : null}
        {Object.keys(errors).length > 0 ? (
          <div className="inventory-item-form-alert" role="alert">
            Проверьте обязательные и числовые поля перед сохранением.
          </div>
        ) : null}

        <fieldset disabled={action.pending}><div className="inventory-form-grid">
          <div className="inventory-item-form-section wide"><strong>Основные сведения</strong><span>Название, категория и единица используются в каталоге и документах выдачи.</span></div>
          <Field error={errors.name} label="Название" required wide>
            <input aria-invalid={Boolean(errors.name)} data-item-initial-focus required value={form.name} onChange={(event) => patchForm({ name: event.target.value })} />
          </Field>
          <Field label="Артикул / SKU">
            <input value={form.article} onChange={(event) => patchForm({ article: event.target.value, sku: event.target.value })} />
          </Field>
          <Field label="Категория">
            <select value={form.categoryId} onChange={(event) => patchForm({ categoryId: event.target.value })}>
              <option value="">Без категории</option>
              {form.categoryId && !settings?.categories.some(value => value.id === form.categoryId) ? <option value={form.categoryId}>{item?.category || "Ранее выбранная категория"} · нет в справочнике</option> : null}
              {(settings?.categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </Field>
          <Field label="Единица">
            <select value={form.unitId} onChange={(event) => patchForm({ unitId: event.target.value })}>
              <option value="">Не выбрана</option>
              {form.unitId && !settings?.units.some(value => value.id === form.unitId) ? <option value={form.unitId}>{item?.unit || "Ранее выбранная единица"} · нет в справочнике</option> : null}
              {(settings?.units ?? []).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          </Field>
          <Field label="Тип учета">
            <select value={form.trackingType} onChange={(event) => patchForm({ trackingType: event.target.value })}>
              <option value="quantity">Количественный</option>
              <option value="identifier">Инвентарный</option>
              <option value="custody">Под запись</option>
            </select>
          </Field>
          <Field label="Вид позиции">
            <input value={form.itemKind} onChange={(event) => patchForm({ itemKind: event.target.value })} placeholder="Например: СИЗОД" />
          </Field>

          <div className="inventory-item-form-section wide"><strong>Норма и конкретное изделие</strong><span>Нормативное название отвечает на вопрос «что положено», фактическое — «что выдаём».</span></div>
          <Field label="Нормативное название" wide>
            <input value={form.normItemName} onChange={(event) => patchForm({ normItemName: event.target.value })} />
          </Field>
          <Field label="Фактическое название" wide>
            <input value={form.actualItemName} onChange={(event) => patchForm({ actualItemName: event.target.value })} />
          </Field>
          <Field label="Марка">
            <input value={form.brandName} onChange={(event) => patchForm({ brandName: event.target.value })} />
          </Field>
          <Field label="Модель">
            <input value={form.modelName} onChange={(event) => patchForm({ modelName: event.target.value })} />
          </Field>
          <Field label="Класс защиты">
            <input value={form.protectionClass} onChange={(event) => patchForm({ protectionClass: event.target.value })} />
          </Field>
          <Field label="Стандарты (обозначение | название)" wide>
            <textarea aria-label="Стандарты" value={form.standardsText} onChange={(event) => patchForm({ standardsText: event.target.value })} placeholder={'ГОСТ 12.4.128-83 | Каски защитные\nТР ТС 019/2011 | О безопасности СИЗ'} rows={4} />
          </Field>

          <div className="inventory-item-form-section wide"><strong>Учёт и параметры выдачи</strong><span>Числовые значения должны быть неотрицательными.</span></div>
          <Field error={errors.defaultLifeMonths} label="Срок, мес.">
            <input aria-invalid={Boolean(errors.defaultLifeMonths)} inputMode="numeric" value={form.defaultLifeMonths} onChange={(event) => patchForm({ defaultLifeMonths: event.target.value })} />
          </Field>
          <Field error={errors.defaultUnitPrice} label="Цена, ₽">
            <input aria-invalid={Boolean(errors.defaultUnitPrice)} inputMode="decimal" value={form.defaultUnitPrice} onChange={(event) => patchForm({ defaultUnitPrice: event.target.value })} />
          </Field>
          <Field error={errors.minStockQty} label="Минимальное количество">
            <input aria-invalid={Boolean(errors.minStockQty)} inputMode="decimal" value={form.minStockQty} onChange={(event) => patchForm({ minStockQty: event.target.value })} />
          </Field>
          <div className="inventory-field wide" role="group" aria-label="Размерные параметры"><span>Размерные параметры</span>
            <div className="inventory-size-grid">
              <input aria-label="Размер одежды" value={form.clothingSize} onChange={(event) => patchForm({ clothingSize: event.target.value })} placeholder="Одежда" />
              <input aria-label="Размер обуви" value={form.shoeSize} onChange={(event) => patchForm({ shoeSize: event.target.value })} placeholder="Обувь" />
              <input aria-label="Размер перчаток" value={form.gloveSize} onChange={(event) => patchForm({ gloveSize: event.target.value })} placeholder="Перчатки" />
              <input aria-label="Размер респиратора" value={form.respiratorSize} onChange={(event) => patchForm({ respiratorSize: event.target.value })} placeholder="Респиратор" />
              <input aria-label="Рост" value={form.heightSize} onChange={(event) => patchForm({ heightSize: event.target.value })} placeholder="Рост" />
              <input aria-label="Размер головы" value={form.headSize} onChange={(event) => patchForm({ headSize: event.target.value })} placeholder="Голова" />
            </div>
          </div>
          <Field label="Комментарий" wide>
            <textarea aria-label="Комментарий" value={form.comment} onChange={(event) => patchForm({ comment: event.target.value })} rows={4} />
          </Field>
          <div className="inventory-toggle-row wide">
            <label><input type="checkbox" checked={form.isConsumable} onChange={(event) => patchForm({ isConsumable: event.target.checked })} />Расходник</label>
            <label><input type="checkbox" checked={form.trackLife} onChange={(event) => patchForm({ trackLife: event.target.checked })} />Контролировать срок</label>
            <label><input type="checkbox" checked={form.isActive} onChange={(event) => patchForm({ isActive: event.target.checked })} />Активная позиция</label>
          </div>
        </div></fieldset>
      </form>
    </ModalShell>{discardDialog}{leaveDialog}</>;
}

function Field({
  children,
  error,
  label,
  required = false,
  wide = false,
}: {
  children: ReactNode;
  error?: string;
  label: string;
  required?: boolean;
  wide?: boolean;
}) {
  return (
    <label className={`inventory-field ${wide ? "wide" : ""} ${error ? "has-error" : ""}`.trim()}>
      <span>{label}{required ? <em> *</em> : null}</span>
      {children}
      {error ? <small role="alert">{error}</small> : null}
    </label>
  );
}

