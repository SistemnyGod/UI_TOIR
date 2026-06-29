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
  X,
} from "lucide-react";
import type {
  CreateEmployeeDto,
  InventoryEmployeeDto,
  InventoryEmployeeImportPreviewDto,
  InventoryEmployeeImportResultDto,
  InventoryListResponseDto,
  UpdateEmployeeDto,
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

type EmployeeFormMode = "create" | "edit";

type EmployeeFormState = CreateEmployeeDto;

const emptyEmployeeForm: EmployeeFormState = {
  birthDate: null,
  department: "",
  employeeGroup: "",
  fullName: "",
  hasMobileAccount: false,
  hiredAt: new Date().toISOString().slice(0, 10),
  personnelNo: "",
  position: "",
  shift: "Пятидневка",
  status: "active",
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

  async function saveEmployee(payload: EmployeeFormState) {
    try {
      setSavingEmployee(true);
      if (formMode === "edit" && formEmployee) {
        await inventoryRepository.updateEmployee(formEmployee.id, payload as UpdateEmployeeDto);
        onNotify("Карточка сотрудника обновлена");
      } else {
        await inventoryRepository.createEmployee(payload);
        setStatus("active");
        onNotify("Сотрудник создан");
      }
      setFormMode(null);
      setFormEmployee(null);
      await reload();
    } catch (saveError) {
      onNotify(saveError instanceof Error ? saveError.message : "Не удалось сохранить сотрудника");
    } finally {
      setSavingEmployee(false);
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
      {isLoading ? <EmployeeState kind="loading" title="Загрузка сотрудников" text="Получаем сотрудников бухгалтерского модуля." /> : null}

      {!isLoading && !serverError ? (
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
              {[10, 25, 50, 100].map((value) => <option key={value} value={value}>{value} строк</option>)}
            </select>
          </section>

          <div className="inventory-employees-workspace">
            <section className="inventory-employees-table-card">
              <div className="inventory-employees-panel-head">
                <div>
                  <h2>Список сотрудников</h2>
                  <p>{rows.length} из {total} записей</p>
                </div>
                <EmployeesPager page={page} pageCount={pageCount} onPage={setPage} />
              </div>
              <EmployeesTable
                busyId={busyId}
                onArchive={setArchiveCandidate}
                onEdit={openEdit}
                onOpenMovements={setMovementEmployee}
                onSelect={setSelectedEmployeeId}
                rows={rows}
                selectedId={selectedEmployee?.id ?? ""}
              />
            </section>

            <EmployeeInspector
              employee={selectedEmployee}
              onArchive={setArchiveCandidate}
              onEdit={openEdit}
              onOpenMovements={setMovementEmployee}
            />
          </div>
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
          message="Сотрудник будет скрыт из активного списка бухгалтерии. История выдач, СИЗ и операций останется без изменений."
          onCancel={() => setArchiveCandidate(null)}
          onConfirm={() => void archiveEmployee(archiveCandidate)}
          title={`Архивировать ${archiveCandidate.fullName}?`}
        />
      ) : null}
      {formMode ? (
        <EmployeeFormDialog
          busy={savingEmployee}
          employee={formEmployee}
          mode={formMode}
          onCancel={() => {
            setFormMode(null);
            setFormEmployee(null);
          }}
          onConfirm={(payload) => void saveEmployee(payload)}
          referenceOptions={{ departments, employeeGroups, positions }}
        />
      ) : null}
      {movementEmployee ? (
        <EmployeePpeMovementDialog employee={movementEmployee} onClose={() => setMovementEmployee(null)} />
      ) : null}
    </section>
  );
}

function EmployeeFormDialog({
  busy,
  employee,
  mode,
  onCancel,
  onConfirm,
  referenceOptions,
}: {
  busy: boolean;
  employee: InventoryEmployeeDto | null;
  mode: EmployeeFormMode;
  onCancel: () => void;
  onConfirm: (payload: EmployeeFormState) => void;
  referenceOptions: {
    departments: string[];
    employeeGroups: string[];
    positions: string[];
  };
}) {
  const [form, setForm] = useState<EmployeeFormState>(() => employee ? employeeToForm(employee) : emptyEmployeeForm);
  const canSubmit = form.fullName.trim().length > 0 && !busy;
  const patch = (changes: Partial<EmployeeFormState>) => setForm((current) => ({ ...current, ...changes }));

  return (
    <div className="inventory-employees-dialog-backdrop" onMouseDown={onCancel} role="presentation">
      <section className="inventory-employees-dialog inventory-employees-editor" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={mode === "edit" ? "Редактирование сотрудника" : "Создание сотрудника"}>
        <header>
          <div>
            <p>Справочник сотрудников</p>
            <h2>{mode === "edit" ? "Редактирование сотрудника" : "Создание сотрудника"}</h2>
          </div>
          <button className="inventory-employees-icon-button" onClick={onCancel} type="button" aria-label="Закрыть"><X size={18} /></button>
        </header>

        <div className="inventory-employees-form-grid">
          <label className="is-wide">
            <span>ФИО</span>
            <input autoFocus value={form.fullName} onChange={(event) => patch({ fullName: event.target.value })} placeholder="Иванов Иван Иванович" />
          </label>
          <label>
            <span>Табельный номер</span>
            <input value={form.personnelNo} onChange={(event) => patch({ personnelNo: event.target.value })} placeholder="Можно оставить пустым" />
          </label>
          <label>
            <span>Статус</span>
            <select value={form.status} onChange={(event) => patch({ status: event.target.value })}>
              <option value="active">Активен</option>
              <option value="inactive">Неактивен</option>
              <option value="disabled">Отключен</option>
              <option value="archived">Архив</option>
            </select>
          </label>
          <label>
            <span>Должность</span>
            <input list="inventory-employee-positions" value={form.position} onChange={(event) => patch({ position: event.target.value })} placeholder="Сотрудник" />
          </label>
          <label>
            <span>Подразделение</span>
            <input list="inventory-employee-departments" value={form.department} onChange={(event) => patch({ department: event.target.value })} placeholder="Не указано" />
          </label>
          <label>
            <span>Основная группа</span>
            <input list="inventory-employee-groups" value={form.employeeGroup} onChange={(event) => patch({ employeeGroup: event.target.value })} placeholder="Атом / Атом Экология / Подрядчики" />
          </label>
          <label>
            <span>Смена</span>
            <select value={form.shift} onChange={(event) => patch({ shift: event.target.value })}>
              <option value="Пятидневка">Пятидневка</option>
              <option value="День">День</option>
              <option value="Ночь">Ночь</option>
              <option value="11-часовая">11-часовая</option>
              <option value="Индивидуальная">Индивидуальная</option>
            </select>
          </label>
          <label>
            <span>Дата приема</span>
            <input value={form.hiredAt ?? ""} onChange={(event) => patch({ hiredAt: event.target.value || null })} type="date" />
          </label>
          <label>
            <span>Дата рождения</span>
            <input value={form.birthDate ?? ""} onChange={(event) => patch({ birthDate: event.target.value || null })} type="date" />
          </label>
        </div>
        <datalist id="inventory-employee-positions">
          {referenceOptions.positions.map((value) => <option key={value} value={value} />)}
        </datalist>
        <datalist id="inventory-employee-departments">
          {referenceOptions.departments.map((value) => <option key={value} value={value} />)}
        </datalist>
        <datalist id="inventory-employee-groups">
          {referenceOptions.employeeGroups.map((value) => <option key={value} value={value} />)}
        </datalist>

        <p className="inventory-employees-dialog-text">
          Должность, подразделение и группа можно ввести вручную. После сохранения они будут доступны в поиске и фильтрах справочника.
        </p>

        <div className="inventory-employees-dialog-actions">
          <button className="button ghost" disabled={busy} onClick={onCancel} type="button">Отмена</button>
          <button className="button primary" disabled={!canSubmit} onClick={() => onConfirm(form)} type="button">
            {busy ? "Сохраняем..." : mode === "edit" ? "Сохранить изменения" : "Создать"}
          </button>
        </div>
      </section>
    </div>
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
              <td>
                <div className="inventory-employees-person">
                  <span>{getInitials(row.fullName)}</span>
                  <div>
                    <strong>{row.fullName}</strong>
                    <small>{row.birthDate ? `д.р. ${formatDateOnly(row.birthDate)}` : "дата рождения не указана"}</small>
                  </div>
                </div>
              </td>
              <td>{row.personnelNo || "не указан"}</td>
              <td>{row.position || "не указана"}</td>
              <td>{row.department || "не указано"}</td>
              <td>{row.employeeGroup || "не указана"}</td>
              <td>{formatDateOnly(row.hiredAt)}</td>
              <td><span className={`inventory-employees-status ${row.status}`}>{employeeStatusLabel(row.status)}</span></td>
              <td>
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
          hideEmployee
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
      <section className="inventory-employees-dialog inventory-employees-dialog-wide" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Предпросмотр импорта сотрудников">
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
        <div className="inventory-employees-import-references">
          <div><strong>Новые должности</strong><p>{preview.newPositions.join(", ") || "нет"}</p></div>
          <div><strong>Новые подразделения</strong><p>{preview.newDepartments.join(", ") || "нет"}</p></div>
          <div><strong>Новые группы</strong><p>{preview.newGroups.join(", ") || "нет"}</p></div>
        </div>
        {preview.errors.length ? <EmployeeState kind="error" title="Есть ошибки импорта" text={preview.errors.slice(0, 3).join("; ")} /> : null}
        <div className="inventory-employees-preview-table-wrap">
          <table className="inventory-employees-preview-table">
            <thead>
              <tr>
                <th>Строка</th>
                <th>Действие</th>
                <th>ФИО</th>
                <th>Табельный</th>
                <th>Должность</th>
                <th>Подразделение</th>
                <th>Группа</th>
                <th>Ошибка</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, 80).map((row) => (
                <tr key={`${row.rowNumber}-${row.fullName}`} className={row.error ? "is-error" : undefined}>
                  <td>{row.rowNumber}</td>
                  <td><span className={`inventory-employees-change ${row.changeType}`}>{importChangeLabel(row.changeType)}</span></td>
                  <td>{row.fullName}</td>
                  <td>{row.personnelNo}</td>
                  <td>{row.position}</td>
                  <td>{row.department}</td>
                  <td>{row.employeeGroup}</td>
                  <td>{row.error || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer>
          <button className="button ghost" disabled={busy} onClick={onCancel} type="button">Отмена</button>
          <button className="button primary" disabled={busy || preview.errors.length > 0} onClick={onConfirm} type="button">{busy ? "Импорт..." : "Импортировать"}</button>
        </footer>
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

function employeeToForm(employee: InventoryEmployeeDto): EmployeeFormState {
  return {
    birthDate: employee.birthDate,
    department: employee.department,
    employeeGroup: employee.employeeGroup,
    fullName: employee.fullName,
    hasMobileAccount: false,
    hiredAt: employee.hiredAt,
    personnelNo: employee.personnelNo,
    position: employee.position,
    shift: "Пятидневка",
    status: employee.status || "active",
  };
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

function importChangeLabel(value: string) {
  const labels: Record<string, string> = {
    create: "Создать",
    error: "Ошибка",
    update: "Обновить",
  };
  return labels[value] ?? value;
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
