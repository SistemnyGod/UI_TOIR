import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Archive, ChevronLeft, ChevronRight, Eye, Search, Upload, Users, X } from "lucide-react";
import type {
  InventoryEmployeeDto,
  InventoryEmployeeImportPreviewDto,
  InventoryEmployeeImportResultDto,
  InventoryListResponseDto,
} from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { PpeMovementHistoryPanel } from "./PpeMovementHistoryPanel";
import "./inventoryWeb.css";

type InventoryEmployeesScreenProps = {
  employees?: InventoryListResponseDto<InventoryEmployeeDto>;
  error?: string;
  loading?: boolean;
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
};

export function InventoryEmployeesScreen({ employees, error, loading = false, onNotify }: InventoryEmployeesScreenProps) {
  const inventoryRepository = useInventoryRepository();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [department, setDepartment] = useState("all");
  const [employeeGroup, setEmployeeGroup] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rowsState, setRowsState] = useState<InventoryListResponseDto<InventoryEmployeeDto> | undefined>(employees);
  const [serverError, setServerError] = useState(error ?? "");
  const [isLoading, setIsLoading] = useState(loading);
  const [busyId, setBusyId] = useState("");
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<InventoryEmployeeImportPreviewDto | null>(null);
  const [importResult, setImportResult] = useState<InventoryEmployeeImportResultDto | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<InventoryEmployeeDto | null>(null);
  const [movementEmployee, setMovementEmployee] = useState<InventoryEmployeeDto | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, department, employeeGroup, status]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setServerError("");

    inventoryRepository
      .getEmployees({
        department: department === "all" ? undefined : department,
        employeeGroup: employeeGroup === "all" ? undefined : employeeGroup,
        page,
        pageSize,
        query: debouncedQuery || undefined,
        status: status === "all" ? undefined : status,
      })
      .then((nextRows) => {
        if (mounted) setRowsState(nextRows);
      })
      .catch((loadError) => {
        if (mounted) setServerError(loadError instanceof Error ? loadError.message : "API сотрудников не ответил");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [debouncedQuery, department, employeeGroup, inventoryRepository, page, pageSize, reloadKey, status]);

  const rows = rowsState?.rows ?? [];
  const total = rowsState?.total ?? 0;
  const pageCount = rowsState?.pageCount ?? 0;
  const departments = useMemo(() => uniqueValues(rows.map((employee) => employee.department)), [rows]);
  const employeeGroups = useMemo(() => uniqueValues(rows.map((employee) => employee.employeeGroup)), [rows]);
  const visibleDepartments = department === "all" || departments.includes(department) ? departments : [department, ...departments];
  const visibleGroups = employeeGroup === "all" || employeeGroups.includes(employeeGroup) ? employeeGroups : [employeeGroup, ...employeeGroups];

  async function reload() {
    setReloadKey((value) => value + 1);
  }

  async function previewImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    try {
      setPreviewing(true);
      setImportFile(file);
      setImportPreview(await inventoryRepository.previewEmployeesImport(file));
    } catch (previewError) {
      setImportFile(null);
      setImportPreview(null);
      onNotify(previewError instanceof Error ? previewError.message : "Не удалось прочитать файл сотрудников");
    } finally {
      setPreviewing(false);
    }
  }

  async function confirmImport() {
    if (!importFile) return;

    try {
      setImporting(true);
      const result = await inventoryRepository.importEmployees(importFile, importPreview?.previewToken);
      setImportResult(result);
      setImportPreview(null);
      setImportFile(null);
      onNotify("Импорт сотрудников выполнен");
      await reload();
    } catch (importError) {
      onNotify(importError instanceof Error ? importError.message : "Не удалось импортировать сотрудников");
    } finally {
      setImporting(false);
    }
  }

  async function archiveEmployee(row: InventoryEmployeeDto) {
    try {
      setBusyId(row.id);
      await inventoryRepository.archiveEmployee(row.id);
      setArchiveCandidate(null);
      onNotify("Сотрудник перенесен в архив учета");
      await reload();
    } catch (archiveError) {
      onNotify(archiveError instanceof Error ? archiveError.message : "Не удалось архивировать сотрудника");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="inventory-employees-screen">
      <header className="inventory-employees-commandbar">
        <div className="inventory-employees-title">
          <span className="inventory-employees-title-icon"><Users size={22} /></span>
          <div>
            <p>Бухгалтерия</p>
            <h1>Сотрудники учета</h1>
            <span>Импорт, проверка и справочник сотрудников для выдач, СИЗ, под запись и отчетов.</span>
          </div>
        </div>
        <div className="inventory-employees-actions">
          <input ref={inputRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={(event) => void previewImportFile(event)} />
          <button className="button primary" disabled={previewing || importing} onClick={() => inputRef.current?.click()} type="button">
            <Upload size={16} />
            {previewing ? "Проверяем..." : "Импорт Excel"}
          </button>
        </div>
      </header>

      {serverError ? <EmployeeState kind="error" title="API сотрудников не ответил" text={serverError} /> : null}
      {isLoading ? <EmployeeState kind="loading" title="Загрузка сотрудников" text="Получаем сотрудников бухгалтерского модуля." /> : null}

      {!isLoading && !serverError ? (
        <>
          <section className="inventory-employees-kpis" aria-label="Сводка сотрудников">
            <EmployeeKpi label="Всего в фильтре" value={total} />
            <EmployeeKpi label="На странице" tone="blue" value={rows.length} />
            <EmployeeKpi label="Активные" tone="green" value={rows.filter((row) => row.status !== "archived").length} />
            <EmployeeKpi label="Архив" tone="red" value={rows.filter((row) => row.status === "archived").length} />
          </section>

          <section className="inventory-employees-filters">
            <label className="inventory-employees-search">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по ФИО, табельному, должности или подразделению" type="search" />
            </label>
            <select value={department} onChange={(event) => setDepartment(event.target.value)}>
              <option value="all">Все подразделения</option>
              {visibleDepartments.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select value={employeeGroup} onChange={(event) => setEmployeeGroup(event.target.value)}>
              <option value="all">Все группы</option>
              {visibleGroups.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">Все статусы</option>
              <option value="active">Активные</option>
              <option value="archived">Архив</option>
            </select>
            <select aria-label="Размер страницы" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {[25, 50, 100].map((value) => <option key={value} value={value}>{value} строк</option>)}
            </select>
          </section>

          <section className="inventory-employees-table-card">
            <div className="inventory-employees-panel-head">
              <div>
                <h2>Список сотрудников</h2>
                <p>{rows.length} из {total} записей</p>
              </div>
              <EmployeesPager page={page} pageCount={pageCount} onPage={setPage} />
            </div>
            <EmployeesTable busyId={busyId} onArchive={setArchiveCandidate} onOpenMovements={setMovementEmployee} rows={rows} />
          </section>
        </>
      ) : null}

      {importPreview ? (
        <ImportPreviewDialog
          busy={importing}
          fileName={importFile?.name ?? ""}
          onCancel={() => {
            setImportPreview(null);
            setImportFile(null);
          }}
          onConfirm={() => void confirmImport()}
          preview={importPreview}
        />
      ) : null}
      {importResult ? <ImportResultDialog onClose={() => setImportResult(null)} result={importResult} /> : null}
      {archiveCandidate ? (
        <ConfirmDialog
          busy={busyId === archiveCandidate.id}
          confirmLabel="Архивировать"
          message="Сотрудник будет скрыт из активного списка бухгалтерии, история выдач и операций не изменится."
          onCancel={() => setArchiveCandidate(null)}
          onConfirm={() => void archiveEmployee(archiveCandidate)}
          title={`Архивировать ${archiveCandidate.fullName}?`}
        />
      ) : null}
      {movementEmployee ? (
        <EmployeePpeMovementDialog employee={movementEmployee} onClose={() => setMovementEmployee(null)} />
      ) : null}
    </section>
  );
}

function EmployeesTable({
  busyId,
  onArchive,
  onOpenMovements,
  rows,
}: {
  busyId: string;
  onArchive: (row: InventoryEmployeeDto) => void;
  onOpenMovements: (row: InventoryEmployeeDto) => void;
  rows: InventoryEmployeeDto[];
}) {
  if (!rows.length) {
    return <EmployeeState kind="empty" title="Сотрудники не найдены" text="Измените фильтр или импортируйте справочник сотрудников." />;
  }

  return (
    <div className="inventory-employees-table-wrap">
      <table className="inventory-employees-table">
        <thead>
          <tr>
            <th>ФИО</th>
            <th>Табельный</th>
            <th>Должность</th>
            <th>Подразделение</th>
            <th>Группа</th>
            <th>Дата приема</th>
            <th>Дата рождения</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><strong>{row.fullName}</strong></td>
              <td>{row.personnelNo || "не указан"}</td>
              <td>{row.position || "не указана"}</td>
              <td>{row.department || "не указано"}</td>
              <td>{row.employeeGroup || "не указана"}</td>
              <td>{formatDateOnly(row.hiredAt)}</td>
              <td>{formatDateOnly(row.birthDate)}</td>
              <td><span className={`inventory-employees-status ${row.status}`}>{employeeStatusLabel(row.status)}</span></td>
              <td>
                <button className="button ghost" onClick={() => onOpenMovements(row)} type="button">
                  <Eye size={14} />
                  История СИЗ
                </button>
                <button className="button ghost" disabled={row.status === "archived" || busyId === row.id} onClick={() => onArchive(row)} type="button">
                  <Archive size={14} />
                  {busyId === row.id ? "Архив..." : "Архив"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmployeePpeMovementDialog({ employee, onClose }: { employee: InventoryEmployeeDto; onClose: () => void }) {
  return (
    <div className="inventory-employees-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section className="inventory-employees-dialog inventory-employees-movements-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="История СИЗ сотрудника">
        <header>
          <div>
            <p>История движения СИЗ</p>
            <h2>{employee.fullName}</h2>
          </div>
          <button className="inventory-employees-icon-button" onClick={onClose} type="button" aria-label="Закрыть"><X size={18} /></button>
        </header>
        <PpeMovementHistoryPanel
          employeeId={employee.id}
          emptyText="По этому сотруднику пока нет выдач, возвратов или списаний СИЗ."
          pageSize={12}
          title="Что выдавали под ответственность"
        />
        <div className="inventory-employees-dialog-actions">
          <button className="button primary" onClick={onClose} type="button">Закрыть</button>
        </div>
      </section>
    </div>
  );
}

function EmployeesPager({ onPage, page, pageCount }: { onPage: (page: number) => void; page: number; pageCount: number }) {
  return (
    <div className="inventory-employees-pager">
      <button className="button ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} type="button"><ChevronLeft size={15} /> Назад</button>
      <span>{page} / {Math.max(pageCount, 1)}</span>
      <button className="button ghost" disabled={pageCount === 0 || page >= pageCount} onClick={() => onPage(page + 1)} type="button">Вперед <ChevronRight size={15} /></button>
    </div>
  );
}

function EmployeeKpi({ label, tone = "slate", value }: { label: string; tone?: "blue" | "green" | "red" | "slate"; value: number }) {
  return (
    <article className={`inventory-employees-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{formatQuantity(value)}</strong>
    </article>
  );
}

function EmployeeState({ kind, text, title }: { kind: "empty" | "error" | "loading"; text: string; title: string }) {
  return (
    <div className={`inventory-employees-state is-${kind}`}>
      <span>{kind === "loading" ? "..." : kind === "error" ? "!" : "0"}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function ImportPreviewDialog({ busy, fileName, onCancel, onConfirm, preview }: { busy: boolean; fileName: string; onCancel: () => void; onConfirm: () => void; preview: InventoryEmployeeImportPreviewDto }) {
  return (
    <div className="inventory-employees-dialog-backdrop" onMouseDown={onCancel} role="presentation">
      <section className="inventory-employees-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Предпросмотр импорта сотрудников">
        <header>
          <div>
            <p>Импорт сотрудников</p>
            <h2>{fileName || "Файл сотрудников"}</h2>
          </div>
          <button className="inventory-employees-icon-button" onClick={onCancel} type="button" aria-label="Закрыть"><X size={18} /></button>
        </header>
        <div className="inventory-employees-import-summary">
          <EmployeeKpi label="Строк" value={preview.rowsRead} />
          <EmployeeKpi label="Новые" tone="green" value={preview.newRows} />
          <EmployeeKpi label="Обновления" tone="blue" value={preview.updateRows} />
          <EmployeeKpi label="Ошибки" tone="red" value={preview.errors.length} />
        </div>
        {preview.errors.length ? <EmployeeState kind="error" title="Есть ошибки импорта" text={preview.errors.slice(0, 3).join("; ")} /> : null}
        <div className="inventory-employees-dialog-actions">
          <button className="button ghost" disabled={busy} onClick={onCancel} type="button">Отмена</button>
          <button className="button primary" disabled={busy || preview.errors.length > 0} onClick={onConfirm} type="button">{busy ? "Импорт..." : "Импортировать"}</button>
        </div>
      </section>
    </div>
  );
}

function ImportResultDialog({ onClose, result }: { onClose: () => void; result: InventoryEmployeeImportResultDto }) {
  return (
    <div className="inventory-employees-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section className="inventory-employees-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Результат импорта сотрудников">
        <header>
          <div>
            <p>Импорт завершен</p>
            <h2>{result.rowsRead} строк обработано</h2>
          </div>
          <button className="inventory-employees-icon-button" onClick={onClose} type="button" aria-label="Закрыть"><X size={18} /></button>
        </header>
        <div className="inventory-employees-import-summary">
          <EmployeeKpi label="Добавлено" tone="green" value={result.insertedRows} />
          <EmployeeKpi label="Обновлено" tone="blue" value={result.updatedRows} />
          <EmployeeKpi label="Пропущено" value={result.skippedRows} />
          <EmployeeKpi label="Ошибки" tone="red" value={result.errors.length} />
        </div>
        <div className="inventory-employees-dialog-actions">
          <button className="button primary" onClick={onClose} type="button">Закрыть</button>
        </div>
      </section>
    </div>
  );
}

function ConfirmDialog({ busy, confirmLabel, message, onCancel, onConfirm, title }: { busy: boolean; confirmLabel: string; message: string; onCancel: () => void; onConfirm: () => void; title: string }) {
  return (
    <div className="inventory-employees-dialog-backdrop" onMouseDown={onCancel} role="presentation">
      <section className="inventory-employees-dialog is-narrow" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div>
            <p>Подтверждение</p>
            <h2>{title}</h2>
          </div>
          <button className="inventory-employees-icon-button" onClick={onCancel} type="button" aria-label="Закрыть"><X size={18} /></button>
        </header>
        <p className="inventory-employees-dialog-text">{message}</p>
        <div className="inventory-employees-dialog-actions">
          <button className="button ghost" disabled={busy} onClick={onCancel} type="button">Отмена</button>
          <button className="button primary" disabled={busy} onClick={onConfirm} type="button">{busy ? "Выполняем..." : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru"));
}

function employeeStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Активен",
    archived: "Архив",
    disabled: "Отключен",
    inactive: "Неактивен",
  };
  return labels[status] ?? status;
}

function formatDateOnly(value?: string | null) {
  if (!value) return "не указана";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU").format(date);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value);
}
