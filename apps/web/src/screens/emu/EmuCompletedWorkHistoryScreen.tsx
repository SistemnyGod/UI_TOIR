import { useEffect, useMemo, useState } from "react";
import type { EmuAuditEventDto, EmuWorkSessionDto, EmuWorkSessionEmployeeDto, SessionUserDto } from "../../api/contracts";
import type { EmuWorkspace } from "../../hooks/useEmuWorkspace";
import { hasPermission } from "../../security/permissions";
import type { EmployeeDirectoryItem } from "../../types";

export function EmuCompletedWorkHistoryScreen({
  currentUser,
  employeeDirectory,
  onNotify,
  workspace,
}: {
  currentUser: SessionUserDto | null;
  employeeDirectory: EmployeeDirectoryItem[];
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [status, setStatus] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [reportRows, setReportRows] = useState<EmuWorkSessionDto[]>(workspace.workSessions.rows);
  const [auditRows, setAuditRows] = useState<EmuAuditEventDto[]>([]);
  const canSeeDeleted = hasPermission(currentUser, "emu.work.delete") || hasPermission(currentUser, "emu.audit.view");
  const employeeOptions = useMemo(
    () =>
      employeeDirectory.length > 0
        ? employeeDirectory
        : workspace.settings.favoriteEmployees.map((employee) => ({
            department: employee.department,
            fullName: employee.fullName,
            id: employee.employeeId,
            personnelNo: employee.personnelNo,
            position: employee.position,
          })),
    [employeeDirectory, workspace.settings.favoriteEmployees],
  );

  useEffect(() => {
    setReportRows(workspace.workSessions.rows);
  }, [workspace.workSessions.rows]);

  const rows = useMemo(
    () =>
      reportRows
        .filter((work) => (includeDeleted && canSeeDeleted ? true : !work.deletedAt))
        .filter((work) => (dateFrom ? work.workDate >= dateFrom : true))
        .filter((work) => (dateTo ? work.workDate <= dateTo : true))
        .filter((work) => (employeeId ? work.employees.some((employee) => employee.employeeId === employeeId) : true))
        .filter((work) => (sectionId ? work.sectionId === sectionId : true))
        .filter((work) => (status ? work.status === status : true)),
    [canSeeDeleted, dateFrom, dateTo, employeeId, includeDeleted, reportRows, sectionId, status],
  );
  const selected = rows.find((work) => work.id === selectedId) ?? rows[0];
  const timeTotals = useMemo(() => calculateHistoryTimeTotals(rows, employeeId), [employeeId, rows]);
  const employeeBreakdown = useMemo(() => buildEmployeeTimeBreakdown(rows, employeeId), [employeeId, rows]);
  const totalMinutes = timeTotals.totalMinutes;
  const workMinutes = timeTotals.workMinutes;
  const waitingMinutes = timeTotals.waitingMinutes + timeTotals.otherWorkMinutes;
  const completed = rows.filter((work) => work.completedAt && !work.deletedAt).length;
  const selectedEmployee = employeeOptions.find((employee) => employee.id === employeeId);
  const selectedSection = workspace.settings.sections.find((section) => section.id === sectionId);
  const analyticsScope = [selectedEmployee?.fullName, selectedSection?.name].filter(Boolean).join(" · ") || "Все работы по фильтру";

  useEffect(() => {
    if (!selected) {
      setAuditRows([]);
      return;
    }

    let mounted = true;
    workspace.actions
      .getWorkSessionAudit(selected.id)
      .then((result) => {
        if (mounted) setAuditRows(result.rows);
      })
      .catch(() => {
        if (mounted) setAuditRows(workspace.auditEvents.filter((event) => event.workSessionId === selected.id));
      });

    return () => {
      mounted = false;
    };
  }, [selected, workspace.actions, workspace.auditEvents]);

  async function buildReport() {
    try {
      const result = await workspace.actions.queryWorkSessions({
        dateFrom,
        dateTo,
        employeeId,
        includeDeleted: includeDeleted && canSeeDeleted,
        sectionId,
        status,
      });
      setReportRows(result.rows);
      setSelectedId(result.rows[0]?.id ?? "");
      onNotify("Отчет сформирован");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось сформировать отчет");
    }
  }

  return (
    <section className="emu-page">
      <div className="emu-page-heading">
        <div>
          <h2>История выполненных работ</h2>
          <p>Отчеты, анализ времени и результаты по сотрудникам, участкам и карточкам.</p>
        </div>
      </div>

      <section className="emu-panel emu-filter-panel">
        <label>С<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label>По<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        <label>Сотрудник<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Все сотрудники</option>{employeeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select></label>
        <label>Участок<select value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">Все участки</option>{workspace.settings.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
        <label>Статус<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Все статусы</option><option>В работе</option><option>В ожидании</option><option>Завершено</option><option>Удалено</option></select></label>
        {canSeeDeleted ? <label className="emu-checkbox"><input checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} type="checkbox" />Показывать удаленные</label> : null}
        <button className="emu-primary-button" onClick={() => void buildReport()} type="button">Сформировать отчет</button>
      </section>

      <div className="emu-history-layout">
        <main className="emu-panel">
          <div className="emu-history-scope">
            <span>Компактная аналитика</span>
            <strong>{analyticsScope}</strong>
          </div>
          <div className="emu-history-stats">
            <article><span>Всего работ</span><strong>{rows.length}</strong></article>
            <article><span>Выполнено</span><strong>{completed}</strong></article>
            <article><span>Человеко-время</span><strong>{formatMinutes(totalMinutes)}</strong></article>
            <article><span>Работа</span><strong>{formatMinutes(workMinutes)}</strong></article>
            <article><span>Ожидание</span><strong>{formatMinutes(waitingMinutes)}</strong></article>
            <article><span>Среднее на работу</span><strong>{formatMinutes(rows.length ? Math.round(totalMinutes / rows.length) : 0)}</strong></article>
          </div>
          <div className="emu-employee-analytics">
            <div className="emu-history-scope">
              <span>Время по сотрудникам</span>
              <strong>{employeeBreakdown.length} в расчете</strong>
            </div>
            <div className="emu-employee-time-grid">
              {employeeBreakdown.map((employee) => (
                <article key={employee.employeeId}>
                  <strong>{employee.employeeName}</strong>
                  <span>{employee.workCount} раб.</span>
                  <small>итого {formatMinutes(employee.totalMinutes)} · работа {formatMinutes(employee.workMinutes)} · ожид. {formatMinutes(employee.waitingMinutes + employee.otherWorkMinutes)}</small>
                </article>
              ))}
              {employeeBreakdown.length === 0 ? <p>Нет данных для расчета.</p> : null}
            </div>
          </div>
          <div className="emu-table-wrap">
            <table className="emu-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Сотрудники</th>
                  <th>Участок</th>
                  <th>Описание</th>
                  <th>Время</th>
                  <th>Статус</th>
                  <th>Результат</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((work) => (
                  <tr className={selected?.id === work.id ? "selected" : ""} key={work.id} onClick={() => setSelectedId(work.id)}>
                    <td>{formatDate(work.workDate)}</td>
                    <td>{formatScopedEmployees(work, employeeId)}</td>
                    <td>{work.sectionName}</td>
                    <td>{work.taskDescription}</td>
                    <td>{formatWorkRowTime(work, employeeId)}</td>
                    <td><span className="emu-status-pill">{work.deletedAt ? "Удалено" : work.status}</span></td>
                    <td>{work.resultStatus || "В работе"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>

        <aside className="emu-panel emu-history-aside">
          {selected ? <HistoryDetails events={auditRows} work={selected} /> : <div className="emu-empty-state">Выберите работу в таблице</div>}
        </aside>
      </div>
    </section>
  );
}

function HistoryDetails({ events, work }: { events: EmuAuditEventDto[]; work: EmuWorkSessionDto }) {
  return (
    <>
      <div className="emu-avatar-title">
        <span>{work.sectionName.slice(0, 2).toUpperCase()}</span>
        <div>
          <h3>{work.sectionName}</h3>
          <p>{work.workNumber}</p>
        </div>
      </div>
      <dl className="emu-kv">
        <div><dt>Дата</dt><dd>{formatDate(work.workDate)}</dd></div>
        <div><dt>Время прихода</dt><dd>{formatDateTime(work.arrivedAt)}</dd></div>
        <div><dt>Время окончания</dt><dd>{work.completedAt ? formatDateTime(work.completedAt) : "не завершено"}</dd></div>
        <div><dt>Работа</dt><dd>{formatMinutes(work.workMinutes)}</dd></div>
        <div><dt>Ожидание</dt><dd>{formatMinutes(work.waitingMinutes + work.otherWorkMinutes)}</dd></div>
      </dl>
      <div className="emu-detail-grid">
        {work.employees.map((employee) => (
          <div key={employee.id}>
            <strong>{employee.fullNameSnapshot}</strong>
            <span>{employee.status}</span>
            <small>итого {formatMinutes(employee.workMinutes + employee.waitingMinutes + employee.otherWorkMinutes)} · работа {formatMinutes(employee.workMinutes)} · ожид. {formatMinutes(employee.waitingMinutes + employee.otherWorkMinutes)}</small>
          </div>
        ))}
      </div>
      <p className="emu-result-text">{work.resultComment || work.taskDescription}</p>
      <div className="emu-timeline compact">
        {events.length ? events.map((event) => (
          <div className={auditEventClass(event.eventType)} key={event.id}>
            <strong>{auditEventLabel(event.eventType)}</strong>
            <span>{formatDateTime(event.createdAt)} · {event.actor}</span>
            <p>{event.comment || `${event.fromStatus} → ${event.toStatus}`}</p>
          </div>
        )) : <p>Событий по карточке пока нет.</p>}
      </div>
    </>
  );
}

type EmployeeTimeBreakdown = {
  employeeId: string;
  employeeName: string;
  otherWorkMinutes: number;
  totalMinutes: number;
  waitingMinutes: number;
  workCount: number;
  workMinutes: number;
};

type HistoryTimeTotals = Pick<EmployeeTimeBreakdown, "otherWorkMinutes" | "totalMinutes" | "waitingMinutes" | "workMinutes">;

function getScopedEmployees(work: EmuWorkSessionDto, employeeId: string): EmuWorkSessionEmployeeDto[] {
  return employeeId ? work.employees.filter((employee) => employee.employeeId === employeeId) : work.employees;
}

function calculateHistoryTimeTotals(rows: EmuWorkSessionDto[], employeeId: string): HistoryTimeTotals {
  return rows.reduce<HistoryTimeTotals>(
    (totals, work) => {
      for (const employee of getScopedEmployees(work, employeeId)) {
        totals.workMinutes += employee.workMinutes;
        totals.waitingMinutes += employee.waitingMinutes;
        totals.otherWorkMinutes += employee.otherWorkMinutes;
        totals.totalMinutes += employee.workMinutes + employee.waitingMinutes + employee.otherWorkMinutes;
      }

      return totals;
    },
    { otherWorkMinutes: 0, totalMinutes: 0, waitingMinutes: 0, workMinutes: 0 },
  );
}

function buildEmployeeTimeBreakdown(rows: EmuWorkSessionDto[], employeeId: string): EmployeeTimeBreakdown[] {
  const byEmployee = new Map<string, EmployeeTimeBreakdown & { workIds: Set<string> }>();

  for (const work of rows) {
    for (const employee of getScopedEmployees(work, employeeId)) {
      const row =
        byEmployee.get(employee.employeeId) ??
        {
          employeeId: employee.employeeId,
          employeeName: employee.fullNameSnapshot,
          otherWorkMinutes: 0,
          totalMinutes: 0,
          waitingMinutes: 0,
          workCount: 0,
          workIds: new Set<string>(),
          workMinutes: 0,
        };

      row.workIds.add(work.id);
      row.workCount = row.workIds.size;
      row.workMinutes += employee.workMinutes;
      row.waitingMinutes += employee.waitingMinutes;
      row.otherWorkMinutes += employee.otherWorkMinutes;
      row.totalMinutes += employee.workMinutes + employee.waitingMinutes + employee.otherWorkMinutes;
      byEmployee.set(employee.employeeId, row);
    }
  }

  return [...byEmployee.values()]
    .map(({ workIds: _workIds, ...row }) => row)
    .sort((a, b) => b.totalMinutes - a.totalMinutes || a.employeeName.localeCompare(b.employeeName, "ru"));
}

function formatScopedEmployees(work: EmuWorkSessionDto, employeeId: string) {
  return getScopedEmployees(work, employeeId).map((employee) => employee.fullNameSnapshot).join(", ");
}

function formatWorkRowTime(work: EmuWorkSessionDto, employeeId: string) {
  const totals = calculateHistoryTimeTotals([work], employeeId);
  return `${formatMinutes(totals.workMinutes)} / ожид. ${formatMinutes(totals.waitingMinutes + totals.otherWorkMinutes)}`;
}

function auditEventLabel(eventType: string) {
  const labels: Record<string, string> = {
    arrived_at_changed: "Ручная корректировка времени прихода",
    carried_over: "Перенос на следующие сутки",
    completed: "Завершение работы",
    completed_at_changed: "Ручная корректировка времени окончания",
    created: "Создание карточки",
    deleted: "Удаление карточки",
    employees_changed: "Изменение сотрудников",
    other_work: "На другой работе",
    paused: "Пауза",
    resumed: "Продолжение работы",
    section_changed: "Изменение участка",
    task_changed: "Изменение задачи",
    updated: "Изменение карточки",
    work_date_changed: "Ручная корректировка рабочей даты",
  };
  return labels[eventType] ?? eventType;
}

function auditEventClass(eventType: string) {
  if (eventType === "deleted") return "audit-danger";
  if (eventType === "arrived_at_changed" || eventType === "completed_at_changed" || eventType === "work_date_changed") return "audit-manual";
  return "";
}

function formatMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU");
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit" });
}
