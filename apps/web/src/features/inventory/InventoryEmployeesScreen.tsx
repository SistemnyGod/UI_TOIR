import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Archive,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  FileText,
  Search,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import type {
  InventoryEmployeeDto,
  InventoryEmployeeImportPreviewDto,
  InventoryEmployeeImportResultDto,
  InventoryListResponseDto,
  UpdateEmployeeDto,
} from "../../api/contracts";
import { useInventoryRepository } from "../../repositories/inventoryRepositoryContext";
import { EmployeePpeHistoryDialog } from "./employees/EmployeePpeHistoryDialog";
import { EmployeeFormDialog, type EmployeeFormState, type EmployeeFormMode } from "./employees/EmployeeFormDialog";
import { ConfirmDialog, ImportPreviewDialog, ImportResultDialog } from "./employees/EmployeeImportDialogs";
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
  const mounted = useRef(true);
  const mutationLocks = useRef(new Set<string>());
  const previewGeneration = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; previewGeneration.current += 1; }; }, []);
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
  const [formMode, setFormMode] = useState<EmployeeFormMode | null>(null);
  const [formEmployee, setFormEmployee] = useState<InventoryEmployeeDto | null>(null);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
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
        if (!mounted) return;
        setRowsState(nextRows);
        setSelectedEmployeeId((current) => {
          if (current && nextRows.rows.some((row) => row.id === current)) return current;
          return nextRows.rows[0]?.id ?? "";
        });
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
  const selectedEmployee = rows.find((row) => row.id === selectedEmployeeId) ?? rows[0] ?? null;
  const activeCount = rows.filter((row) => row.status !== "archived").length;
  const archivedCount = rows.filter((row) => row.status === "archived").length;
  const departments = useMemo(() => uniqueValues(rows.map((employee) => employee.department)), [rows]);
  const employeeGroups = useMemo(() => uniqueValues(rows.map((employee) => employee.employeeGroup)), [rows]);
  const positions = useMemo(() => uniqueValues(rows.map((employee) => employee.position)), [rows]);
  const visibleDepartments = department === "all" || departments.includes(department) ? departments : [department, ...departments];
  const visibleGroups = employeeGroup === "all" || employeeGroups.includes(employeeGroup) ? employeeGroups : [employeeGroup, ...employeeGroups];

  async function reload() {
    setReloadKey((value) => value + 1);
  }

  async function previewImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file || importing) return;
    const generation = ++previewGeneration.current;
    setPreviewing(true);
    try {
      const preview = await inventoryRepository.previewEmployeesImport(file);
      if (!mounted.current || generation !== previewGeneration.current) return;
      setImportFile(file); setImportPreview(preview);
    } catch (failure) {
      if (mounted.current && generation === previewGeneration.current) onNotify(failure instanceof Error ? failure.message : "Не удалось прочитать файл сотрудников");
    } finally {
      if (mounted.current && generation === previewGeneration.current) setPreviewing(false);
    }
  }

  async function confirmImport() {
    if (!importFile || mutationLocks.current.has("import")) return false;
    mutationLocks.current.add("import"); setImporting(true);
    try {
      const result = await inventoryRepository.importEmployees(importFile, importPreview?.previewToken);
      if (!mounted.current) return false;
      setImportResult(result); setImportPreview(null); setImportFile(null);
      onNotify("Импорт сотрудников выполнен");
      void reload();
      return true;
    } finally {
      mutationLocks.current.delete("import");
      if (mounted.current) setImporting(false);
    }
  }

  async function archiveEmployee(row: InventoryEmployeeDto) {
    if (mutationLocks.current.has("archive")) return false;
    mutationLocks.current.add("archive"); setBusyId(row.id);
    try {
      await inventoryRepository.archiveEmployee(row.id);
      if (!mounted.current) return false;
      setArchiveCandidate(null); onNotify("Сотрудник перенесён в архив учёта");
      void reload();
      return true;
    } finally {
      mutationLocks.current.delete("archive");
      if (mounted.current) setBusyId("");
    }
  }

  async function saveEmployee(payload: EmployeeFormState) {
    if (mutationLocks.current.has("employee")) return false;
    mutationLocks.current.add("employee"); setSavingEmployee(true);
    try {
      const editing = formMode === "edit" && formEmployee;
      if (editing) await inventoryRepository.updateEmployee(editing.id, payload as UpdateEmployeeDto);
      else await inventoryRepository.createEmployee(payload);
      if (!mounted.current) return false;
      if (!editing) setStatus("active");
      onNotify(editing ? "Карточка сотрудника обновлена" : "Сотрудник создан");
      setFormMode(null); setFormEmployee(null);
      void reload();
      return true;
    } finally {
      mutationLocks.current.delete("employee");
      if (mounted.current) setSavingEmployee(false);
    }
  }

  function openCreate() {
    setFormEmployee(null);
    setFormMode("create");
  }

  function openEdit(employee: InventoryEmployeeDto) {
    setFormEmployee(employee);
    setFormMode("edit");
  }

  return (
    <section className="inventory-employees-screen">
      <header className="inventory-employees-commandbar inventory-employees-hero">
        <div className="inventory-employees-title">
          <span className="inventory-employees-title-icon"><Users size={22} /></span>
          <div>
            <p>Бухгалтерия</p>
            <h1>Сотрудники учета</h1>
            <span>Справочник сотрудников для выдачи, СИЗ, под запись, отчетов и печатных форм.</span>
          </div>
        </div>
        <div className="inventory-employees-actions">
          <input ref={inputRef} hidden type="file" accept=".xlsx,.xls,.csv,.txt" onChange={(event) => void previewImportFile(event)} />
          <button className="button ghost" disabled={savingEmployee} onClick={openCreate} type="button">
            <UserPlus size={16} />
            Создать сотрудника
          </button>
          <button className="button primary" disabled={previewing || importing} onClick={() => inputRef.current?.click()} type="button">
            <Upload size={16} />
            {previewing ? "Проверяем..." : "Импорт Excel"}
          </button>
        </div>
      </header>

      {serverError ? <EmployeeState kind="error" title="API сотрудников не ответил" text={serverError} /> : null}
      <div className="inventory-employees-refresh" role="status">{isLoading ? rowsState ? "Обновляем список. Показанные данные остаются доступны." : "Загружаем сотрудников…" : ""}</div>
      {serverError ? <button className="button ghost" onClick={() => void reload()} type="button">Повторить загрузку</button> : null}

      <>
          <section className="inventory-employees-kpis" aria-label="Сводка сотрудников">
            <EmployeeKpi label="Всего в фильтре" value={total} />
            <EmployeeKpi label="На странице" tone="blue" value={rows.length} />
            <EmployeeKpi label="Активные" tone="green" value={activeCount} />
            <EmployeeKpi label="Архив" tone="red" value={archivedCount} />
          </section>

          <section className="inventory-employees-filters inventory-employees-filters-wide">
            <label className="inventory-employees-search">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по ФИО, табельному, должности или подразделению" type="search" />
            </label>
            <select aria-label="Подразделение" value={department} onChange={(event) => setDepartment(event.target.value)}>
              <option value="all">Все подразделения</option>
              {visibleDepartments.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select aria-label="Группа сотрудников" value={employeeGroup} onChange={(event) => setEmployeeGroup(event.target.value)}>
              <option value="all">Все группы</option>
              {visibleGroups.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select aria-label="Статус сотрудников" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">Все статусы</option>
              <option value="active">Активные</option>
              <option value="archived">Архив</option>
            </select>
            <select aria-label="Размер страницы" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {[10, 25, 50, 100].map((value) => <option key={value} value={value}>{value} строк</option>)}
            </select>
          </section>

          <div className="inventory-employees-workspace">
            <section className="inventory-employees-table-card" aria-busy={isLoading}>
              <div className="inventory-employees-panel-head">
                <div>
                  <h2>Список сотрудников</h2>
                  <p>{rows.length} из {total} записей</p>
                </div>
                <EmployeesPager page={page} pageCount={pageCount} onPage={setPage} />
              </div>
              {!rowsState && isLoading ? <EmployeeState kind="loading" title="Загрузка сотрудников" text="Получаем справочник." /> : <EmployeesTable
                busyId={busyId}
                onArchive={setArchiveCandidate}
                onEdit={openEdit}
                onOpenMovements={setMovementEmployee}
                onSelect={setSelectedEmployeeId}
                rows={rows}
                selectedId={selectedEmployee?.id ?? ""}
              />}
            </section>

            <EmployeeInspector
              employee={selectedEmployee}
              onArchive={setArchiveCandidate}
              onEdit={openEdit}
              onOpenMovements={setMovementEmployee}
            />
          </div>
      </>

      {importPreview ? (
        <ImportPreviewDialog
          busy={importing}
          fileName={importFile?.name ?? ""}
          onCancel={() => {
            setImportPreview(null);
            setImportFile(null);
          }}
          onConfirm={confirmImport}
          preview={importPreview}
        />
      ) : null}
      {importResult ? <ImportResultDialog onClose={() => setImportResult(null)} result={importResult} /> : null}
      {archiveCandidate ? (
        <ConfirmDialog
          busy={busyId === archiveCandidate.id}
          confirmLabel="Архивировать"
          message="Сотрудник будет скрыт из активного списка бухгалтерии. История выдач, СИЗ и операций останется без изменений."
          onCancel={() => setArchiveCandidate(null)}
          onConfirm={() => archiveEmployee(archiveCandidate)}
          title={`Архивировать ${archiveCandidate.fullName}?`}
        />
      ) : null}
      {formMode ? (
        <EmployeeFormDialog
          key={`${formMode}:${formEmployee?.id ?? "new"}`}
          busy={savingEmployee}
          employee={formEmployee}
          mode={formMode}
          onCancel={() => {
            setFormMode(null);
            setFormEmployee(null);
          }}
          onConfirm={saveEmployee}
          referenceOptions={{ departments, employeeGroups, positions }}
        />
      ) : null}
      {movementEmployee ? (
        <EmployeePpeHistoryDialog employee={movementEmployee} onClose={() => setMovementEmployee(null)} />
      ) : null}
    </section>
  );
}

function EmployeesTable({
  busyId,
  onArchive,
  onEdit,
  onOpenMovements,
  onSelect,
  rows,
  selectedId,
}: {
  busyId: string;
  onArchive: (row: InventoryEmployeeDto) => void;
  onEdit: (row: InventoryEmployeeDto) => void;
  onOpenMovements: (row: InventoryEmployeeDto) => void;
  onSelect: (id: string) => void;
  rows: InventoryEmployeeDto[];
  selectedId: string;
}) {
  if (!rows.length) {
    return <EmployeeState kind="empty" title="Сотрудники не найдены" text="Измените фильтр или импортируйте справочник сотрудников." />;
  }

  return (
    <div className="inventory-employees-table-wrap">
      <table className="inventory-employees-table inventory-employees-table-modern">
        <thead>
          <tr>
            <th>Сотрудник</th>
            <th>Табельный</th>
            <th>Должность</th>
            <th>Подразделение</th>
            <th>Группа</th>
            <th>Прием</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.id === selectedId ? "is-selected" : undefined} onClick={() => onSelect(row.id)}>
              <td data-label="Сотрудник">
                <div className="inventory-employees-person">
                  <span>{getInitials(row.fullName)}</span>
                  <div>
                    <strong>{row.fullName}</strong>
                    <small>{row.birthDate ? `д.р. ${formatDateOnly(row.birthDate)}` : "дата рождения не указана"}</small>
                  </div>
                </div>
              </td>
              <td data-label="Табельный">{row.personnelNo || "не указан"}</td>
              <td data-label="Должность">{row.position || "не указана"}</td>
              <td data-label="Подразделение">{row.department || "не указано"}</td>
              <td data-label="Группа">{row.employeeGroup || "не указана"}</td>
              <td data-label="Приём">{formatDateOnly(row.hiredAt)}</td>
              <td data-label="Статус"><span className={`inventory-employees-status ${row.status}`}>{employeeStatusLabel(row.status)}</span></td>
              <td data-label="Действия">
                <div className="inventory-employees-row-actions" onClick={(event) => event.stopPropagation()}>
                  <button className="button ghost" onClick={() => onEdit(row)} type="button"><Edit3 size={14} /> Изменить</button>
                  <button className="button ghost" onClick={() => onOpenMovements(row)} type="button"><Eye size={14} /> История</button>
                  <button className="button ghost danger" disabled={row.status === "archived" || busyId === row.id} onClick={() => onArchive(row)} type="button">
                    <Archive size={14} />
                    {busyId === row.id ? "Архив..." : "Архив"}
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

function EmployeeInspector({
  employee,
  onArchive,
  onEdit,
  onOpenMovements,
}: {
  employee: InventoryEmployeeDto | null;
  onArchive: (row: InventoryEmployeeDto) => void;
  onEdit: (row: InventoryEmployeeDto) => void;
  onOpenMovements: (row: InventoryEmployeeDto) => void;
}) {
  if (!employee) {
    return (
      <aside className="inventory-employees-inspector">
        <EmployeeState kind="empty" title="Сотрудник не выбран" text="Выберите строку, чтобы посмотреть карточку и быстрые действия." />
      </aside>
    );
  }

  return (
    <aside className="inventory-employees-inspector">
      <div className="inventory-employees-inspector-card">
        <div className="inventory-employees-inspector-head">
          <span>{getInitials(employee.fullName)}</span>
          <div>
            <h2>{employee.fullName}</h2>
            <p>{employee.position || "Должность не указана"}</p>
          </div>
        </div>
        <span className={`inventory-employees-status ${employee.status}`}>{employeeStatusLabel(employee.status)}</span>
      </div>

      <div className="inventory-employees-inspector-actions">
        <button className="button primary" onClick={() => onEdit(employee)} type="button"><Edit3 size={15} /> Редактировать</button>
        <button className="button ghost" onClick={() => onOpenMovements(employee)} type="button"><FileText size={15} /> История СИЗ</button>
        <button className="button ghost danger" disabled={employee.status === "archived"} onClick={() => onArchive(employee)} type="button"><Archive size={15} /> В архив</button>
      </div>

      <dl className="inventory-employees-details">
        <div><dt>Табельный номер</dt><dd>{employee.personnelNo || "не указан"}</dd></div>
        <div><dt>Подразделение</dt><dd>{employee.department || "не указано"}</dd></div>
        <div><dt>Основная группа</dt><dd>{employee.employeeGroup || "не указана"}</dd></div>
        <div><dt>Дата приема</dt><dd>{formatDateOnly(employee.hiredAt)}</dd></div>
        <div><dt>Дата рождения</dt><dd>{formatDateOnly(employee.birthDate)}</dd></div>
      </dl>

      <div className="inventory-employees-inspector-hints">
        <h3>Связанные сценарии</h3>
        <p><BadgeCheck size={15} /> Выдача и возврат СИЗ используют эту карточку сотрудника.</p>
        <p><BriefcaseBusiness size={15} /> Подразделение и группа участвуют в отчетах и фильтрах.</p>
        <p><CalendarDays size={15} /> Даты сохраняются для печатных форм и сверки кадровых данных.</p>
      </div>
    </aside>
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

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "С";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}
