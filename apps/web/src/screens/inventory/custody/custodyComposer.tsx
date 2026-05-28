import { useMemo, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import type {
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryReferenceOptionDto,
  InventorySettingsDto,
} from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { parsePositiveQuantity } from "./custodyCommon";
import { emptyRecordForm, type RecordForm } from "./custodyTypes";

export function CustodyComposer({
  employees,
  items,
  onNotify,
  onReload,
  settings,
}: {
  employees: InventoryEmployeeDto[];
  items: InventoryItemDto[];
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
  settings?: InventorySettingsDto;
}) {
  const inventoryRepository = useInventoryRepository();
  const [form, setForm] = useState<RecordForm>(emptyRecordForm);
  const [saving, setSaving] = useState(false);

  const employeeOptions = useMemo(
    () => employees.map((employee) => ({ code: employee.personnelNo, id: employee.id, isActive: employee.status !== "archived", name: employee.fullName })),
    [employees],
  );
  const itemOptions = useMemo(
    () => items.map((item) => ({ code: item.sku, id: item.id, isActive: item.isActive, name: item.name })),
    [items],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = parsePositiveQuantity(form.quantityText);
    if (!form.employeeId || !form.itemId || !form.warehouseId || !quantity) {
      onNotify("Заполните сотрудника, позицию, склад и количество");
      return;
    }

    try {
      setSaving(true);
      await inventoryRepository.createCustodyRecord({
        comment: form.comment || null,
        documentId: null,
        employeeId: form.employeeId,
        itemId: form.itemId,
        quantity,
        warehouseId: form.warehouseId,
      });
      setForm((current) => ({
        ...current,
        comment: "",
        documentId: null,
        itemId: "",
        quantity: 1,
        quantityText: "1",
      }));
      onNotify("Запись под ответственность создана");
      await onReload();
    } catch (createError) {
      onNotify(createError instanceof Error ? createError.message : "Не удалось создать запись под ответственность");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="inventory-custody-composer" onSubmit={(event) => void submit(event)}>
      <div className="inventory-custody-step">
        <span>1</span>
        <div>
          <strong>Новая выдача под запись</strong>
          <small>Создает акт, строку материальной ответственности и складское движение выдачи.</small>
        </div>
      </div>
      <label>
        Сотрудник
        <CustodySelect rows={employeeOptions} value={form.employeeId} onChange={(value) => setForm((current) => ({ ...current, employeeId: value }))} />
      </label>
      <label>
        Позиция
        <CustodySelect rows={itemOptions} value={form.itemId} onChange={(value) => setForm((current) => ({ ...current, itemId: value }))} />
      </label>
      <label>
        Склад
        <CustodySelect rows={settings?.warehouses ?? []} value={form.warehouseId} onChange={(value) => setForm((current) => ({ ...current, warehouseId: value }))} />
      </label>
      <label>
        Кол-во
        <input required value={form.quantityText} onChange={(event) => setForm((current) => ({ ...current, quantityText: event.target.value }))} />
      </label>
      <label>
        Комментарий
        <input value={form.comment} onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))} placeholder="Основание или примечание" />
      </label>
      <button className="button primary" disabled={saving} type="submit">
        <Plus size={16} />
        {saving ? "Создание..." : "Создать запись"}
      </button>
    </form>
  );
}

function CustodySelect({
  onChange,
  rows,
  value,
}: {
  onChange: (value: string) => void;
  rows: Array<{ id: string; name: string; code?: string; isActive?: boolean }> | InventoryReferenceOptionDto[];
  value: string;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Выберите</option>
      {rows.map((row) => (
        <option disabled={row.isActive === false} key={row.id} value={row.id}>
          {row.name}{row.code ? ` (${row.code})` : ""}
        </option>
      ))}
    </select>
  );
}

