import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Plus } from "lucide-react";
import type { InventoryItemDto, InventoryItemSetDto, InventoryReferenceOptionDto, InventorySettingsDto } from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { ModalShell, useDialogCloseGuard } from "../../../shared/ui";

export type ReferenceKind =
  | "category"
  | "unit"
  | "warehouse"
  | "custodyCategory"
  | "returnReason"
  | "writeOffReason"
  | "employeePosition"
  | "employeeDepartment"
  | "employeeGroup";
export type ReferenceModalState = { kind: ReferenceKind; row?: InventoryReferenceOptionDto } | null;
export type NormModalState = { row?: InventorySettingsDto["positionNorms"][number] } | null;
export type ItemSetModalState = { row?: InventoryItemSetDto } | null;

export const referenceLabels: Record<ReferenceKind, string> = {
  category: "Группа номенклатуры",
  custodyCategory: "Категория под запись",
  returnReason: "Причина возврата",
  unit: "Единица измерения",
  warehouse: "Место учета",
  writeOffReason: "Причина списания",
  employeePosition: "Должность сотрудника",
  employeeDepartment: "Подразделение сотрудника",
  employeeGroup: "Основная группа сотрудника",
};

function useSettingsSave(onClose: () => void, onNotify: (message: string) => void, onReload: () => Promise<void>) {
  const owner = useInventoryRepository();
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function save(operation: () => Promise<unknown>, message: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await operation();
      if (!mounted.current || currentOwner.current !== owner) return;
      onNotify(message);
      // A failed refresh must never turn a successful write into a failed save.
      try { await onReload(); }
      catch { if (mounted.current && currentOwner.current === owner) onNotify("Данные сохранены. Не удалось обновить список — обновите его повторно."); }
      if (mounted.current && currentOwner.current === owner) onClose();
    } catch (error) {
      if (mounted.current && currentOwner.current === owner) setSaveError(error instanceof Error ? error.message : "Не удалось сохранить. Заполненные данные остались в форме.");
    } finally {
      inFlight.current = false;
      if (mounted.current && currentOwner.current === owner) setSaving(false);
    }
  }
  return { save, saving, saveError };
}

export function ReferenceModal({
  categories,
  modal,
  onClose,
  onNotify,
  onReload,
}: {
  categories: InventoryReferenceOptionDto[];
  modal: Exclude<ReferenceModalState, null>;
  onClose: () => void;
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
}) {
  const inventoryRepository = useInventoryRepository();
  const [kind, setKind] = useState<ReferenceKind>(modal.kind);
  const [name, setName] = useState(modal.row?.name ?? "");
  const [code, setCode] = useState(modal.row?.code ?? "");
  const [parentId, setParentId] = useState("");
  const [isDefault, setIsDefault] = useState(modal.row?.code === "default");
  const { save, saving, saveError } = useSettingsSave(onClose, onNotify, onReload);
  const isEdit = Boolean(modal.row);
  const initial = useRef(JSON.stringify({ kind: modal.kind, name: modal.row?.name ?? "", code: modal.row?.code ?? "", parentId: "", isDefault: modal.row?.code === "default" }));
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: JSON.stringify({ kind, name, code, parentId, isDefault }) !== initial.current, pending: saving, onClose });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(async () => {
      const trimmedName = name.trim();
      if (kind === "category") {
        if (modal.row) await inventoryRepository.updateCategory(modal.row.id, { isArchived: !modal.row.isActive, name: trimmedName, parentId: parentId || null });
        else await inventoryRepository.createCategory({ name: trimmedName, parentId: parentId || null });
      }
      if (kind === "unit") {
        if (modal.row) await inventoryRepository.updateUnit(modal.row.id, { name: trimmedName, symbol: code.trim() });
        else await inventoryRepository.createUnit({ name: trimmedName, symbol: code.trim() });
      }
      if (kind === "warehouse") {
        if (modal.row) await inventoryRepository.updateWarehouse(modal.row.id, { isArchived: !modal.row.isActive, isDefault, name: trimmedName });
        else await inventoryRepository.createWarehouse({ isDefault, name: trimmedName });
      }
      if (kind === "custodyCategory") {
        if (modal.row) await inventoryRepository.updateCustodyCategory(modal.row.id, { isArchived: !modal.row.isActive, name: trimmedName });
        else await inventoryRepository.createCustodyCategory({ name: trimmedName });
      }
      if (kind === "returnReason") {
        if (modal.row) await inventoryRepository.updateReturnReason(modal.row.id, { isArchived: !modal.row.isActive, name: trimmedName });
        else await inventoryRepository.createReturnReason({ name: trimmedName });
      }
      if (kind === "writeOffReason") {
        if (modal.row) await inventoryRepository.updateWriteOffReason(modal.row.id, { isArchived: !modal.row.isActive, name: trimmedName });
        else await inventoryRepository.createWriteOffReason({ name: trimmedName });
      }
      if (kind === "employeePosition") {
        if (modal.row) await inventoryRepository.updateEmployeeReference("position", modal.row.id, { isArchived: !modal.row.isActive, name: trimmedName });
        else await inventoryRepository.createEmployeeReference("position", { name: trimmedName });
      }
      if (kind === "employeeDepartment") {
        if (modal.row) await inventoryRepository.updateEmployeeReference("department", modal.row.id, { isArchived: !modal.row.isActive, name: trimmedName });
        else await inventoryRepository.createEmployeeReference("department", { name: trimmedName });
      }
      if (kind === "employeeGroup") {
        if (modal.row) await inventoryRepository.updateEmployeeReference("group", modal.row.id, { isArchived: !modal.row.isActive, name: trimmedName });
        else await inventoryRepository.createEmployeeReference("group", { name: trimmedName });
      }

    }, isEdit ? "Справочник обновлен" : "Справочник создан");
  }

  return (
    <><SettingsModal title={isEdit ? "Редактирование справочника" : "Новая запись справочника"} pending={saving} onClose={requestClose}>
      <form className="inventory-settings-modal-form" onSubmit={(event) => void submit(event)} aria-busy={saving}>
        <fieldset className="inventory-settings-modal-fields" disabled={saving}>
        <label>Тип
          <select disabled={isEdit} value={kind} onChange={(event) => setKind(event.target.value as ReferenceKind)}>
            <option value="category">Группа номенклатуры</option>
            <option value="unit">Единица измерения</option>
            <option value="warehouse">Место учета</option>
            <option value="custodyCategory">Категория под запись</option>
            <option value="returnReason">Причина возврата</option>
            <option value="writeOffReason">Причина списания</option>
            <option value="employeePosition">Должность сотрудника</option>
            <option value="employeeDepartment">Подразделение сотрудника</option>
            <option value="employeeGroup">Основная группа сотрудника</option>
          </select>
        </label>
        <label>Название
          <input required value={name} onChange={(event) => setName(event.target.value)} placeholder={`Введите название: ${referenceLabels[kind].toLowerCase()}`} />
        </label>
        {kind === "unit" ? (
          <label>Обозначение
            <input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="Например: шт, пара, компл" />
          </label>
        ) : null}
        {kind === "category" ? (
          <label>Родительская группа
            <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
              <option value="">Без родительской группы</option>
              {categories.filter((row) => row.id !== modal.row?.id && row.isActive).map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        {kind === "warehouse" ? (
          <label className="inventory-settings-check">
            <input checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} type="checkbox" />
            Место учета по умолчанию
          </label>
        ) : null}
        </fieldset>
        <footer>
          {saveError ? <p className="inventory-settings-save-error" role="alert">{saveError}</p> : null}
          <button className="button ghost" disabled={saving} onClick={requestClose} type="button">Отмена</button>
          <button className="button primary" disabled={saving || !name.trim() || (kind === "unit" && !code.trim())} type="submit">
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
        </footer>
      </form>
    </SettingsModal>{discardDialog}</>
  );
}

export function NormModal({
  items,
  itemsLoading,
  modal,
  onClose,
  onNotify,
  onReload,
}: {
  items: InventoryItemDto[];
  itemsLoading: boolean;
  modal: Exclude<NormModalState, null>;
  onClose: () => void;
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
}) {
  const inventoryRepository = useInventoryRepository();
  const activeItems = useMemo(() => items.filter((item) => item.isActive).sort((left, right) => left.name.localeCompare(right.name, "ru")), [items]);
  const [form, setForm] = useState({
    itemId: modal.row?.itemId ?? "",
    lifeMonths: modal.row?.lifeMonths?.toString() ?? "",
    positionName: modal.row?.positionName ?? "",
    quantity: modal.row?.quantity?.toString() ?? "1",
  });
  const { save, saving, saveError } = useSettingsSave(onClose, onNotify, onReload);
  const initial = useRef(JSON.stringify(form));
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: JSON.stringify(form) !== initial.current, pending: saving, onClose });
  const quantityValue = Number(form.quantity.replace(",", "."));
  const quantityValid = Number.isFinite(quantityValue) && quantityValue > 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(async () => {
      await inventoryRepository.upsertPositionNorm({
        itemId: form.itemId,
        lifeMonths: parseOptionalNumber(form.lifeMonths),
        positionName: form.positionName.trim(),
        quantity: Number(form.quantity.replace(",", ".")),
      });
    }, "Норма СИЗ сохранена");
  }

  return (
    <><SettingsModal title="Норма СИЗ" pending={saving} onClose={requestClose}>
      <form className="inventory-settings-modal-form" onSubmit={(event) => void submit(event)} aria-busy={saving}>
        <fieldset className="inventory-settings-modal-fields" disabled={saving}>
        <label>Должность
          <input required value={form.positionName} onChange={(event) => setForm((value) => ({ ...value, positionName: event.target.value }))} placeholder="Например: Водитель погрузчика" />
        </label>
        <label>Позиция номенклатуры
          <select required disabled={itemsLoading} value={form.itemId} onChange={(event) => setForm((value) => ({ ...value, itemId: event.target.value }))}>
            <option value="">{itemsLoading ? "Загрузка позиций..." : "Выберите позицию"}</option>
            {activeItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <div className="inventory-settings-modal-grid">
          <label>Количество
            <input required value={form.quantity} onChange={(event) => setForm((value) => ({ ...value, quantity: event.target.value }))} />
          </label>
          <label>Срок, мес.
            <input value={form.lifeMonths} onChange={(event) => setForm((value) => ({ ...value, lifeMonths: event.target.value }))} />
          </label>
        </div>
        </fieldset>
        <footer>
          {saveError ? <p className="inventory-settings-save-error" role="alert">{saveError}</p> : null}
          <button className="button ghost" disabled={saving} onClick={requestClose} type="button">Отмена</button>
          <button className="button primary" disabled={saving || itemsLoading || !form.positionName.trim() || !form.itemId || !quantityValid} type="submit">
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
        </footer>
      </form>
    </SettingsModal>{discardDialog}</>
  );
}

export function ItemSetModal({
  items,
  itemsLoading,
  modal,
  onClose,
  onNotify,
  onReload,
}: {
  items: InventoryItemDto[];
  itemsLoading: boolean;
  modal: Exclude<ItemSetModalState, null>;
  onClose: () => void;
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
}) {
  const inventoryRepository = useInventoryRepository();
  const activeItems = useMemo(() => items.filter((item) => item.isActive).sort((left, right) => left.name.localeCompare(right.name, "ru")), [items]);
  const [name, setName] = useState(modal.row?.name ?? "");
  const [rows, setRows] = useState<Array<{ itemId: string; quantity: string }>>([]);
  const [loadingDetail, setLoadingDetail] = useState(Boolean(modal.row));
  const { save, saving, saveError } = useSettingsSave(onClose, onNotify, onReload);
  const initial = useRef(JSON.stringify({ name, rows }));
  const createdSetId = useRef<string | null>(null);
  const notifyRef = useRef(onNotify);
  notifyRef.current = onNotify;
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: JSON.stringify({ name, rows }) !== initial.current, pending: saving, onClose });
  const rowsAreValid = rows.every((row) => {
    const quantity = Number(row.quantity.replace(",", "."));
    return row.itemId && Number.isFinite(quantity) && quantity > 0;
  });

  useEffect(() => {
    if (!modal.row) return;

    let mounted = true;
    setLoadingDetail(true);
    inventoryRepository
      .getItemSet(modal.row.id)
      .then((detail) => {
        if (!mounted) return;
        initial.current = JSON.stringify({ name: detail.name, rows: detail.items.map((row) => ({ itemId: row.item.id, quantity: row.quantity.toString() })) });
        setName(detail.name);
        setRows(detail.items.map((row) => ({ itemId: row.item.id, quantity: row.quantity.toString() })));
      })
      .catch((loadError) => {
        if (mounted) notifyRef.current(loadError instanceof Error ? loadError.message : "Не удалось загрузить состав набора");
      })
      .finally(() => {
        if (mounted) setLoadingDetail(false);
      });

    return () => {
      mounted = false;
    };
  }, [inventoryRepository, modal.row?.id]);

  function addRow() {
    const nextItem = activeItems.find((item) => !rows.some((row) => row.itemId === item.id));
    if (!nextItem) return;
    setRows((current) => [...current, { itemId: nextItem.id, quantity: "1" }]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(async () => {
      const existingId = modal.row?.id ?? createdSetId.current;
      const itemSet = existingId
        ? await inventoryRepository.updateItemSet(existingId, { isArchived: modal.row ? !modal.row.isActive : false, name: name.trim() })
        : await inventoryRepository.createItemSet({ name: name.trim() });
      createdSetId.current = itemSet.id;

      await inventoryRepository.updateItemSetItems(itemSet.id, {
        items: rows
          .filter((row) => row.itemId)
          .map((row) => ({ itemId: row.itemId, quantity: Number(row.quantity.replace(",", ".")) })),
      });

    }, "Набор сохранен");
  }

  const isBusy = loadingDetail || itemsLoading;

  return (
    <><SettingsModal wide title={modal.row ? "Состав набора" : "Новый набор"} pending={saving} onClose={requestClose}>
      <form className="inventory-settings-modal-form" onSubmit={(event) => void submit(event)} aria-busy={saving}>
        <fieldset className="inventory-settings-modal-fields" disabled={saving || loadingDetail}>
        <label>Название набора
          <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Например: Зимний комплект" />
        </label>
        <section className="inventory-settings-set-editor">
          <header>
            <div>
              <h3>Состав</h3>
              <p>{rows.length} позиций</p>
            </div>
            <button className="button ghost" disabled={isBusy || !activeItems.length || rows.length >= activeItems.length} onClick={addRow} type="button">
              <Plus size={14} />
              Добавить позицию
            </button>
          </header>
          {isBusy ? (
            <SettingsState kind="loading" title="Загрузка состава" text="Получаем позиции набора и активную номенклатуру." compact />
          ) : !rows.length ? (
            <SettingsState kind="empty" title="Состав пуст" text="Добавьте позиции номенклатуры и количество." compact />
          ) : (
            <div className="inventory-settings-set-rows">
              {rows.map((row, index) => (
                <div className="inventory-settings-set-row" key={`${row.itemId}-${index}`}>
                  <label>Позиция
                    <select value={row.itemId} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, itemId: event.target.value } : item))}>
                      {activeItems.map((item) => (
                        <option disabled={rows.some((selected, selectedIndex) => selectedIndex !== index && selected.itemId === item.id)} key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>Кол-во
                    <input value={row.quantity} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))} />
                  </label>
                  <button className="button ghost" onClick={() => setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button">
                    Убрать
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        </fieldset>
        <footer>
          {saveError ? <p className="inventory-settings-save-error" role="alert">{saveError}</p> : null}
          <button className="button ghost" disabled={saving} onClick={requestClose} type="button">Отмена</button>
          <button className="button primary" disabled={saving || isBusy || !name.trim() || !rowsAreValid} type="submit">
            {saving ? "Сохраняем..." : "Сохранить набор"}
          </button>
        </footer>
      </form>
    </SettingsModal>{discardDialog}</>
  );
}

function SettingsModal({ children, onClose, title, wide, pending }: {
  children: ReactNode; onClose: () => void; title: string; wide?: boolean; pending: boolean;
}) {
  return <ModalShell title={title} className={`inventory-settings-dialog ${wide ? "is-wide" : ""}`} onClose={onClose} pending={pending}>{children}</ModalShell>;
}

function SettingsState({ compact, kind, text, title }: { compact?: boolean; kind: "empty" | "error" | "loading"; text: string; title: string }) {
  return (
    <div className={`inventory-settings-state is-${kind} ${compact ? "is-compact" : ""}`}>
      <span>{kind === "loading" ? "..." : kind === "error" ? "!" : "0"}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function parseOptionalNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

