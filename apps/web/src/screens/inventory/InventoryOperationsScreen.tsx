import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  FileCheck2,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import type {
  CreateInventoryOperationDto,
  InventoryDocumentDto,
  InventoryEmployeeDto,
  InventoryItemDto,
  InventoryListResponseDto,
  InventorySettingsDto,
  InventoryStockBalanceDto,
} from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import "./inventoryWeb.css";

type InventoryOperationsScreenProps = {
  documents?: InventoryListResponseDto<InventoryDocumentDto>;
  employees: InventoryEmployeeDto[];
  error?: string;
  items: InventoryItemDto[];
  loading?: boolean;
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
  settings?: InventorySettingsDto;
  stock?: InventoryListResponseDto<InventoryStockBalanceDto>;
};

type OperationType = "receipt" | "return" | "write_off" | "issue";

type OperationForm = {
  comment: string;
  employeeId: string;
  itemId: string;
  quantity: string;
  type: OperationType;
  warehouseId: string;
};

const operationTypes: Array<{
  description: string;
  icon: typeof ArrowDownLeft;
  label: string;
  requiresEmployee: boolean;
  type: OperationType;
}> = [
  {
    description: "Поступление или положительная корректировка остатка на складе.",
    icon: ArrowDownLeft,
    label: "Поступление",
    requiresEmployee: false,
    type: "receipt",
  },
  {
    description: "Возврат имущества от сотрудника на выбранный склад.",
    icon: RotateCcw,
    label: "Возврат",
    requiresEmployee: true,
    type: "return",
  },
  {
    description: "Списание со склада без возврата в остаток.",
    icon: Trash2,
    label: "Списание",
    requiresEmployee: false,
    type: "write_off",
  },
  {
    description: "Выдача сотруднику. Для массовой выдачи удобнее вкладка «Выдача».",
    icon: ArrowUpRight,
    label: "Выдача",
    requiresEmployee: true,
    type: "issue",
  },
];

const initialForm: OperationForm = {
  comment: "",
  employeeId: "",
  itemId: "",
  quantity: "1",
  type: "receipt",
  warehouseId: "",
};

export function InventoryOperationsScreen({
  documents,
  employees,
  error,
  items,
  loading = false,
  onNotify,
  onReload,
  settings,
  stock,
}: InventoryOperationsScreenProps) {
  const inventoryRepository = useInventoryRepository();
  const [form, setForm] = useState<OperationForm>(initialForm);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const warehouseOptions = settings?.warehouses ?? [];
  const stockRows = stock?.rows ?? [];
  const documentRows = documents?.rows ?? [];
  const stockByItemWarehouse = useMemo(() => groupStockByItemWarehouse(stockRows), [stockRows]);
  const selectedType = operationTypes.find((operation) => operation.type === form.type) ?? operationTypes[0];
  const selectedItem = items.find((item) => item.id === form.itemId) ?? null;
  const selectedEmployee = employees.find((employee) => employee.id === form.employeeId) ?? null;
  const selectedWarehouse = warehouseOptions.find((warehouse) => warehouse.id === form.warehouseId) ?? null;
  const quantity = parsePositiveQuantity(form.quantity);
  const available = form.itemId && form.warehouseId
    ? stockByItemWarehouse.get(`${form.itemId}:${form.warehouseId}`)?.stockAvailable ?? 0
    : 0;

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery =
        !normalized ||
        [item.name, item.sku, item.article, item.category, item.normItemName]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      const matchesCategory = categoryId === "all" || item.categoryId === categoryId;
      return item.isActive && matchesQuery && matchesCategory;
    });
  }, [categoryId, items, query]);

  const operationRows = documentRows.filter((row) => row.type !== "issue");
  const negativeOperation = form.type === "write_off" || form.type === "issue";
  const needsEmployee = selectedType.requiresEmployee;
  const validationMessage = getValidationMessage({
    available,
    form,
    needsEmployee,
    negativeOperation,
    quantity,
  });

  function patch(patchValue: Partial<OperationForm>) {
    setForm((current) => ({ ...current, ...patchValue }));
  }

  function chooseItem(item: InventoryItemDto) {
    const stockAtWarehouse = stockRows.find((row) => row.itemId === item.id && row.stockAvailable > 0);
    patch({
      itemId: item.id,
      warehouseId: stockAtWarehouse?.warehouseId ?? form.warehouseId ?? warehouseOptions[0]?.id ?? "",
    });
  }

  function requestSubmit() {
    if (validationMessage) {
      onNotify(validationMessage);
      return;
    }
    setConfirmOpen(true);
  }

  async function submitOperation() {
    if (validationMessage || !quantity) {
      onNotify(validationMessage || "Проверьте параметры операции");
      return;
    }

    const payload: CreateInventoryOperationDto = {
      comment: form.comment || null,
      employeeId: form.employeeId || null,
      itemId: form.itemId,
      quantity,
      type: form.type,
      warehouseId: form.warehouseId,
    };

    try {
      setSubmitting(true);
      await inventoryRepository.createOperation(payload);
      setConfirmOpen(false);
      setForm(initialForm);
      onNotify("Операция проведена");
      await onReload();
    } catch (submitError) {
      onNotify(submitError instanceof Error ? submitError.message : "Не удалось провести операцию");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="inventory-operations-screen">
      <header className="inventory-operations-commandbar">
        <div className="inventory-operations-title">
          <span className="inventory-operations-title-icon">
            <RefreshCw size={22} />
          </span>
          <div>
            <p>Бухгалтерия</p>
            <h1>Операции</h1>
            <span>Поступления, возвраты, списания и точечные складские движения.</span>
          </div>
        </div>
        <div className="inventory-operations-command-actions">
          <button className="button primary" disabled={submitting || Boolean(validationMessage)} onClick={requestSubmit} type="button">
            <FileCheck2 size={16} />
            Провести операцию
          </button>
          <button className="button ghost" onClick={() => setForm(initialForm)} type="button">
            Очистить форму
          </button>
        </div>
      </header>

      {error ? <OperationState kind="error" title="API операций не ответил" text={error} /> : null}
      {loading ? <OperationState kind="loading" title="Загрузка данных" text="Получаем журнал операций, номенклатуру, склады, остатки и сотрудников." /> : null}

      {!loading && !error ? (
        <>
          <section className="inventory-operations-kpis" aria-label="Сводка операций">
            <OperationKpi label="Операций в журнале" value={operationRows.length} />
            <OperationKpi label="Остаток по позиции" tone={available > 0 ? "green" : "slate"} value={available} />
            <OperationKpi label="Выбран сотрудник" tone={selectedEmployee ? "green" : "slate"} value={selectedEmployee ? 1 : 0} />
            <OperationKpi label="Количество" tone="blue" value={quantity ?? 0} />
          </section>

          <section className="inventory-operations-workspace">
            <section className="inventory-operations-catalog">
              <div className="inventory-operations-panel-head">
                <div>
                  <h2>Номенклатура</h2>
                  <p>{visibleItems.length} из {items.length} позиций</p>
                </div>
              </div>

              <div className="inventory-operations-filters">
                <label className="inventory-operations-search">
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
                  {settings?.categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </div>

              {!items.length ? (
                <OperationState kind="empty" title="Номенклатура не загружена" text="Создайте позиции или выполните импорт перед проведением операций." />
              ) : !visibleItems.length ? (
                <OperationState kind="empty" title="Позиции не найдены" text="Измените поиск или фильтр категории." />
              ) : (
                <div className="inventory-operations-item-list">
                  {visibleItems.slice(0, 60).map((item) => {
                    const selected = item.id === form.itemId;
                    const totalAvailable = stockRows
                      .filter((row) => row.itemId === item.id)
                      .reduce((sum, row) => sum + row.stockAvailable, 0);
                    return (
                      <button className={selected ? "is-selected" : ""} key={item.id} onClick={() => chooseItem(item)} type="button">
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.sku || item.article || "без артикула"} · {item.category || "без категории"}</small>
                        </span>
                        <em>{formatQuantity(totalAvailable)} {item.unit || "шт."}</em>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <aside className="inventory-operations-composer">
              <div className="inventory-operations-panel-head">
                <div>
                  <h2>Параметры операции</h2>
                  <p>{selectedType.label}</p>
                </div>
              </div>

              <div className="inventory-operations-type-grid">
                {operationTypes.map((operation) => {
                  const Icon = operation.icon;
                  return (
                    <button
                      className={operation.type === form.type ? "is-selected" : ""}
                      key={operation.type}
                      onClick={() => patch({ type: operation.type })}
                      type="button"
                    >
                      <Icon size={18} />
                      <strong>{operation.label}</strong>
                      <span>{operation.description}</span>
                    </button>
                  );
                })}
              </div>

              <label className="inventory-operations-field">
                Позиция
                <select value={form.itemId} onChange={(event) => patch({ itemId: event.target.value })}>
                  <option value="">Выберите позицию</option>
                  {items.filter((item) => item.isActive).map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>

              <label className="inventory-operations-field">
                Склад
                <select value={form.warehouseId} onChange={(event) => patch({ warehouseId: event.target.value })}>
                  <option value="">Выберите склад</option>
                  {warehouseOptions.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                  ))}
                </select>
              </label>

              <label className="inventory-operations-field">
                Сотрудник {needsEmployee ? "" : "(необязательно)"}
                <select value={form.employeeId} onChange={(event) => patch({ employeeId: event.target.value })}>
                  <option value="">Не указан</option>
                  {employees.map((employee) => (
                    <option disabled={employee.status === "archived"} key={employee.id} value={employee.id}>
                      {employee.fullName} {employee.personnelNo ? `В· ${employee.personnelNo}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="inventory-operations-field">
                Количество
                <input value={form.quantity} onChange={(event) => patch({ quantity: event.target.value })} />
              </label>

              <label className="inventory-operations-field">
                Комментарий
                <textarea
                  value={form.comment}
                  onChange={(event) => patch({ comment: event.target.value })}
                  placeholder="Основание операции, номер документа или примечание"
                />
              </label>

              <section className="inventory-operations-summary">
                <div>
                  <span>Тип</span>
                  <strong>{selectedType.label}</strong>
                </div>
                <div>
                  <span>Позиция</span>
                  <strong>{selectedItem?.name || "не выбрана"}</strong>
                </div>
                <div>
                  <span>Склад</span>
                  <strong>{selectedWarehouse?.name || "не выбран"}</strong>
                </div>
                <div>
                  <span>Доступно</span>
                  <strong>{formatQuantity(available)} {selectedItem?.unit || ""}</strong>
                </div>
              </section>

              {validationMessage ? (
                <div className="inventory-operations-warning">
                  <AlertTriangle size={16} />
                  {validationMessage}
                </div>
              ) : null}

              <button className="button primary" disabled={submitting || Boolean(validationMessage)} onClick={requestSubmit} type="button">
                {submitting ? "Проводим..." : "Провести операцию"}
              </button>
            </aside>
          </section>

          <section className="inventory-operations-journal">
            <div className="inventory-operations-panel-head">
              <div>
                <h2>Журнал операций</h2>
                <p>{operationRows.length} записей</p>
              </div>
            </div>
            <OperationsTable rows={operationRows} />
          </section>
        </>
      ) : null}

      {confirmOpen ? (
        <ConfirmOperationDialog
          disabled={submitting}
          employee={selectedEmployee?.fullName}
          item={selectedItem?.name}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void submitOperation()}
          quantity={quantity ?? 0}
          type={selectedType.label}
          warehouse={selectedWarehouse?.name}
        />
      ) : null}
    </section>
  );
}

function OperationsTable({ rows }: { rows: InventoryDocumentDto[] }) {
  if (!rows.length) {
    return <OperationState kind="empty" title="Журнал операций пуст" text="Проведенные операции появятся здесь после сохранения." />;
  }

  return (
    <div className="inventory-operations-table-wrap">
      <table className="inventory-operations-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Тип</th>
            <th>Позиция</th>
            <th>Склад</th>
            <th>Сотрудник</th>
            <th>Количество</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.createdAt)}</td>
              <td><span className={`inventory-operations-type ${row.type}`}>{operationTypeLabel(row.type)}</span></td>
              <td><strong>{row.itemName || "Позиция не указана"}</strong><span>{row.number}</span></td>
              <td>{row.warehouseName || "Склад не указан"}</td>
              <td>{row.employeeName || "не указан"}</td>
              <td>{formatQuantity(Math.abs(row.quantity ?? 0))} {row.unit ?? ""}</td>
              <td><span className="inventory-operations-status">{statusLabel(row.status)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfirmOperationDialog({
  disabled,
  employee,
  item,
  onCancel,
  onConfirm,
  quantity,
  type,
  warehouse,
}: {
  disabled: boolean;
  employee?: string;
  item?: string;
  onCancel: () => void;
  onConfirm: () => void;
  quantity: number;
  type: string;
  warehouse?: string;
}) {
  return (
    <div className="inventory-operations-dialog-backdrop" role="presentation">
      <article className="inventory-operations-dialog" role="dialog" aria-modal="true" aria-label="Подтверждение операции">
        <header>
          <span><CheckCircle2 size={20} /></span>
          <div>
            <h2>Провести операцию?</h2>
            <p>Проверьте параметры перед изменением складского остатка.</p>
          </div>
        </header>
        <dl>
          <div><dt>Тип</dt><dd>{type}</dd></div>
          <div><dt>Позиция</dt><dd>{item || "не выбрана"}</dd></div>
          <div><dt>Склад</dt><dd>{warehouse || "не выбран"}</dd></div>
          <div><dt>Сотрудник</dt><dd>{employee || "не указан"}</dd></div>
          <div><dt>Количество</dt><dd>{formatQuantity(quantity)}</dd></div>
        </dl>
        <footer>
          <button className="button ghost" disabled={disabled} onClick={onCancel} type="button">Отмена</button>
          <button className="button primary" disabled={disabled} onClick={onConfirm} type="button">
            {disabled ? "Проводим..." : "Провести"}
          </button>
        </footer>
      </article>
    </div>
  );
}

function OperationKpi({ label, tone = "slate", value }: { label: string; tone?: "blue" | "green" | "red" | "slate"; value: number }) {
  return (
    <article className={`inventory-operations-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{formatQuantity(value)}</strong>
    </article>
  );
}

function OperationState({ kind, text, title }: { kind: "empty" | "error" | "loading"; text: string; title: string }) {
  return (
    <div className={`inventory-operations-state is-${kind}`}>
      <span>{kind === "loading" ? "..." : kind === "error" ? "!" : <PackageSearch size={20} />}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function getValidationMessage({
  available,
  form,
  needsEmployee,
  negativeOperation,
  quantity,
}: {
  available: number;
  form: OperationForm;
  needsEmployee: boolean;
  negativeOperation: boolean;
  quantity: number | null;
}) {
  if (!form.itemId) return "Выберите позицию";
  if (!form.warehouseId) return "Выберите склад";
  if (!quantity) return "Введите количество больше нуля";
  if (needsEmployee && !form.employeeId) return "Для этой операции нужно выбрать сотрудника";
  if (negativeOperation && quantity > available) return "Недостаточно доступного остатка на выбранном складе";
  return "";
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

function operationTypeLabel(type: string) {
  const labels: Record<string, string> = {
    issue: "Выдача",
    receipt: "Поступление",
    return: "Возврат",
    write_off: "Списание",
  };
  return labels[type] ?? type;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    posted: "Проведено",
    draft: "Черновик",
    cancelled: "Отменено",
  };
  return labels[status] ?? status;
}
