import { useId, useMemo, useRef, useState } from "react";
import { Check, ClipboardCheck, PackageCheck, Search, ShieldCheck, UserRound } from "lucide-react";
import type { CreateInventoryCustodyRecordDto, InventoryEmployeeDto, InventoryItemDto } from "../../../api/contracts";
import { PhoneDisclosure } from "../../../shared/ui/PhoneDisclosure";
import { Button, ModalShell, useDialogCloseGuard } from "../../../shared/ui";
import { CUSTODY_ITEM_GROUPS, getCustodyItemGroup, parsePositiveQuantity } from "./custodyCommon";
import { emptyRecordForm, type RecordForm } from "./custodyTypes";
import { useCustodyCommand } from "./useCustodyCommand";

const CONDITION_OPTIONS = ["Исправен", "Неисправен", "Поломка", "Требует проверки"];
export function CustodyIssueDialog({ employees, items, onClose, onSave }: {
  employees: InventoryEmployeeDto[]; items: InventoryItemDto[]; onClose: () => void; onSave: (payload: CreateInventoryCustodyRecordDto) => Promise<void | boolean>;
}) {
  const [form, setForm] = useState<RecordForm>(() => ({ ...emptyRecordForm }));
  const [condition, setCondition] = useState(CONDITION_OPTIONS[0]);
  const [employeeQuery, setEmployeeQuery] = useState(""), [itemQuery, setItemQuery] = useState(""), [group, setGroup] = useState("all");
  const [employeePage, setEmployeePage] = useState(1), [itemPage, setItemPage] = useState(1);
  const [employeeExpanded, setEmployeeExpanded] = useState(false), [itemExpanded, setItemExpanded] = useState(false);
  const employeePanel = useRef<HTMLDivElement>(null), itemPanel = useRef<HTMLDivElement>(null);
  const command = useCustodyCommand(onClose);
  const formError = command.error, setFormError = command.setError;
  const formId = useId();
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: JSON.stringify(form) !== JSON.stringify(emptyRecordForm) || condition !== CONDITION_OPTIONS[0], pending: command.pending, onClose });
  const activeEmployees = useMemo(() => employees.filter(employee => employee.status !== "archived"), [employees]);
  const activeItems = useMemo(() => items.filter(item => item.isActive !== false), [items]);
  const filteredEmployees = useMemo(() => { const query=employeeQuery.trim().toLocaleLowerCase("ru"); return activeEmployees.filter(employee => [employee.fullName,employee.personnelNo,employee.department,employee.position].join(" ").toLocaleLowerCase("ru").includes(query)); }, [activeEmployees, employeeQuery]);
  const filteredItems = useMemo(() => { const query=itemQuery.trim().toLocaleLowerCase("ru"); return activeItems.filter(item => (group === "all" || getCustodyItemGroup(item) === group) && [item.name,item.sku,item.article,item.category,item.modelName,item.brandName].join(" ").toLocaleLowerCase("ru").includes(query)); }, [activeItems, itemQuery, group]);
  const employeePageRows = filteredEmployees.slice((Math.min(employeePage, Math.max(1, Math.ceil(filteredEmployees.length / 25))) - 1) * 25, Math.min(employeePage, Math.max(1, Math.ceil(filteredEmployees.length / 25))) * 25);
  const itemPageRows = filteredItems.slice((Math.min(itemPage, Math.max(1, Math.ceil(filteredItems.length / 25))) - 1) * 25, Math.min(itemPage, Math.max(1, Math.ceil(filteredItems.length / 25))) * 25);
  const selectedEmployee = activeEmployees.find(employee => employee.id === form.employeeId), selectedItem = activeItems.find(item => item.id === form.itemId);
  const canSubmit = Boolean(selectedEmployee && selectedItem && parsePositiveQuantity(form.quantityText));
  function submit() {
    if (!selectedEmployee || !selectedItem) { setFormError("Выберите доступных сотрудника и предмет. Ранее выбранная запись могла измениться."); return; }
    const quantity = parsePositiveQuantity(form.quantityText);
    if (!quantity) { setFormError("Укажите количество больше нуля."); return; }
    void command.run(() => onSave({ comment: [`Состояние: ${condition}`, form.comment.trim()].filter(Boolean).join(". "), documentId: null, employeeId: form.employeeId, itemId: form.itemId, quantity, warehouseId: null }));
  }
  return <><ModalShell title="Новая выдача сотруднику" subtitle="Выберите сотрудника, предмет, количество и состояние." className="custody-issue-dialog" pending={command.pending} onClose={requestClose}
    actions={<><Button disabled={command.pending} onClick={requestClose} variant="ghost">Отмена</Button><Button disabled={command.pending || !canSubmit} form={formId} type="submit" variant="primary">{command.pending ? "Проводим…" : "Выдать под запись"}</Button></>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); submit(); }}><fieldset disabled={command.pending}>
              <div className="custody-issue-layout">
                <div className="custody-choice-panel" ref={employeePanel}><PhoneDisclosure title={`Сотрудник: ${selectedEmployee?.fullName ?? "выбрать"}`} expanded={employeeExpanded} onExpandedChange={setEmployeeExpanded}><section className="custody-choice-card">
                  <div className="custody-choice-heading">
                    <UserRound size={18} />
                    <div>
                      <strong>Сотрудник</strong>
                      <span>{selectedEmployee?.fullName ?? "Не выбран"}</span>
                    </div>
                  </div>
                  <label className="custody-choice-search">
                    <Search size={16} />
                    <input
                      autoComplete="off"
                      onChange={(event) => { setEmployeeQuery(event.target.value); setEmployeePage(1); }}
                      aria-label="Поиск сотрудников для выдачи" placeholder="ФИО, табельный номер, подразделение"
                      value={employeeQuery}
                    />
                  </label>
                  <div className="custody-choice-list">
                    {employeePageRows.map((employee) => (
                      <button
                        aria-label={`Выбрать сотрудника: ${employee.fullName}`} aria-pressed={employee.id === form.employeeId} className={employee.id === form.employeeId ? "is-selected" : ""}
                        key={employee.id}
                        onClick={() => { setFormError(""); setForm((current) => ({ ...current, employeeId: employee.id })); setEmployeeExpanded(false); employeePanel.current?.querySelector<HTMLButtonElement>(".phone-disclosure-toggle")?.focus(); }}
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
                    {!filteredEmployees.length ? (
                      <div className="custody-choice-empty">
                        <strong>Сотрудник не найден</strong>
                        <span>Измените ФИО, табельный номер или подразделение.</span>
                      </div>
                    ) : null}
                  </div>
                  <CustodyPickerPager page={employeePage} total={filteredEmployees.length} onPage={setEmployeePage} label="Страницы сотрудников" />
                </section></PhoneDisclosure></div>

                <div className="custody-choice-panel" ref={itemPanel}><PhoneDisclosure title={`Предмет: ${selectedItem?.name ?? "выбрать"}`} expanded={itemExpanded} onExpandedChange={setItemExpanded}><section className="custody-choice-card">
                  <div className="custody-choice-heading">
                    <PackageCheck size={18} />
                    <div>
                      <strong>Предмет</strong>
                      <span>{selectedItem?.name ?? "Не выбран"}</span>
                    </div>
                  </div>
                  <div className="custody-choice-filters">
                    <label className="custody-choice-search">
                      <Search size={16} />
                      <input
                        autoComplete="off"
                        onChange={(event) => { setItemQuery(event.target.value); setItemPage(1); }}
                        aria-label="Поиск предметов для выдачи" placeholder="Название, артикул, группа"
                        value={itemQuery}
                      />
                    </label>
                    <select value={group} onChange={(event) => { setGroup(event.target.value); setItemPage(1); }} aria-label="Группа предметов">
                      <option value="all">Все группы</option>
                      {CUSTODY_ITEM_GROUPS.map((row) => (
                        <option key={row} value={row}>{row}</option>
                      ))}
                    </select>
                  </div>
                  <div className="custody-choice-list">
                    {itemPageRows.map((item) => (
                      <button
                        aria-label={`Выбрать предмет: ${item.name}`} aria-pressed={item.id === form.itemId} className={item.id === form.itemId ? "is-selected" : ""}
                        key={item.id}
                        onClick={() => { setFormError(""); setForm((current) => ({ ...current, itemId: item.id })); setItemExpanded(false); itemPanel.current?.querySelector<HTMLButtonElement>(".phone-disclosure-toggle")?.focus(); }}
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
                    {!filteredItems.length ? (
                      <div className="custody-choice-empty">
                        <strong>Предмет не найден</strong>
                        <span>Проверьте название, артикул или выбранную группу.</span>
                      </div>
                    ) : null}
                  </div>
                  <CustodyPickerPager page={itemPage} total={filteredItems.length} onPage={setItemPage} label="Страницы предметов" />
                </section></PhoneDisclosure></div>

                <section className="custody-issue-details">
                  <div className="custody-issue-selection">
                    <ClipboardCheck size={18} />
                    <div>
                      <span>Выбрано</span>
                      <strong>{selectedEmployee?.fullName ?? "Сотрудник не выбран"}</strong>
                      <small>{selectedItem?.name ?? "Предмет не выбран"}</small>
                    </div>
                  </div>
                  <label>
                    Количество
                    <input required value={form.quantityText} onChange={(event) => { setFormError(""); setForm((current) => ({ ...current, quantityText: event.target.value })); }} />
                  </label>
                  <label>
                    Состояние предмета
                    <select value={condition} onChange={(event) => setCondition(event.target.value)}>
                      {CONDITION_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
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
                  <div className="custody-issue-note">
                    <ShieldCheck size={16} />
                    <span>После сохранения запись появится в истории сотрудника. Возврат, списание и неисправность фиксируются отдельным действием по строке.</span>
                  </div>
                  {formError || !canSubmit ? (
                    <div className={`custody-issue-state ${formError ? "is-error" : ""}`} role={formError ? "alert" : "status"}>
                      {formError || "Выберите сотрудника, предмет и количество, чтобы провести выдачу."}
                    </div>
                  ) : null}
                </section>
              </div>


    </fieldset></form>
  </ModalShell>{discardDialog}</>;
}
function CustodyPickerPager({ page, total, onPage, label }: { page: number; total: number; onPage: (page: number) => void; label: string }) {
  const count=Math.max(1,Math.ceil(total/25)), current=Math.min(page,count);
  return <nav className="custody-picker-pager" aria-label={label}><Button size="sm" variant="ghost" disabled={current<=1} onClick={() => onPage(current-1)}>Назад</Button><span>{current} / {count} · {total} записей</span><Button size="sm" variant="ghost" disabled={current>=count} onClick={() => onPage(current+1)}>Вперёд</Button></nav>;
}
function getInitials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toLocaleUpperCase("ru"); }
