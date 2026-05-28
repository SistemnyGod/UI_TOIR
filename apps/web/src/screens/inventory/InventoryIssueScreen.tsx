import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
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

type IssueDraftLine = {
  itemId: string;
  quantityText: string;
  warehouseId: string;
};

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
  const [employeeId, setEmployeeId] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [comment, setComment] = useState("");
  const [draft, setDraft] = useState<IssueDraftLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [localDocuments, setLocalDocuments] = useState<InventoryListResponseDto<InventoryDocumentDto> | undefined>(documents);
  const [options, setOptions] = useState<InventoryOperationsModuleOptionsDto | null>(
    settings || items.length || employees.length || stock
      ? {
          employees,
          items,
          settings: settings ?? createEmptySettings(),
          stock: stock?.rows ?? [],
          operationTypes: ["issue"],
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
        inventoryRepository.getIssues({ pageSize: 100 }),
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
      inventoryRepository.getIssues({ pageSize: 100 }),
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
  const stockRows = options?.stock ?? stock?.rows ?? [];
  const issueRows = localDocuments?.rows ?? documents?.rows ?? [];
  const selectedEmployee = effectiveEmployees.find((employee) => employee.id === employeeId) ?? null;
  const stockByItem = useMemo(() => groupStockByItem(stockRows), [stockRows]);
  const stockByItemWarehouse = useMemo(() => groupStockByItemWarehouse(stockRows), [stockRows]);
  const itemById = useMemo(() => new Map(effectiveItems.map((item) => [item.id, item])), [effectiveItems]);
  const warehouseOptions = effectiveSettings?.warehouses ?? [];
  const isLoading = loading || dataLoading;
  const effectiveError = loadError ?? error;

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return effectiveItems.filter((item) => {
      const matchesQuery =
        !normalized ||
        [item.name, item.sku, item.article, item.category, item.normItemName]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      const matchesCategory = categoryId === "all" || item.categoryId === categoryId;
      return item.isActive && matchesQuery && matchesCategory;
    });
  }, [categoryId, effectiveItems, query]);

  const draftQuantity = draft.reduce((sum, line) => sum + (parsePositiveQuantity(line.quantityText) ?? 0), 0);
  const draftHasInvalidLines = draft.some((line) => {
    const quantity = parsePositiveQuantity(line.quantityText);
    return !line.itemId || !line.warehouseId || !quantity || quantity > availableAtWarehouse(line.itemId, line.warehouseId);
  });

  function defaultWarehouseForItem(itemId: string) {
    const availableStock = (stockByItem.get(itemId) ?? []).find((row) => row.stockAvailable > 0);
    return availableStock?.warehouseId ?? warehouseOptions[0]?.id ?? "";
  }

  function availableForItem(itemId: string) {
    return (stockByItem.get(itemId) ?? []).reduce((sum, row) => sum + row.stockAvailable, 0);
  }

  function availableAtWarehouse(itemId: string, warehouseId: string) {
    return stockByItemWarehouse.get(`${itemId}:${warehouseId}`)?.stockAvailable ?? 0;
  }

  function addLine(itemId: string) {
    setDraft((current) => {
      if (current.some((line) => line.itemId === itemId)) return current;
      return [...current, { itemId, quantityText: "1", warehouseId: defaultWarehouseForItem(itemId) }];
    });
  }

  function updateLine(itemId: string, patch: Partial<IssueDraftLine>) {
    setDraft((current) => current.map((line) => (line.itemId === itemId ? { ...line, ...patch } : line)));
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
      onNotify("Проверьте склад, количество и доступный остаток по строкам выдачи");
      return;
    }

    try {
      setSubmitting(true);
      await Promise.all(
        draft.map((line) => {
          const payload: CreateInventoryOperationDto = {
            comment: comment || null,
            employeeId,
            itemId: line.itemId,
            quantity: parsePositiveQuantity(line.quantityText) ?? 0,
            type: "issue",
            warehouseId: line.warehouseId,
          };
          return inventoryRepository.createOperation(payload);
        }),
      );
      setDraft([]);
      setComment("");
      setEmployeeId("");
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
      <header className="inventory-issue-commandbar">
        <div className="inventory-issue-title">
          <span className="inventory-issue-title-icon">
            <ClipboardList size={22} />
          </span>
          <div>
            <p>Бухгалтерия</p>
            <h1>Выдача</h1>
            <span>Подбор номенклатуры, проверка остатков и проведение выдачи сотруднику.</span>
          </div>
        </div>
        <div className="inventory-issue-command-actions">
          <button className="button primary" disabled={submitting || !draft.length} onClick={() => void submitIssue()} type="button">
            <Send size={16} />
            Провести выдачу
          </button>
          <button className="button ghost" disabled={!draft.length} onClick={() => setDraft([])} type="button">
            <X size={16} />
            Очистить черновик
          </button>
        </div>
      </header>

      {effectiveError ? <IssueState kind="error" title="API выдачи не ответил" text={effectiveError} /> : null}
      {isLoading ? <IssueState kind="loading" title="Загрузка данных" text="Получаем журнал выдач, номенклатуру, сотрудников, склады и остатки." /> : null}

      {!isLoading && !effectiveError ? (
        <>
          <section className="inventory-issue-kpis" aria-label="Сводка выдачи">
            <IssueKpi label="Документов выдачи" value={issueRows.length} />
            <IssueKpi label="Строк в черновике" tone="blue" value={draft.length} />
            <IssueKpi label="Выбран сотрудник" tone={selectedEmployee ? "green" : "slate"} value={selectedEmployee ? 1 : 0} />
            <IssueKpi label="Общий объем" tone="green" value={draftQuantity} />
          </section>

          <section className="inventory-issue-workspace">
            <section className="inventory-issue-catalog">
              <div className="inventory-issue-panel-head">
                <div>
                  <h2>Подбор номенклатуры</h2>
                  <p>{visibleItems.length} из {effectiveItems.length} позиций</p>
                </div>
                <button
                  className="button ghost"
                  disabled={!visibleItems.length}
                  onClick={() => setDraft(visibleItems.map((item) => ({ itemId: item.id, quantityText: "1", warehouseId: defaultWarehouseForItem(item.id) })))}
                  type="button"
                >
                  <Plus size={15} />
                  Добавить найденные
                </button>
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
                  {visibleItems.slice(0, 48).map((item) => {
                    const selected = draft.some((line) => line.itemId === item.id);
                    const available = availableForItem(item.id);
                    return (
                      <article className={selected ? "is-selected" : ""} key={item.id}>
                        <div>
                          <strong>{item.name}</strong>
                          <span>{item.sku || item.article || "без артикула"} · {item.category || "без категории"}</span>
                        </div>
                        <div className="inventory-issue-stock-line">
                          <small>{formatQuantity(available)} {item.unit || "шт."} доступно</small>
                          <button className="button ghost" disabled={selected} onClick={() => addLine(item.id)} type="button">
                            В черновик
                          </button>
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
                  <p>{draft.length} позиций · {formatQuantity(draftQuantity)} шт.</p>
                </div>
              </div>

              <label className="inventory-issue-field">
                Сотрудник
                <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
                  <option value="">Выберите сотрудника</option>
                  {effectiveEmployees.map((employee) => (
                    <option disabled={employee.status === "archived"} key={employee.id} value={employee.id}>
                      {employee.fullName} {employee.personnelNo ? `В· ${employee.personnelNo}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {selectedEmployee ? (
                <div className="inventory-issue-employee">
                  <span>{getInitials(selectedEmployee.fullName)}</span>
                  <div>
                    <strong>{selectedEmployee.fullName}</strong>
                    <small>{selectedEmployee.position || "должность не указана"} · {selectedEmployee.department || "подразделение не указано"}</small>
                  </div>
                </div>
              ) : (
                <IssueState kind="empty" title="Сотрудник не выбран" text="Выберите сотрудника из справочника учета." />
              )}

              <label className="inventory-issue-field">
                Комментарий
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Основание, примечание или ссылка на заявку"
                />
              </label>

              <div className="inventory-issue-draft-lines">
                {!draft.length ? (
                  <IssueState kind="empty" title="Черновик пуст" text="Добавьте позиции из списка слева." />
                ) : draft.map((line) => {
                  const item = itemById.get(line.itemId);
                  const available = availableAtWarehouse(line.itemId, line.warehouseId);
                  const quantity = parsePositiveQuantity(line.quantityText);
                  const invalidQuantity = !quantity || quantity > available;

                  return (
                    <article className={invalidQuantity ? "has-warning" : ""} key={line.itemId}>
                      <div>
                        <strong>{item?.name ?? "Позиция"}</strong>
                        <span>{item?.sku || item?.category || "без артикула"}</span>
                      </div>
                      <label>
                        Склад
                        <select value={line.warehouseId} onChange={(event) => updateLine(line.itemId, { warehouseId: event.target.value })}>
                          <option value="">Не указан</option>
                          {warehouseOptions.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Кол-во
                        <input value={line.quantityText} onChange={(event) => updateLine(line.itemId, { quantityText: event.target.value })} />
                      </label>
                      <span className="inventory-issue-line-stock">
                        Доступно: {formatQuantity(available)} {item?.unit || "шт."}
                      </span>
                      <button className="button ghost danger" onClick={() => removeLine(line.itemId)} type="button">
                        <Trash2 size={14} />
                        Убрать
                      </button>
                    </article>
                  );
                })}
              </div>

              <button className="button primary" disabled={submitting || !draft.length || draftHasInvalidLines} onClick={() => void submitIssue()} type="button">
                {submitting ? "Проводим..." : "Провести выдачу"}
              </button>
            </aside>
          </section>

          <section className="inventory-issue-journal">
            <div className="inventory-issue-panel-head">
              <div>
                <h2>Журнал документов выдачи</h2>
                <p>{issueRows.length} документов</p>
              </div>
            </div>
            <IssueDocumentsTable rows={issueRows} />
          </section>
        </>
      ) : null}
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
            <th>Дата</th>
            <th>Сотрудник</th>
            <th>Позиция</th>
            <th>Склад</th>
            <th>Кол-во</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.createdAt)}</td>
              <td><strong>{row.employeeName || "Не указан"}</strong><span>{row.number}</span></td>
              <td>{row.itemName || "Позиция не указана"}</td>
              <td>{row.warehouseName || "Склад не указан"}</td>
              <td>{formatQuantity(Math.abs(row.quantity ?? 0))} {row.unit ?? ""}</td>
              <td><span className="inventory-issue-status">{operationTypeLabel(row.type || row.status)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IssueKpi({ label, tone = "slate", value }: { label: string; tone?: "blue" | "green" | "red" | "slate"; value: number }) {
  return (
    <article className={`inventory-issue-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{formatQuantity(value)}</strong>
    </article>
  );
}

function IssueState({ kind, text, title }: { kind: "empty" | "error" | "loading"; text: string; title: string }) {
  return (
    <div className={`inventory-issue-state is-${kind}`}>
      <span>{kind === "loading" ? "..." : kind === "error" ? "!" : "0"}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function groupStockByItem(rows: InventoryStockBalanceDto[]) {
  const map = new Map<string, InventoryStockBalanceDto[]>();
  rows.forEach((row) => {
    const current = map.get(row.itemId) ?? [];
    current.push(row);
    map.set(row.itemId, current);
  });
  return map;
}

function groupStockByItemWarehouse(rows: InventoryStockBalanceDto[]) {
  const map = new Map<string, InventoryStockBalanceDto>();
  rows.forEach((row) => map.set(`${row.itemId}:${row.warehouseId}`, row));
  return map;
}

function parsePositiveQuantity(value: string) {
  const quantity = Number(value.trim().replace(",", "."));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
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
    issue: "Выдача",
    posted: "Проведено",
  };
  return labels[type] ?? type;
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
