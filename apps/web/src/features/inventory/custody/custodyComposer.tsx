import { useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ClipboardCheck, PackageCheck, Plus, Search, ShieldCheck, UserRound, X } from "lucide-react";
import type {
  InventoryEmployeeDto,
  InventoryItemDto,
} from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { CUSTODY_ITEM_GROUPS, getCustodyItemGroup, parsePositiveQuantity } from "./custodyCommon";
import { emptyRecordForm, type RecordForm } from "./custodyTypes";

const CONDITION_OPTIONS = [
  { label: "Исправен", value: "Исправен" },
  { label: "Неисправен", value: "Неисправен" },
  { label: "Поломка", value: "Поломка" },
  { label: "Требует проверки", value: "Требует проверки" },
];

export function CustodyComposer({
  employees,
  items,
  onNotify,
  onReload,
}: {
  employees: InventoryEmployeeDto[];
  items: InventoryItemDto[];
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
}) {
  const inventoryRepository = useInventoryRepository();
  const [form, setForm] = useState<RecordForm>(emptyRecordForm);
  const [saving, setSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [condition, setCondition] = useState(CONDITION_OPTIONS[0].value);

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.status !== "archived"),
    [employees],
  );

  const activeItems = useMemo(
    () => items.filter((item) => item.isActive !== false),
    [items],
  );

  const filteredEmployees = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase();
    if (!query) return activeEmployees.slice(0, 30);
    return activeEmployees
      .filter((employee) =>
        [employee.fullName, employee.personnelNo, employee.department, employee.position]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 30);
  }, [activeEmployees, employeeQuery]);

  const filteredItems = useMemo(() => {
    const query = itemQuery.trim().toLowerCase();
    return activeItems
      .filter((item) => group === "all" || getCustodyItemGroup(item) === group)
      .filter((item) =>
        !query
          || [item.name, item.sku, item.category, getCustodyItemGroup(item), item.article, item.modelName, item.brandName]
            .join(" ")
            .toLowerCase()
            .includes(query),
      )
      .slice(0, 40);
  }, [activeItems, group, itemQuery]);

  const selectedEmployee = activeEmployees.find((employee) => employee.id === form.employeeId) ?? null;
  const selectedItem = activeItems.find((item) => item.id === form.itemId) ?? null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = parsePositiveQuantity(form.quantityText);
    if (!form.employeeId || !form.itemId || !quantity) {
      onNotify("Выберите сотрудника, предмет и количество");
      return;
    }

    const conditionText = `Состояние: ${condition}`;
    const comment = [conditionText, form.comment.trim()].filter(Boolean).join(". ");

    try {
      setSaving(true);
      await inventoryRepository.createCustodyRecord({
        comment,
        documentId: null,
        employeeId: form.employeeId,
        itemId: form.itemId,
        quantity,
        warehouseId: null,
      });
      setForm((current) => ({
        ...current,
        comment: "",
        documentId: null,
        itemId: "",
        quantity: 1,
        quantityText: "1",
      }));
      setCondition(CONDITION_OPTIONS[0].value);
      onNotify("Запись под ответственность создана");
      setIsOpen(false);
      await onReload();
    } catch (createError) {
      onNotify(createError instanceof Error ? createError.message : "Не удалось создать запись под ответственность");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="inventory-custody-composer" aria-label="Выдача под запись">
      <div className="inventory-custody-step">
        <span>1</span>
        <div>
          <strong>Выдача под запись</strong>
          <small>Откройте мастер, выберите сотрудника и предмет. Запись попадет в историю движения сотрудника.</small>
        </div>
      </div>
      <div className="inventory-custody-composer-summary">
        <div>
          <span>Сотрудников</span>
          <strong>{activeEmployees.length}</strong>
        </div>
        <div>
          <span>Предметов</span>
          <strong>{activeItems.length}</strong>
        </div>
        <div>
          <span>Групп учета</span>
          <strong>{CUSTODY_ITEM_GROUPS.length}</strong>
        </div>
      </div>
      <button className="button primary inventory-custody-submit" type="button" onClick={() => setIsOpen(true)}>
        <Plus size={16} />
        Новая выдача
      </button>

      {isOpen
        ? createPortal(
          <div className="inventory-custody-modal-backdrop" role="presentation" onMouseDown={() => setIsOpen(false)}>
            <form className="inventory-custody-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
              <div className="inventory-custody-modal-head">
                <div>
                  <span>Под запись</span>
                  <h2>Новая выдача сотруднику</h2>
                  <p>Выберите сотрудника, предмет, количество и состояние. Складские остатки здесь не используются.</p>
                </div>
                <button className="button ghost" type="button" onClick={() => setIsOpen(false)} aria-label="Закрыть">
                  <X size={18} />
                </button>
              </div>

              <div className="inventory-custody-modal-body">
                <section className="inventory-custody-picker-panel">
                  <div className="inventory-custody-picker-title">
                    <UserRound size={18} />
                    <div>
                      <strong>Сотрудник</strong>
                      <span>{selectedEmployee?.fullName ?? "Не выбран"}</span>
                    </div>
                  </div>
                  <label className="inventory-custody-modal-search">
                    <Search size={16} />
                    <input
                      autoComplete="off"
                      onChange={(event) => setEmployeeQuery(event.target.value)}
                      placeholder="ФИО, табельный номер, подразделение"
                      value={employeeQuery}
                    />
                  </label>
                  <div className="inventory-custody-picker-list">
                    {filteredEmployees.map((employee) => (
                      <button
                        className={employee.id === form.employeeId ? "is-selected" : ""}
                        key={employee.id}
                        onClick={() => setForm((current) => ({ ...current, employeeId: employee.id }))}
                        type="button"
                      >
                        <span>{getInitials(employee.fullName)}</span>
                        <div>
                          <strong>{employee.fullName}</strong>
                          <small>{[employee.personnelNo, employee.department, employee.position].filter(Boolean).join(" · ") || "Данные не указаны"}</small>
                        </div>
                        {employee.id === form.employeeId ? <Check size={16} /> : null}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="inventory-custody-picker-panel">
                  <div className="inventory-custody-picker-title">
                    <PackageCheck size={18} />
                    <div>
                      <strong>Предмет</strong>
                      <span>{selectedItem?.name ?? "Не выбран"}</span>
                    </div>
                  </div>
                  <div className="inventory-custody-modal-filters">
                    <label className="inventory-custody-modal-search">
                      <Search size={16} />
                      <input
                        autoComplete="off"
                        onChange={(event) => setItemQuery(event.target.value)}
                        placeholder="Название, артикул, группа"
                        value={itemQuery}
                      />
                    </label>
                    <select value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Группа предметов">
                      <option value="all">Все группы</option>
                      {CUSTODY_ITEM_GROUPS.map((row) => (
                        <option key={row} value={row}>{row}</option>
                      ))}
                    </select>
                  </div>
                  <div className="inventory-custody-picker-list">
                    {filteredItems.map((item) => (
                      <button
                        className={item.id === form.itemId ? "is-selected" : ""}
                        key={item.id}
                        onClick={() => setForm((current) => ({ ...current, itemId: item.id }))}
                        type="button"
                      >
                        <span><PackageCheck size={16} /></span>
                        <div>
                          <strong>{item.name}</strong>
                          <small>{[getCustodyItemGroup(item), item.category, item.sku ? `Арт.: ${item.sku}` : null, item.unit].filter(Boolean).join(" · ") || "Параметры не указаны"}</small>
                        </div>
                        {item.id === form.itemId ? <Check size={16} /> : null}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="inventory-custody-details-panel">
                  <div className="inventory-custody-selected-card">
                    <ClipboardCheck size={18} />
                    <div>
                      <span>Выбрано</span>
                      <strong>{selectedEmployee?.fullName ?? "Сотрудник не выбран"}</strong>
                      <small>{selectedItem?.name ?? "Предмет не выбран"}</small>
                    </div>
                  </div>
                  <label>
                    Количество
                    <input required value={form.quantityText} onChange={(event) => setForm((current) => ({ ...current, quantityText: event.target.value }))} />
                  </label>
                  <label>
                    Состояние предмета
                    <select value={condition} onChange={(event) => setCondition(event.target.value)}>
                      {CONDITION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Комментарий
                    <textarea
                      onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))}
                      placeholder="Причина выдачи, неисправность, примечание"
                      value={form.comment}
                    />
                  </label>
                  <div className="inventory-custody-modal-note">
                    <ShieldCheck size={16} />
                    <span>После сохранения запись появится в истории сотрудника. Возврат, списание и неисправность фиксируются отдельным действием по строке.</span>
                  </div>
                </section>
              </div>

              <div className="inventory-custody-modal-footer">
                <button className="button ghost" type="button" onClick={() => setIsOpen(false)}>Отмена</button>
                <button className="button primary" disabled={saving} type="submit">
                  <Plus size={16} />
                  {saving ? "Создание..." : "Создать запись"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )
        : null}
    </section>
  );
}

function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
