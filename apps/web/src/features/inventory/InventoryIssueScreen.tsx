import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileClock,
  History,
  LayoutGrid,
  List,
  MoreHorizontal,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  CreateInventoryOperationDto,
  InventoryDocumentDto,
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryListResponseDto,
  InventoryOperationsModuleOptionsDto,
  InventorySettingsDto,
  InventoryStockBalanceDto,
} from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { PpeMovementHistoryPanel } from "./PpeMovementHistoryPanel";
import "./inventoryWeb.css";

type InventoryIssueScreenProps = {
  documents?: InventoryListResponseDto<InventoryDocumentDto>;
  employees?: InventoryEmployeeDto[];
  error?: string;
  items?: InventoryItemDto[];
  loading?: boolean;
  onNotify: (message: string) => void;
  onReload?: () => Promise<void>;
  settings?: InventorySettingsDto;
  stock?: InventoryListResponseDto<InventoryStockBalanceDto>;
};

type IssueTab = "issue" | "drafts" | "history";

type IssueDraftLine = {
  itemId: string;
  quantityText: string;
  unitPriceText: string;
  lineTotalText: string;
  warehouseId: string;
  inventoryNumber: string;
  issueDate: string;
  note: string;
  expanded: boolean;
};

const todayIso = new Date().toISOString().slice(0, 10);

export function InventoryIssueScreen({
  documents,
  employees = [],
  error,
  items = [],
  loading = false,
  onNotify,
  onReload,
  settings,
  stock,
}: InventoryIssueScreenProps) {
  const inventoryRepository = useInventoryRepository();
  const [activeTab, setActiveTab] = useState<IssueTab>("issue");
  const [employeeId, setEmployeeId] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [comment, setComment] = useState("");
  const [draft, setDraft] = useState<IssueDraftLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [movementEmployee, setMovementEmployee] = useState<InventoryEmployeeDto | null>(null);
  const [localDocuments, setLocalDocuments] = useState<InventoryListResponseDto<InventoryDocumentDto> | undefined>(documents);
  const [options, setOptions] = useState<InventoryOperationsModuleOptionsDto | null>(
    settings || items.length || employees.length || stock
      ? {
          employees,
          items,
          operationTypes: ["issue"],
          settings: settings ?? createEmptySettings(),
          stock: stock?.rows ?? [],
        }
      : null,
  );
  const [loadError, setLoadError] = useState<string | undefined>(error);
  const [dataLoading, setDataLoading] = useState(!documents || !options);
  const [reloadKey, setReloadKey] = useState(0);

  const loadIssueData = useCallback(async () => {
    setDataLoading(true);
    setLoadError(undefined);
    try {
      const [nextDocuments, nextOptions] = await Promise.all([
        inventoryRepository.getDocuments({ pageSize: 100 }),
        inventoryRepository.getIssueOptions(),
      ]);
      setLocalDocuments(nextDocuments);
      setOptions(nextOptions);
      await onReload?.();
    } catch (loadIssueError) {
      setLoadError(loadIssueError instanceof Error ? loadIssueError.message : "Не удалось загрузить данные выдачи");
    } finally {
      setDataLoading(false);
    }
  }, [inventoryRepository, onReload]);

  useEffect(() => {
    let mounted = true;
    setDataLoading(true);
    setLoadError(undefined);
    Promise.all([
      inventoryRepository.getDocuments({ pageSize: 100 }),
      inventoryRepository.getIssueOptions(),
    ])
      .then(([nextDocuments, nextOptions]) => {
        if (!mounted) return;
        setLocalDocuments(nextDocuments);
        setOptions(nextOptions);
      })
      .catch((loadIssueError) => {
        if (mounted) setLoadError(loadIssueError instanceof Error ? loadIssueError.message : "Не удалось загрузить данные выдачи");
      })
      .finally(() => {
        if (mounted) setDataLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [inventoryRepository, reloadKey]);

  useEffect(() => {
    if (error) setLoadError(error);
  }, [error]);

  const effectiveEmployees = options?.employees ?? employees;
  const effectiveItems = options?.items ?? items;
  const effectiveSettings = options?.settings ?? settings;
  const issueRows = localDocuments?.rows ?? documents?.rows ?? [];
  const selectedEmployee = effectiveEmployees.find((employee) => employee.id === employeeId) ?? null;
  const itemById = useMemo(() => new Map(effectiveItems.map((item) => [item.id, item])), [effectiveItems]);
  const isLoading = loading || dataLoading;
  const effectiveError = loadError ?? error;

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return effectiveItems.filter((item) => {
      const matchesQuery =
        !normalized ||
        [item.name, item.sku, item.article, item.category, item.normItemName, item.actualItemName, item.brandName, item.modelName]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      const matchesCategory = categoryId === "all" || item.categoryId === categoryId;
      return item.isActive && matchesQuery && matchesCategory;
    });
  }, [categoryId, effectiveItems, query]);

  const draftQuantity = draft.reduce((sum, line) => sum + (parsePositiveQuantity(line.quantityText) ?? 0), 0);
  const draftTotalMinor = draft.reduce((sum, line) => sum + parseMoneyMinor(line.lineTotalText), 0);
  const draftHasInvalidLines = draft.some((line) => {
    const quantity = parsePositiveQuantity(line.quantityText);
    return !line.itemId || !quantity;
  });

  function addLine(itemId: string) {
    setDraft((current) => {
      if (current.some((line) => line.itemId === itemId)) {
        return current.map((line) => {
          if (line.itemId !== itemId) return line;
          const quantity = parsePositiveQuantity(line.quantityText) ?? 0;
          const nextQuantity = quantity + 1;
          return {
            ...line,
            quantityText: String(nextQuantity),
            lineTotalText: formatMoneyMinor(Math.round(nextQuantity * parseMoneyMinor(line.unitPriceText))),
          };
        });
      }
      const defaultUnitPriceText = formatMoneyMinor(itemById.get(itemId)?.defaultUnitPriceMinor ?? 0);
      return [
        ...current,
        {
          expanded: false,
          inventoryNumber: itemById.get(itemId)?.article || itemById.get(itemId)?.sku || "",
          issueDate: todayIso,
          itemId,
          note: "",
          quantityText: "1",
          unitPriceText: defaultUnitPriceText,
          lineTotalText: defaultUnitPriceText,
          warehouseId: "",
        },
      ];
    });
  }

  function updateLine(itemId: string, patch: Partial<IssueDraftLine>) {
    setDraft((current) => current.map((line) => (line.itemId === itemId ? { ...line, ...patch } : line)));
  }

  function updateLineQuantity(line: IssueDraftLine, value: string) {
    const quantity = parsePositiveQuantity(value) ?? 0;
    updateLine(line.itemId, {
      quantityText: value,
      lineTotalText: formatMoneyMinor(Math.round(quantity * parseMoneyMinor(line.unitPriceText))),
    });
  }

  function updateLineUnitPrice(line: IssueDraftLine, value: string) {
    const unitPriceText = normalizeMoneyInput(value);
    const quantity = parsePositiveQuantity(line.quantityText) ?? 0;
    updateLine(line.itemId, {
      unitPriceText,
      lineTotalText: formatMoneyMinor(Math.round(quantity * parseMoneyMinor(unitPriceText))),
    });
  }

  function updateLineTotal(line: IssueDraftLine, value: string) {
    updateLine(line.itemId, { lineTotalText: normalizeMoneyInput(value) });
  }

  function removeLine(itemId: string) {
    setDraft((current) => current.filter((line) => line.itemId !== itemId));
  }

  async function submitIssue() {
    if (!employeeId) {
      onNotify("Выберите сотрудника для выдачи");
      return;
    }

    if (!draft.length) {
      onNotify("Добавьте хотя бы одну позицию в черновик выдачи");
      return;
    }

    if (draftHasInvalidLines) {
      onNotify("Проверьте количество по строкам выдачи");
      return;
    }

    try {
      setSubmitting(true);
      await Promise.all(
        draft.map((line) => {
          const linePriceMinor = parseMoneyMinor(line.unitPriceText);
          const lineTotalMinor = parseMoneyMinor(line.lineTotalText);
          const lineNote = [
            comment,
            line.inventoryNumber ? `Инв. номер: ${line.inventoryNumber}` : "",
            linePriceMinor > 0 ? `Цена: ${formatMoneyMinor(linePriceMinor)} ₽` : "",
            lineTotalMinor > 0 ? `Сумма: ${formatMoneyMinor(lineTotalMinor)} ₽` : "",
            line.note,
          ]
            .filter(Boolean)
            .join(" · ");
          const payload: CreateInventoryOperationDto = {
            comment: lineNote || null,
            employeeId,
            itemId: line.itemId,
            movedAt: line.issueDate ? new Date(`${line.issueDate}T12:00:00`).toISOString() : undefined,
            quantity: parsePositiveQuantity(line.quantityText) ?? 0,
            type: "issue",
            warehouseId: null,
          };
          return inventoryRepository.createOperation(payload);
        }),
      );
      setDraft([]);
      setComment("");
      setEmployeeId("");
      setActiveTab("history");
      onNotify("Выдача проведена");
      await loadIssueData();
      setReloadKey((value) => value + 1);
    } catch (submitError) {
      onNotify(submitError instanceof Error ? submitError.message : "Не удалось провести выдачу");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="inventory-issue-screen">
      <header className="inventory-issue-hero">
        <div className="inventory-issue-breadcrumbs">Главная / Бухгалтерия / Выдача</div>
        <div className="inventory-issue-title-row">
          <span className="inventory-issue-title-icon">
            <ClipboardList size={22} />
          </span>
          <div>
            <h1>Выдача</h1>
            <p>Подбор номенклатуры, оформление черновика и фиксация выдачи сотруднику.</p>
          </div>
        </div>
        <nav className="inventory-issue-tabs" aria-label="Разделы выдачи">
          <IssueTabButton active={activeTab === "issue"} icon={<ClipboardList size={16} />} label="Выдача" onClick={() => setActiveTab("issue")} />
          <IssueTabButton active={activeTab === "drafts"} icon={<FileClock size={16} />} label="Список черновиков" onClick={() => setActiveTab("drafts")} />
          <IssueTabButton active={activeTab === "history"} icon={<History size={16} />} label="История выдачи" onClick={() => setActiveTab("history")} />
        </nav>
      </header>

      {effectiveError ? <IssueState kind="error" title="API выдачи не ответил" text={effectiveError} /> : null}
      {isLoading ? <IssueState kind="loading" title="Загрузка данных" text="Получаем журнал выдач, номенклатуру и сотрудников." /> : null}

      {!isLoading && !effectiveError && activeTab === "issue" ? (
        <section className="inventory-issue-workspace">
          <section className="inventory-issue-catalog">
            <div className="inventory-issue-panel-head">
              <div>
                <h2>Подбор номенклатуры</h2>
                <p>Найдите позицию и выберите карточку, чтобы добавить ее в черновик сотруднику.</p>
              </div>
              <ViewSwitch />
            </div>

            <div className="inventory-issue-filters">
              <label className="inventory-issue-search">
                <Search size={17} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Поиск по названию, артикулу или категории"
                  type="search"
                />
              </label>
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="all">Все категории</option>
                {effectiveSettings?.categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>

            {!effectiveItems.length ? (
              <IssueState kind="empty" title="Номенклатура пока не загружена" text="Создайте позиции или выполните импорт, после этого можно формировать выдачу." />
            ) : !visibleItems.length ? (
              <IssueState kind="empty" title="Позиции не найдены" text="Измените поиск или снимите фильтр по категории." />
            ) : (
              <div className="inventory-issue-item-grid">
                {visibleItems.slice(0, 80).map((item) => {
                  const selected = draft.some((line) => line.itemId === item.id);
                  return (
                    <article
                      aria-label={`Выбрать позицию: ${item.name}`}
                      className={`inventory-issue-item-card ${selected ? "is-selected" : ""}`}
                      key={item.id}
                      onClick={() => addLine(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          addLine(item.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="inventory-issue-item-avatar">
                        <PackagePlus size={20} />
                      </div>
                      <div className="inventory-issue-item-main">
                        <strong>{item.name}</strong>
                        <span>{item.category || "Без категории"}</span>
                        <small>Артикул: {item.article || item.sku || "не указан"}</small>
                        <em>{selected ? "Уже в черновике" : "Нажмите на карточку для выбора"}</em>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="inventory-issue-draft">
            <div className="inventory-issue-panel-head">
              <div>
                <h2>Черновик выдачи</h2>
                <p>{draft.length ? `${draft.length} позиций в черновике` : "Добавьте позиции слева"}</p>
              </div>
              <button className="button primary compact" disabled={!draft.length} onClick={() => setDraft((current) => current.map((line) => ({ ...line, expanded: false })))} type="button">
                Черновик +
              </button>
            </div>

            <label className="inventory-issue-field">
              Сотрудник
              <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
                <option value="">Выберите сотрудника</option>
                {effectiveEmployees.map((employee) => (
                  <option disabled={employee.status === "archived"} key={employee.id} value={employee.id}>
                    {employee.fullName} {employee.personnelNo ? `· ${employee.personnelNo}` : ""}
                  </option>
                ))}
              </select>
            </label>

            {selectedEmployee ? (
              <div className="inventory-issue-employee">
                <span>{getInitials(selectedEmployee.fullName)}</span>
                <div>
                  <strong>{selectedEmployee.fullName}</strong>
                  <small>ID: {selectedEmployee.personnelNo || "не указан"} · Участок: {selectedEmployee.department || "не указан"}</small>
                  <small>Должность: {selectedEmployee.position || "не указана"}</small>
                </div>
                <div className="inventory-issue-employee-actions">
                  <button className="button ghost icon-only" type="button" aria-label="Изменить сотрудника">
                    <Pencil size={15} />
                  </button>
                  <button className="button ghost" type="button" onClick={() => setMovementEmployee(selectedEmployee)}>
                    <History size={15} />
                    История
                  </button>
                </div>
              </div>
            ) : (
              <IssueState compact kind="empty" title="Сотрудник не выбран" text="Выберите сотрудника из справочника учета." />
            )}

            <label className="inventory-issue-field">
              Основание / комментарий
              <textarea
                aria-label="Комментарий"
                maxLength={500}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Например: выдача для выполнения работ на участке"
              />
              <span>{comment.length} / 500</span>
            </label>

            <div className="inventory-issue-draft-lines">
              {!draft.length ? (
                <IssueState kind="empty" title="Черновик пуст" text="Добавьте позиции из списка номенклатуры." />
              ) : draft.map((line) => {
                const item = itemById.get(line.itemId);
                const quantity = parsePositiveQuantity(line.quantityText);
                const invalidQuantity = !quantity;
                const lineTotalMinor = parseMoneyMinor(line.lineTotalText);

                return (
                  <article className={`inventory-issue-draft-line ${line.expanded ? "is-expanded" : ""} ${invalidQuantity ? "has-warning" : ""}`} key={line.itemId}>
                    <div className="inventory-issue-line-summary">
                      <div className="inventory-issue-line-item">
                        <div className="inventory-issue-item-avatar small">
                          <PackagePlus size={17} />
                        </div>
                        <div>
                          <strong>{item?.name ?? "Позиция"}</strong>
                          <span>Артикул: {item?.article || item?.sku || "не указан"}</span>
                        </div>
                      </div>
                      <div className="inventory-issue-line-controls">
                        <div className="inventory-issue-control-group inventory-issue-control-quantity">
                          <span>Кол-во</span>
                          <div className="inventory-issue-qty-stepper">
                            <button disabled={(quantity ?? 0) <= 1} onClick={() => updateLineQuantity(line, String(Math.max(1, (quantity ?? 1) - 1)))} type="button">-</button>
                            <input value={line.quantityText} onChange={(event) => updateLineQuantity(line, event.target.value)} aria-label="Кол-во" />
                            <button onClick={() => updateLineQuantity(line, String((quantity ?? 0) + 1))} type="button">+</button>
                          </div>
                        </div>
                        <div className="inventory-issue-control-group inventory-issue-control-unit">
                          <span>Ед.</span>
                          <strong>{item?.unit || "шт."}</strong>
                        </div>
                        <label className="inventory-issue-control-group inventory-issue-money-field">
                          <span>Цена</span>
                          <input
                            aria-label="Цена"
                            inputMode="decimal"
                            value={line.unitPriceText}
                            onChange={(event) => updateLineUnitPrice(line, event.target.value)}
                          />
                        </label>
                        <label className="inventory-issue-control-group inventory-issue-money-field">
                          <span>Сумма</span>
                          <input
                            aria-label="Сумма"
                            inputMode="decimal"
                            value={line.lineTotalText}
                            onChange={(event) => updateLineTotal(line, event.target.value)}
                          />
                        </label>
                      </div>
                      <div className="inventory-issue-line-actions">
                        <button className="button ghost icon-only" onClick={() => updateLine(line.itemId, { expanded: !line.expanded })} type="button" aria-label={line.expanded ? "Скрыть параметры строки" : "Открыть параметры строки"}>
                          <ChevronDown size={16} />
                        </button>
                        <button className="button ghost icon-only danger" onClick={() => removeLine(line.itemId)} type="button" aria-label="Удалить строку">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    {line.expanded ? (
                      <div className="inventory-issue-line-details">
                        <label>
                          Инвентарный номер
                          <input value={line.inventoryNumber} onChange={(event) => updateLine(line.itemId, { inventoryNumber: event.target.value })} />
                        </label>
                        <label>
                          Дата выдачи
                          <input value={line.issueDate} onChange={(event) => updateLine(line.itemId, { issueDate: event.target.value })} type="date" />
                        </label>
                        <label>
                          Примечание
                          <input value={line.note} onChange={(event) => updateLine(line.itemId, { note: event.target.value })} placeholder="Необязательно" />
                        </label>
                      </div>
                    ) : null}
                    <div className="inventory-issue-line-footer">
                      <span>Строка попадет в историю выдачи сотрудника после проведения.</span>
                      {invalidQuantity ? <strong>Проверьте количество</strong> : null}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="inventory-issue-draft-total">
              <IssueTotal label="Позиций" value={String(draft.length)} />
              <IssueTotal label="Сотрудник" value={selectedEmployee ? "Выбран" : "Не выбран"} />
              <IssueTotal label="Итого к выдаче" value={`${formatMoneyMinor(draftTotalMinor)} ₽`} />
            </div>

            <button className="button primary issue-submit" disabled={submitting || !draft.length || draftHasInvalidLines} onClick={() => void submitIssue()} type="button">
              <Send size={17} />
              {submitting ? "Проводим выдачу..." : "Провести выдачу"}
            </button>
          </aside>
        </section>
      ) : null}

      {!isLoading && !effectiveError && activeTab === "drafts" ? (
        <DraftsTab
          comment={comment}
          draft={draft}
          draftTotalMinor={draftTotalMinor}
          itemById={itemById}
          onCreate={() => setActiveTab("issue")}
          onOpen={() => setActiveTab("issue")}
          selectedEmployee={selectedEmployee}
        />
      ) : null}

      {!isLoading && !effectiveError && activeTab === "history" ? (
        <HistoryTab onReload={() => void loadIssueData()} rows={issueRows} />
      ) : null}

      {movementEmployee ? (
        <EmployeePpeMovementDialog employee={movementEmployee} onClose={() => setMovementEmployee(null)} />
      ) : null}
    </section>
  );
}

function IssueTabButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={active ? "is-active" : ""} onClick={onClick} type="button">
      {icon}
      {label}
    </button>
  );
}

function ViewSwitch() {
  return (
    <div className="inventory-issue-view-switch" aria-label="Вид списка">
      <button className="is-active" type="button" aria-label="Список">
        <List size={16} />
      </button>
      <button type="button" aria-label="Плитка">
        <LayoutGrid size={16} />
      </button>
    </div>
  );
}

function DraftsTab({
  comment,
  draft,
  draftTotalMinor,
  itemById,
  onCreate,
  onOpen,
  selectedEmployee,
}: {
  comment: string;
  draft: IssueDraftLine[];
  draftTotalMinor: number;
  itemById: Map<string, InventoryItemDto>;
  onCreate: () => void;
  onOpen: () => void;
  selectedEmployee: InventoryEmployeeDto | null;
}) {
  return (
    <section className="inventory-issue-table-card">
      <div className="inventory-issue-table-toolbar inventory-issue-drafts-toolbar">
        <label className="inventory-issue-search inventory-issue-toolbar-search">
          <Search size={17} />
          <input placeholder="Поиск по № черновика, ФИО, номенклатуре" type="search" />
        </label>
        <label className="inventory-issue-filter-field inventory-issue-period-select">
          Период
          <select defaultValue="today">
            <option value="today">Сегодня</option>
            <option value="week">7 дней</option>
            <option value="month">30 дней</option>
            <option value="all">Все черновики</option>
          </select>
        </label>
        <label className="inventory-issue-filter-field">
          Статус
          <select defaultValue="all">
            <option value="all">Все статусы</option>
            <option value="draft">Черновик</option>
            <option value="ready">Готов к выдаче</option>
          </select>
        </label>
        <button className="button primary" onClick={onCreate} type="button">
          <Plus size={16} />
          Новый черновик
        </button>
      </div>

      <div className="inventory-issue-table-wrap">
        <table className="inventory-issue-table">
          <thead>
            <tr>
              <th>№ черновика</th>
              <th>Дата создания</th>
              <th>Сотрудник</th>
              <th>Подразделение</th>
              <th>Позиций</th>
              <th>Сумма, ₽</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {draft.length ? (
              <tr>
                <td><strong>DRAFT-LOCAL</strong><span>{comment || "Текущий черновик"}</span></td>
                <td>{formatDate(new Date().toISOString())}</td>
                <td>{selectedEmployee?.fullName ?? "Сотрудник не выбран"}</td>
                <td>{selectedEmployee?.department ?? "Не указано"}</td>
                <td>{draft.length}<span>позиций</span></td>
                <td>{formatMoneyMinor(draftTotalMinor)}</td>
                <td><StatusBadge tone="green">Черновик</StatusBadge></td>
                <td>
                  <button className="button ghost" onClick={onOpen} type="button">Продолжить</button>
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={8}>
                  <IssueState kind="empty" title="Черновиков нет" text="Создайте новый черновик и добавьте номенклатуру к выдаче." />
                </td>
              </tr>
            )}
            {draft.slice(0, 3).map((line, index) => {
              const item = itemById.get(line.itemId);
              return (
                <tr className="inventory-issue-draft-preview-row" key={line.itemId}>
                  <td>DRAFT-LOCAL-{index + 1}</td>
                  <td>{formatDate(line.issueDate)}</td>
                  <td>{selectedEmployee?.fullName ?? "Не выбран"}</td>
                  <td>{selectedEmployee?.department ?? "Не указано"}</td>
                  <td>{line.quantityText}<span>{item?.name ?? "Позиция"}</span></td>
                  <td>{formatMoneyMinor(parseMoneyMinor(line.lineTotalText))}</td>
                  <td><StatusBadge tone="blue">К выдаче</StatusBadge></td>
                  <td><button className="button ghost icon-only" onClick={onOpen} type="button" aria-label="Открыть"><MoreHorizontal size={16} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmployeePpeMovementDialog({ employee, onClose }: { employee: InventoryEmployeeDto; onClose: () => void }) {
  return (
    <div className="inventory-issue-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-label="История СИЗ сотрудника"
        aria-modal="true"
        className="inventory-issue-dialog inventory-issue-movements-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div>
            <p>История движения СИЗ</p>
            <h2>{employee.fullName}</h2>
          </div>
          <button className="button ghost icon-only" onClick={onClose} type="button" aria-label="Закрыть">
            <X size={18} />
          </button>
        </header>
        <PpeMovementHistoryPanel
          employeeId={employee.id}
          emptyText="По этому сотруднику пока нет выдач, возвратов или списаний СИЗ."
          hideEmployee
          pageSize={12}
          title="Что выдавали, возвращали и списывали"
        />
      </section>
    </div>
  );
}

function HistoryTab({ onReload, rows }: { onReload: () => void; rows: InventoryDocumentDto[] }) {
  const issuedQuantity = sumMovementQuantity(rows, ["issue", "ppe_issue"]);
  const returnedQuantity = sumMovementQuantity(rows, ["return", "ppe_return"]);
  const writtenOffQuantity = sumMovementQuantity(rows, ["write_off", "ppe_write_off"]);

  return (
    <section className="inventory-issue-table-card inventory-issue-journal">
      <div className="inventory-issue-table-toolbar inventory-issue-history-toolbar">
        <label className="inventory-issue-search inventory-issue-toolbar-search">
          <Search size={17} />
          <input placeholder="Поиск по ФИО, предмету или № документа" type="search" />
        </label>
        <label className="inventory-issue-filter-field inventory-issue-period-select">
          Период
          <select defaultValue="today">
            <option value="today">Сегодня</option>
            <option value="week">7 дней</option>
            <option value="month">30 дней</option>
            <option value="all">Вся история</option>
          </select>
        </label>
        <label className="inventory-issue-filter-field">
          Статус
          <select defaultValue="all">
            <option value="all">Все статусы</option>
            <option value="issued">Выдан</option>
            <option value="cancelled">Отменен</option>
          </select>
        </label>
        <button className="button ghost" onClick={onReload} type="button">
          <RefreshCcw size={16} />
          Обновить
        </button>
      </div>

      <div className="inventory-issue-history-summary">
        <IssueTotal label="Выдано" value={formatQuantity(issuedQuantity)} />
        <IssueTotal label="Возвращено" value={formatQuantity(returnedQuantity)} />
        <IssueTotal label="Списано" value={formatQuantity(writtenOffQuantity)} />
      </div>

      <IssueDocumentsTable rows={rows} />
    </section>
  );
}

function IssueDocumentsTable({ rows }: { rows: InventoryDocumentDto[] }) {
  if (!rows.length) {
    return <IssueState kind="empty" title="Журнал выдач пуст" text="Проведенные выдачи появятся здесь после создания операций." />;
  }

  return (
    <div className="inventory-issue-table-wrap">
      <table className="inventory-issue-table">
        <thead>
          <tr>
            <th>№ документа</th>
            <th>Дата выдачи</th>
            <th>Сотрудник</th>
            <th>Номенклатура / предмет</th>
            <th>Кол-во</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><strong>{row.number || "Без номера"}</strong></td>
              <td>{formatDate(row.createdAt)}</td>
              <td>{row.employeeName || "Не указан"}</td>
              <td><strong>{row.itemName || "Позиция не указана"}</strong><span>{row.comment || "Без примечания"}</span></td>
              <td>{formatQuantity(Math.abs(row.quantity ?? 0))} {row.unit ?? ""}</td>
              <td><StatusBadge tone={operationTone(row.type || row.status)}>{operationTypeLabel(row.type || row.status)}</StatusBadge></td>
              <td>
                <div className="inventory-issue-row-actions">
                  <button className="button ghost icon-only" type="button" aria-label="Открыть документ">
                    <CheckCircle2 size={16} />
                  </button>
                  <button className="button ghost icon-only" type="button" aria-label="Дополнительные действия">
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IssueTotal({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function StatusBadge({ children, tone }: { children: ReactNode; tone: "blue" | "green" | "red" | "slate" }) {
  return <span className={`inventory-issue-status tone-${tone}`}>{children}</span>;
}

function IssueState({ compact = false, kind, text, title }: { compact?: boolean; kind: "empty" | "error" | "loading"; text: string; title: string }) {
  return (
    <div className={`inventory-issue-state is-${kind}${compact ? " is-compact" : ""}`}>
      <span>{kind === "loading" ? "..." : kind === "error" ? "!" : "0"}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function parsePositiveQuantity(value: string) {
  const quantity = Number(value.trim().replace(",", "."));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function normalizeMoneyInput(value: string) {
  const normalized = value.replace(/[^\d,.]/g, "").replace(".", ",");
  const [rubles = "", kopecks] = normalized.split(",");
  if (kopecks === undefined) return rubles;
  return `${rubles},${kopecks.slice(0, 2)}`;
}

function parseMoneyMinor(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

function formatDate(value?: string | null) {
  if (!value) return "Нет данных";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value);
}

function formatMoneyMinor(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value / 100);
}

function sumMovementQuantity(rows: InventoryDocumentDto[], types: string[]) {
  const allowed = new Set(types);
  return rows
    .filter((row) => allowed.has(row.type))
    .reduce((sum, row) => sum + Math.abs(row.quantity ?? 0), 0);
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

function operationTypeLabel(type: string) {
  const labels: Record<string, string> = {
    cancelled: "Отменен",
    issue: "Выдан",
    ppe_issue: "Выдано СИЗ",
    ppe_return: "Возврат СИЗ",
    ppe_write_off: "Списание СИЗ",
    posted: "Выдан",
    return: "Возврат",
    write_off: "Списание",
  };
  return labels[type] ?? type;
}

function operationTone(type: string): "blue" | "green" | "red" | "slate" {
  if (type === "write_off" || type === "ppe_write_off" || type === "cancelled") {
    return "red";
  }

  if (type === "return" || type === "ppe_return") {
    return "blue";
  }

  return "green";
}

function createEmptySettings(): InventorySettingsDto {
  return {
    categories: [],
    custodyCategories: [],
    employeeDepartments: [],
    employeeGroups: [],
    employeePositions: [],
    itemSets: [],
    positionNorms: [],
    returnReasons: [],
    units: [],
    warehouses: [],
    writeOffReasons: [],
  };
}
