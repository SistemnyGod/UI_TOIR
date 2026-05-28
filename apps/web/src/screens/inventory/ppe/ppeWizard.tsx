import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import type {
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryItemSetDto,
  InventoryItemSetItemDto,
  InventorySettingsDto,
} from "../../../api/contracts";
import { useInventoryRepository } from "../../../repositories/inventoryRepositoryContext";
import { INVENTORY_PPE_DEFAULT_NORM_TEXT, INVENTORY_PPE_WIZARD_STEPS } from "./inventoryPpeConfig";
import {
  employeeStatusLabel,
  formatDate,
  formatMoney,
  formatQuantity,
  getDefaultDueDate,
  PpeState,
  ReadOnlyField,
  toLineFromNorm,
} from "./ppeCommon";
import { PrintPaper } from "./ppePrint";
import type { ApiFile, PickerLineInput, PpeWizardLine, PpeWizardState, PrintData, PrintMode } from "./ppeTypes";

type EmployeeComboboxProps = {
  employees: InventoryEmployeeDto[];
  onChange: (employeeId: string) => void;
  value: string;
};

type PickerReferenceListProps = {
  categoryId: string;
  emptyText: string;
  loading: boolean;
  loadingSetId: string;
  onAdd: (row: InventoryItemSetDto) => void;
  query: string;
  rows: InventoryItemSetDto[];
  setItemsById: Record<string, InventoryItemSetItemDto[]>;
};

type PickerSelectedDraft = {
  dueAt: string;
  priceText: string;
};

export function PpeWizard({
  busy,
  employee,
  employees,
  onAddItems,
  onBackToJournal,
  onDownload,
  onPatchLine,
  onPreview,
  onPrint,
  onRemoveLine,
  onSave,
  onStepChange,
  onWizardChange,
  printData,
  settings,
  wizard,
}: {
  busy: boolean;
  employee: InventoryEmployeeDto | null;
  employees: InventoryEmployeeDto[];
  onAddItems: () => void;
  onBackToJournal: () => void;
  onDownload: (action: () => Promise<ApiFile>) => Promise<void>;
  onPatchLine: (index: number, patch: Partial<PpeWizardLine>) => void;
  onPreview: (mode: PrintMode) => void;
  onPrint: (mode: PrintMode) => void;
  onRemoveLine: (index: number) => void;
  onSave: (confirmIssue: boolean) => void;
  onStepChange: (step: number) => void;
  onWizardChange: (wizard: PpeWizardState) => void;
  printData: PrintData;
  settings?: InventorySettingsDto;
  wizard: PpeWizardState;
}) {
  const inventoryRepository = useInventoryRepository();
  return (
    <section className="inventory-ppe-wizard">
      <header className="inventory-ppe-wizard-head">
        <div>
          <h2>{wizard.mode === "edit" ? "Редактирование карточки СИЗ" : "Создание карточки СИЗ"}</h2>
          <p>СИЗ / {wizard.mode === "edit" ? "Редактирование" : "Создание карточки"}</p>
        </div>
        <div className="inventory-ppe-command-actions">
          <button className="button ghost" onClick={() => onPreview("card")} type="button">
            Предпросмотр
          </button>
          <button
            className="button ghost"
            disabled={!wizard.cardId}
            onClick={() =>
              wizard.cardId
                ? void onDownload(() => inventoryRepository.printPpeCard(wizard.cardId!, "card", "docx"))
                : undefined
            }
            type="button"
          >
            Карточка DOCX
          </button>
          <button
            className="button ghost"
            disabled={!wizard.cardId}
            onClick={() =>
              wizard.cardId
                ? void onDownload(() => inventoryRepository.printPpeCard(wizard.cardId!, "sheet", "docx"))
                : undefined
            }
            type="button"
          >
            Роспись DOCX
          </button>
        </div>
      </header>

      <nav className="inventory-ppe-wizard-steps" aria-label="Шаги карточки СИЗ">
        {INVENTORY_PPE_WIZARD_STEPS.map((step, index) => (
          <button
            className={wizard.step === index ? "is-active" : ""}
            key={step}
            onClick={() => onStepChange(index)}
            type="button"
          >
            <span>{index + 1}</span>
            {step}
          </button>
        ))}
      </nav>

      <div className="inventory-ppe-wizard-layout">
        <div className="inventory-ppe-wizard-main">
          {wizard.step === 0 ? (
            <section className="inventory-ppe-wizard-panel">
              <h3>Данные сотрудника</h3>
              <div className="inventory-ppe-form-grid">
                <label className="inventory-ppe-field is-wide">
                  <span>Сотрудник</span>
                  <EmployeeCombobox
                    employees={employees}
                    onChange={(employeeId) => onWizardChange({ ...wizard, employeeId })}
                    value={wizard.employeeId}
                  />
                </label>
                <ReadOnlyField label="Должность" value={employee?.position || "Не указана"} />
                <ReadOnlyField label="Подразделение" value={employee?.department || "Не указано"} />
                <ReadOnlyField label="Табельный номер" value={employee?.personnelNo || "Не указан"} />
                <ReadOnlyField label="Статус" value={employeeStatusLabel(employee?.status ?? "active")} />
              </div>
              {employee ? (
                <div className="inventory-ppe-wizard-employee">
                  <span>{employee.fullName.slice(0, 1)}</span>
                  <div>
                    <strong>{employee.fullName}</strong>
                    <small>
                      {[employee.position, employee.department, employee.personnelNo].filter(Boolean).join(" вЂў ")}
                    </small>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {wizard.step === 1 ? (
            <section className="inventory-ppe-wizard-panel">
              <h3>Параметры карточки</h3>
              <div className="inventory-ppe-form-grid">
                <label className="inventory-ppe-field is-wide">
                  <span>Основание выдачи</span>
                  <textarea
                    onChange={(event) => onWizardChange({ ...wizard, comment: event.target.value })}
                    placeholder={INVENTORY_PPE_DEFAULT_NORM_TEXT}
                    value={wizard.comment}
                  />
                </label>
                <ReadOnlyField label="Дата оформления" value={formatDate(new Date().toISOString(), "date")} />
                <ReadOnlyField label="Строк в карточке" value={String(wizard.lines.length)} />
              </div>
            </section>
          ) : null}

          {wizard.step === 2 ? (
            <section className="inventory-ppe-wizard-panel">
              <div className="inventory-ppe-panel-actions">
                <div>
                  <h3>Положено по нормам и фактическая выдача</h3>
                  <p>Добавьте позиции вручную, из норм по должности или из готового набора.</p>
                </div>
                <button className="button primary" onClick={onAddItems} type="button">
                  <Plus size={16} />
                  Добавить СИЗ
                </button>
              </div>
              <WizardLinesTable lines={wizard.lines} onPatchLine={onPatchLine} onRemoveLine={onRemoveLine} settings={settings} />
            </section>
          ) : null}

          {wizard.step === 3 ? (
            <section className="inventory-ppe-wizard-panel">
              <h3>Печать и предпросмотр</h3>
              <div className="inventory-ppe-wizard-summary">
                <ReadOnlyField label="Сотрудник" value={printData.employeeName} />
                <ReadOnlyField label="Должность" value={printData.position || "Не указана"} />
                <ReadOnlyField label="Строки" value={String(printData.lines.length)} />
                <ReadOnlyField label="Дата" value={formatDate(new Date().toISOString(), "date")} />
              </div>
              <div className="inventory-ppe-panel-actions">
                <button className="button ghost" onClick={() => onPreview("card")} type="button">
                  Предпросмотр карточки
                </button>
                <button className="button ghost" onClick={() => onPreview("sheet")} type="button">
                  Предпросмотр росписи
                </button>
                <button className="button ghost" onClick={() => onPrint("card")} type="button">
                  Печать карточки
                </button>
                <button className="button ghost" onClick={() => onPrint("sheet")} type="button">
                  Печать росписи
                </button>
              </div>
              <PrintPaper data={printData} mode="card" />
            </section>
          ) : null}

          <footer className="inventory-ppe-wizard-actions">
            <button className="button ghost" onClick={onBackToJournal} type="button">
              Назад к журналу
            </button>
            <div>
              <button
                className="button ghost"
                disabled={wizard.step === 0}
                onClick={() => onStepChange(Math.max(0, wizard.step - 1))}
                type="button"
              >
                Назад
              </button>
              <button
                className="button ghost"
                disabled={wizard.step === INVENTORY_PPE_WIZARD_STEPS.length - 1}
                onClick={() => onStepChange(Math.min(INVENTORY_PPE_WIZARD_STEPS.length - 1, wizard.step + 1))}
                type="button"
              >
                Далее
              </button>
              <button className="button ghost" disabled={!wizard.lines.length || busy} onClick={() => onSave(true)} type="button">
                Подтвердить выдачу
              </button>
              <button className="button primary" disabled={!wizard.employeeId || busy} onClick={() => onSave(false)} type="button">
                {busy ? "Сохранение..." : "Сохранить карточку"}
              </button>
            </div>
          </footer>
        </div>

        <aside className="inventory-ppe-wizard-preview">
          <div className="inventory-ppe-preview-head">
            <div>
              <h3>Предпросмотр печати</h3>
              <p>Клиентский бланк до сохранения. DOCX доступен после сохранения карточки.</p>
            </div>
          </div>
          <PrintPaper data={printData} mode="sheet" />
        </aside>
      </div>
    </section>
  );
}

function EmployeeCombobox({ employees, onChange, value }: EmployeeComboboxProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedEmployee = employees.find((employee) => employee.id === value) ?? null;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery(selectedEmployee ? formatEmployeeOption(selectedEmployee) : "");
  }, [selectedEmployee]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery(selectedEmployee ? formatEmployeeOption(selectedEmployee) : "");
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [selectedEmployee]);

  const filteredEmployees = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return employees.filter((employee) => {
      if (employee.status === "archived") {
        return false;
      }

      if (!normalized) {
        return true;
      }

      return [employee.fullName, employee.personnelNo, employee.position, employee.department]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [employees, query]);

  return (
    <div className="inventory-ppe-combobox" ref={rootRef}>
      <div className="inventory-ppe-combobox-input">
        <Search size={16} />
        <input
          aria-expanded={isOpen}
          aria-label="Поиск сотрудника"
          onChange={(event) => {
            const nextValue = event.target.value;
            setQuery(nextValue);
            setIsOpen(true);
            if (!nextValue.trim() && value) {
              onChange("");
            }
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Найдите по ФИО, табельному номеру, должности"
          role="combobox"
          value={query}
        />
        {value ? (
          <button
            aria-label="Очистить сотрудника"
            className="inventory-ppe-combobox-clear"
            onClick={() => {
              onChange("");
              setQuery("");
              setIsOpen(true);
            }}
            type="button"
          >
            <X size={15} />
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div className="inventory-ppe-combobox-list" role="listbox">
          {filteredEmployees.length ? (
            filteredEmployees.slice(0, 12).map((employee) => (
              <button
                className={employee.id === value ? "is-selected" : ""}
                key={employee.id}
                onClick={() => {
                  onChange(employee.id);
                  setQuery(formatEmployeeOption(employee));
                  setIsOpen(false);
                }}
                role="option"
                type="button"
              >
                <strong>{employee.fullName}</strong>
                <small>{[employee.position, employee.department, employee.personnelNo].filter(Boolean).join(" вЂў ")}</small>
              </button>
            ))
          ) : (
            <div className="inventory-ppe-combobox-empty">Сотрудник не найден</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function WizardLinesTable({
  lines,
  onPatchLine,
  onRemoveLine,
  settings,
}: {
  lines: PpeWizardLine[];
  onPatchLine: (index: number, patch: Partial<PpeWizardLine>) => void;
  onRemoveLine: (index: number) => void;
  settings?: InventorySettingsDto;
}) {
  if (!lines.length) {
    return (
      <PpeState
        kind="empty"
        title="Позиции пока не добавлены"
        text="Подтяните нормы должности, наборы или добавьте СИЗ вручную."
      />
    );
  }

  return (
    <div className="inventory-ppe-lines-wrap inventory-ppe-wizard-lines">
      <table className="inventory-ppe-lines-table">
        <thead>
          <tr>
            <th>СИЗ</th>
            <th>Склад</th>
            <th>Кол-во</th>
            <th>Срок</th>
            <th>Цена</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.item.id}-${index}`}>
              <td>
                <strong>{line.item.name}</strong>
                <span>{line.item.article || line.item.sku || "без артикула"}</span>
              </td>
              <td>
                <select value={line.warehouseId} onChange={(event) => onPatchLine(index, { warehouseId: event.target.value })}>
                  <option value="">Не указан</option>
                  {settings?.warehouses.filter((row) => row.isActive).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input value={line.quantityText} onChange={(event) => onPatchLine(index, { quantityText: event.target.value })} />
              </td>
              <td>
                <input type="date" value={line.dueAt} onChange={(event) => onPatchLine(index, { dueAt: event.target.value })} />
              </td>
              <td>
                <input value={line.priceText} onChange={(event) => onPatchLine(index, { priceText: event.target.value })} />
              </td>
              <td>
                <select value={line.status} onChange={(event) => onPatchLine(index, { status: event.target.value })}>
                  <option value="not_issued">Не выдано</option>
                  <option value="issued">Выдано</option>
                </select>
              </td>
              <td>
                <button className="button ghost danger" onClick={() => onRemoveLine(index)} type="button">
                  <Trash2 size={15} /> Удалить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PpeItemPickerModal({
  employee,
  isOpen,
  items,
  onAdd,
  onClose,
  settings,
}: {
  employee: InventoryEmployeeDto | null;
  isOpen: boolean;
  items: InventoryItemDto[];
  onAdd: (lines: PickerLineInput[]) => void;
  onClose: () => void;
  settings?: InventorySettingsDto;
}) {
  const inventoryRepository = useInventoryRepository();
  const [tab, setTab] = useState<"items" | "norms" | "sets" | "templates">("items");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedDrafts, setSelectedDrafts] = useState<Record<string, PickerSelectedDraft>>({});
  const [loadingSetId, setLoadingSetId] = useState("");
  const [setItemsById, setSetItemsById] = useState<Record<string, InventoryItemSetItemDto[]>>({});
  const [setsLoading, setSetsLoading] = useState(false);

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const ppeItems = useMemo(
    () => items.filter((item) => item.isActive && (item.trackingType === "ppe" || item.itemKind === "ppe" || item.trackLife)),
    [items],
  );
  const activeSetRows = useMemo(() => (settings?.itemSets ?? []).filter((row) => row.isActive), [settings?.itemSets]);
  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of ppeItems) {
      if (!item.categoryId) {
        continue;
      }
      counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
    }

    return (settings?.categories ?? [])
      .filter((row) => row.isActive)
      .map((row) => ({ count: counts.get(row.id) ?? 0, id: row.id, name: row.name }))
      .filter((row) => row.count > 0);
  }, [ppeItems, settings?.categories]);
  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return ppeItems.filter((item) => {
      const matchesQuery =
        !normalized || [item.name, item.article, item.sku, item.category].join(" ").toLowerCase().includes(normalized);
      const matchesCategory = !categoryId || item.categoryId === categoryId;
      return matchesQuery && matchesCategory;
    });
  }, [categoryId, ppeItems, query]);
  const selectedItems = useMemo(() => ppeItems.filter((item) => selected.has(item.id)), [ppeItems, selected]);
  const selectedTotal = useMemo(
    () => selectedItems.reduce((sum, item) => sum + parsePriceText(selectedDrafts[item.id]?.priceText), 0),
    [selectedDrafts, selectedItems],
  );
  const norms = useMemo(
    () =>
      settings?.positionNorms.filter(
        (norm) => employee?.position && norm.positionName.toLowerCase() === employee.position.toLowerCase(),
      ) ?? [],
    [employee?.position, settings?.positionNorms],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSelected(new Set());
    setSelectedDrafts({});
    setQuery("");
    setCategoryId("");
    setTab("items");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || (tab !== "sets" && tab !== "templates") || !activeSetRows.length) {
      return;
    }

    let cancelled = false;
    setSetsLoading(true);

    void Promise.all(activeSetRows.map(async (row) => ({ id: row.id, items: await inventoryRepository.getItemSetItems(row.id) })))
      .then((loadedRows) => {
        if (cancelled) {
          return;
        }

        const nextState: Record<string, InventoryItemSetItemDto[]> = {};
        for (const row of loadedRows) {
          nextState[row.id] = row.items;
        }
        setSetItemsById(nextState);
      })
      .finally(() => {
        if (!cancelled) {
          setSetsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSetRows, inventoryRepository, isOpen, tab]);

  if (!isOpen) {
    return null;
  }

  function toggleItem(itemId: string) {
    const next = new Set(selected);
    if (next.has(itemId)) {
      next.delete(itemId);
      setSelectedDrafts((current) => {
        const { [itemId]: _, ...rest } = current;
        return rest;
      });
    } else {
      next.add(itemId);
      const item = itemsById.get(itemId);
      if (item) {
        setSelectedDrafts((current) => ({
          ...current,
          [itemId]: current[itemId] ?? {
            dueAt: getDefaultDueDate(item.defaultLifeMonths),
            priceText: String(item.defaultUnitPriceMinor ? Math.round(item.defaultUnitPriceMinor / 100) : 0),
          },
        }));
      }
    }
    setSelected(next);
  }

  function patchSelectedDraft(itemId: string, patch: Partial<PickerSelectedDraft>) {
    setSelectedDrafts((current) => ({
      ...current,
      [itemId]: {
        dueAt: current[itemId]?.dueAt ?? "",
        priceText: current[itemId]?.priceText ?? "0",
        ...patch,
      },
    }));
  }

  async function addSet(setId: string) {
    try {
      setLoadingSetId(setId);
      const rows = setItemsById[setId] ?? (await inventoryRepository.getItemSetItems(setId));
      if (!setItemsById[setId]) {
        setSetItemsById((current) => ({ ...current, [setId]: rows }));
      }
      onAdd(
        rows.map((row) => ({
          dueAt: getDefaultDueDate(row.item.defaultLifeMonths),
          item: row.item,
          normPoint: "Набор выдачи",
          priceText: String(row.item.defaultUnitPriceMinor ? Math.round(row.item.defaultUnitPriceMinor / 100) : 0),
          quantityText: String(row.quantity || 1),
        })),
      );
    } finally {
      setLoadingSetId("");
    }
  }

  return createPortal(
    <div className="inventory-ppe-picker-backdrop" role="presentation">
      <section className="inventory-ppe-picker" aria-label="Добавить СИЗ к выдаче">
        <header className="inventory-ppe-picker-head">
          <div>
            <h2>Добавить СИЗ к выдаче</h2>
            <p>Выберите предметы, нормы по должности или готовый набор.</p>
          </div>
          <button className="inventory-ppe-icon-button" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </header>
        <nav className="inventory-ppe-picker-tabs" aria-label="Источники СИЗ">
          <button className={tab === "items" ? "is-active" : ""} onClick={() => setTab("items")} type="button">
            Предметы
          </button>
          <button className={tab === "norms" ? "is-active" : ""} onClick={() => setTab("norms")} type="button">
            Норма
          </button>
          <button className={tab === "sets" ? "is-active" : ""} onClick={() => setTab("sets")} type="button">
            Наборы
          </button>
          <button className={tab === "templates" ? "is-active" : ""} onClick={() => setTab("templates")} type="button">
            Шаблоны
          </button>
        </nav>
        <div className="inventory-ppe-picker-layout">
          <div className="inventory-ppe-picker-main">
            <div className="inventory-ppe-picker-filters">
              <label className="inventory-ppe-search">
                <Search size={17} />
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Название, артикул, категория, набор"
                  value={query}
                />
              </label>
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Все категории</option>
                {categoryOptions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} ({row.count})
                  </option>
                ))}
              </select>
            </div>

            {tab === "items" ? (
              !visibleItems.length ? (
                <PpeState kind="empty" title="Нет предметов по фильтру" text="Измените поиск или выберите другую категорию." />
              ) : (
                <div className="inventory-ppe-picker-grid">
                  {visibleItems.map((item) => (
                    <button className={selected.has(item.id) ? "is-selected" : ""} key={item.id} onClick={() => toggleItem(item.id)} type="button">
                      <span className="inventory-ppe-picker-check">{selected.has(item.id) ? "✓" : ""}</span>
                      <span className="inventory-ppe-picker-item-main">
                        <strong>{item.name}</strong>
                        <small>{[item.article || item.sku || "без артикула", item.category || "без категории"].join(" • ")}</small>
                      </span>
                      <em>{formatMoney(item.defaultUnitPriceMinor ? item.defaultUnitPriceMinor / 100 : 0)}</em>
                    </button>
                  ))}
                </div>
              )
            ) : null}

            {tab === "norms" ? (
              !employee ? (
                <PpeState kind="empty" title="Сотрудник не выбран" text="Сначала выберите сотрудника в мастере карточки." />
              ) : norms.length ? (
                <div className="inventory-ppe-reference-list">
                  {norms.map((norm) => (
                    <article className="inventory-ppe-reference-card" key={norm.id}>
                      <div className="inventory-ppe-reference-card-head">
                        <div>
                          <strong>{norm.itemName}</strong>
                          <span>{norm.positionName}</span>
                        </div>
                        <button className="button ghost" onClick={() => onAdd([toLineFromNorm(norm, itemsById)])} type="button">
                          Добавить
                        </button>
                      </div>
                      <div className="inventory-ppe-reference-meta">
                        <span className="inventory-ppe-reference-chip">{formatQuantity(norm.quantity)} шт.</span>
                        <span className="inventory-ppe-reference-chip">{norm.lifeMonths ?? 12} мес.</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <PpeState
                  kind="empty"
                  title="Нормы не заданы"
                  text="Для должности сотрудника нет активных норм. Выберите предметы вручную."
                />
              )
            ) : null}

            {tab === "sets" || tab === "templates" ? (
              <PickerReferenceList
                categoryId={categoryId}
                emptyText={
                  tab === "sets"
                    ? "Наборы СИЗ пока не настроены."
                    : "Шаблоны используют настроенные наборы СИЗ. Сначала заполните наборы."
                }
                loading={setsLoading}
                loadingSetId={loadingSetId}
                onAdd={(row) => void addSet(row.id)}
                query={query}
                rows={activeSetRows}
                setItemsById={setItemsById}
              />
            ) : null}
          </div>

          <aside className="inventory-ppe-picker-summary">
            <div>
              <span>Итого к выдаче</span>
              <strong>{selectedItems.length}</strong>
              <small>{selectedItems.length} позиций выбрано</small>
            </div>
            <div>
              <span>Сумма</span>
              <strong>
                {formatMoney(selectedTotal)}
              </strong>
              <small>По выбранным предметам</small>
            </div>
          </aside>
        </div>
        <div className="inventory-ppe-picker-selected">
          {!selectedItems.length ? (
            <PpeState kind="empty" title="СИЗ не выбраны" text="Отметьте одну или несколько позиций в списке выше." />
          ) : (
            <SimpleSelectedItems drafts={selectedDrafts} items={selectedItems} onDraftChange={patchSelectedDraft} />
          )}
        </div>
        <footer className="inventory-ppe-picker-actions">
          <button className="button ghost" onClick={onClose} type="button">
            Отмена
          </button>
          <button
            className="button primary"
            disabled={!selectedItems.length}
            onClick={() =>
              onAdd(
                selectedItems.map((item) => ({
                  dueAt: selectedDrafts[item.id]?.dueAt ?? getDefaultDueDate(item.defaultLifeMonths),
                  item,
                  normPoint: item.normItemName || "",
                  priceText: selectedDrafts[item.id]?.priceText ?? String(item.defaultUnitPriceMinor ? Math.round(item.defaultUnitPriceMinor / 100) : 0),
                  quantityText: "1",
                })),
              )
            }
            type="button"
          >
            <Plus size={16} />
            Добавить в карточку
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function SimpleSelectedItems({
  drafts,
  items,
  onDraftChange,
}: {
  drafts: Record<string, PickerSelectedDraft>;
  items: InventoryItemDto[];
  onDraftChange: (itemId: string, patch: Partial<PickerSelectedDraft>) => void;
}) {
  return (
    <div className="inventory-ppe-lines-wrap inventory-ppe-picker-selected-table">
      <table className="inventory-ppe-lines-table">
        <thead>
          <tr>
            <th>СИЗ</th>
            <th>Марка / модель / артикул</th>
            <th>Срок</th>
            <th>Цена</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const draft = drafts[item.id] ?? {
              dueAt: getDefaultDueDate(item.defaultLifeMonths),
              priceText: String(item.defaultUnitPriceMinor ? Math.round(item.defaultUnitPriceMinor / 100) : 0),
            };

            return (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <span>{item.category || "без категории"}</span>
                </td>
                <td>{[item.brandName, item.modelName, item.article || item.sku].filter(Boolean).join(" / ") || "-"}</td>
                <td>
                  <input
                    aria-label={`Срок ${item.name}`}
                    onChange={(event) => onDraftChange(item.id, { dueAt: event.target.value })}
                    type="date"
                    value={draft.dueAt}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Цена ${item.name}`}
                    inputMode="decimal"
                    onChange={(event) => onDraftChange(item.id, { priceText: event.target.value })}
                    value={draft.priceText}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PickerReferenceList({
  categoryId,
  emptyText,
  loading,
  loadingSetId,
  onAdd,
  query,
  rows,
  setItemsById,
}: PickerReferenceListProps) {
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = rows.filter((row) => {
    const items = setItemsById[row.id] ?? [];
    const categories = getSetCategoryNames(items).join(" ").toLowerCase();
    const matchesQuery = !normalizedQuery || `${row.name} ${categories}`.toLowerCase().includes(normalizedQuery);
    const matchesCategory = !categoryId || items.some((item) => item.item.categoryId === categoryId);
    return matchesQuery && matchesCategory;
  });

  if (loading && !rows.length) {
    return <PpeState kind="loading" title="Загружаем наборы" text="Подтягиваем состав и категории наборов СИЗ." />;
  }

  if (!visibleRows.length) {
    return <PpeState kind="empty" title="Справочник пуст" text={emptyText} />;
  }

  return (
    <div className="inventory-ppe-reference-list">
      {visibleRows.map((row) => {
        const items = setItemsById[row.id] ?? [];
        const categories = getSetCategoryNames(items);
        const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

        return (
          <article className="inventory-ppe-reference-card" key={row.id}>
            <div className="inventory-ppe-reference-card-head">
              <div>
                <strong>{row.name}</strong>
                <span>{row.itemsCount} позиций в наборе</span>
              </div>
              <button className="button ghost" disabled={loadingSetId === row.id || row.itemsCount === 0} onClick={() => onAdd(row)} type="button">
                {loadingSetId === row.id ? "Загрузка..." : "Добавить набор"}
              </button>
            </div>
            <div className="inventory-ppe-reference-meta">
              <span className="inventory-ppe-reference-chip">
                {categories.length ? categories.join(", ") : loading ? "Загружаем категории..." : "Категории не указаны"}
              </span>
              <span className="inventory-ppe-reference-chip">Всего {totalQuantity || row.itemsCount} шт.</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function formatEmployeeOption(employee: InventoryEmployeeDto) {
  return [employee.fullName, employee.personnelNo].filter(Boolean).join(" вЂў ");
}

function getSetCategoryNames(items: InventoryItemSetItemDto[]) {
  return Array.from(new Set(items.map((row) => row.item.category).filter(Boolean))) as string[];
}

function parsePriceText(value?: string) {
  if (!value) return 0;
  const parsed = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

