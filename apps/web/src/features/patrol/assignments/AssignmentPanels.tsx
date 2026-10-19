import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, CompactTable, IconButton, Panel, type CompactTableColumn } from "../../../shared/ui";
import type {
  ActivePatrol,
  DataSourceStatus,
  Employee,
  EmployeeDirectoryItem,
  RouteDirectoryItem,
  RouteOption,
  ScreenId,
  ServiceRequest
} from "../../../types";
import {
  addMonths,
  buildCalendarDays,
  createAssignmentHistoryEvents,
  formatAssignmentActionTime,
  formatDate,
  formatMonthLabel,
  formatPeriodLabel,
  formatShiftRange,
  getCalendarDayClass,
  normalizeDateRange,
  parseDateKey,
  parseRequestScheduledAt,
  shiftText,
  shiftTime,
  startOfMonth,
  toDateInput
} from "./assignmentDateUtils";
import type { AssignmentIconComponent } from "./AssignmentIcons";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  MoreVertical,
  Route,
  Search,
  SlidersHorizontal,
  UserPlus,
  Wifi
} from "./AssignmentIcons";
import { AssignmentRouteChoice } from "./AssignmentRouteChoice";
import { AssignmentStatusBadge as StatusPill } from "./AssignmentStatusBadge";
import type { ShiftTimeSettings } from "./assignmentTypes";
import {
  assignmentStatusText,
  isAssignmentCurrent,
  isRequestCurrent
} from "./assignmentUtils";

import { Avatar, EmptyPanel, PanelHeader } from "../assignmentOverlays";
const HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function PeriodFilter({
  dateFrom,
  dateTo,
  draftFrom,
  draftTo,
  isOpen,
  onApply,
  onClear,
  onDraftFromChange,
  onDraftToChange,
  onOpen,
}: {
  dateFrom: string;
  dateTo: string;
  draftFrom: string;
  draftTo: string;
  isOpen: boolean;
  onApply: () => void;
  onClear: () => void;
  onDraftFromChange: (value: string) => void;
  onDraftToChange: (value: string) => void;
  onOpen: () => void;
}) {
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(parseDateKey(draftFrom || draftTo) ?? new Date()));
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);

  useEffect(() => {
    if (isOpen) {
      setCalendarMonth(startOfMonth(parseDateKey(draftFrom || draftTo) ?? new Date()));
    }
  }, [draftFrom, draftTo, isOpen]);

  function selectDate(value: string) {
    if (!draftFrom || draftTo) {
      onDraftFromChange(value);
      onDraftToChange("");
      return;
    }

    const range = normalizeDateRange(draftFrom, value);
    onDraftFromChange(range.from);
    onDraftToChange(range.to);
  }

  return (
    <div className="assign-am-period-filter">
      <span>
        <small>Период</small>
        <Button className="assign-am-period-button" onClick={onOpen} variant="ghost">
          <strong>{formatPeriodLabel(dateFrom, dateTo)}</strong>
          <em>Выбрать</em>
        </Button>
      </span>
      <CalendarDays size={17} />
      {isOpen ? (
        <div className="assign-am-period-popover">
          <div className="date-range-calendar-head">
            <IconButton
              label="Предыдущий месяц"
              className="icon-button"
              onClick={() => setCalendarMonth((current) => addMonths(current, -1))}
            >
              ‹
            </IconButton>
            <strong>{formatMonthLabel(calendarMonth)}</strong>
            <IconButton
              label="Следующий месяц"
              className="icon-button"
              onClick={() => setCalendarMonth((current) => addMonths(current, 1))}
            >
              ›
            </IconButton>
          </div>
          <div className="date-range-calendar-weekdays" aria-hidden="true">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="date-range-calendar-grid">
            {calendarDays.map((day) => (
              <button
                aria-label={formatDate(day.value)}
                className={getCalendarDayClass(day.value, day.inCurrentMonth, draftFrom, draftTo)}
                key={day.value}
                onClick={() => selectDate(day.value)}
                type="button"
              >
                {day.date.getDate()}
              </button>
            ))}
          </div>
          <div className="date-range-summary">
            <span>{formatPeriodLabel(draftFrom, draftTo)}</span>
          </div>
          <div className="date-range-actions">
            <Button onClick={onClear} variant="ghost">Очистить</Button>
            <Button onClick={onApply} variant="primary">Применить</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function isAssignmentOnDate(assignment: ActivePatrol, date: string) {
  if (!date) return false;

  const source = assignment.plannedAtIso ?? assignment.plannedAt;
  if (!source) return false;

  const parsed = new Date(source);
  return !Number.isNaN(parsed.getTime()) && toDateInput(parsed) === date;
}

export function isAssignableDirectoryEmployee(employee: EmployeeDirectoryItem) {
  return !/^(?:\u041e\u0444\u043b\u0430\u0439\u043d|\u041e\u0442\u043f\u0443\u0441\u043a|\u0410\u0440\u0445\u0438\u0432|\u041d\u0435\u0430\u043a\u0442\u0438\u0432\u0435\u043d|\u0423\u0434\u0430\u043b\u0435\u043d)/i.test(employee.status.trim());
}

function FilterBox({ icon: Icon, label, value }: { icon?: AssignmentIconComponent; label: string; value: string }) {
  return (
    <button className="assign-am-filter" type="button">
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
      {Icon ? <Icon size={17} /> : <span aria-hidden="true">⌄</span>}
    </button>
  );
}

export function EmployeesPanel({
  search,
  onSearchChange,
  employees,
  errorMessage,
  status,
  selectedEmployeeId,
  totalEmployees,
  onOpenPicker,
  onOpenShiftSettings,
  onNavigate,
  onRetry,
  onSelectEmployee,
  shiftSettings,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  employees: Employee[];
  errorMessage?: string;
  status: DataSourceStatus;
  selectedEmployeeId?: string;
  totalEmployees: number;
  onOpenPicker: () => void;
  onOpenShiftSettings: () => void;
  onNavigate: (screen: ScreenId) => void;
  onRetry: () => void | Promise<void>;
  onSelectEmployee: (id: string) => void;
  shiftSettings: ShiftTimeSettings;
}) {
  return (
    <Panel className="assign-am-panel">
      <PanelHeader actionLabel="Настроить избранных" count={employees.length} icon={UserPlus} onAction={onOpenPicker} title="Сотрудники" />
      <label className="assignment-employee-search"><Search size={17} /><input aria-label="Поиск сотрудника для назначения обхода" placeholder="Поиск по ФИО, должности…" value={search} onChange={(event) => onSearchChange(event.currentTarget.value)} /></label>
      <div className="assign-am-shift-settings-bar">
        <span>
          День {formatShiftRange(shiftSettings.dayStart, shiftSettings.dayEnd)} · Ночь {formatShiftRange(shiftSettings.nightStart, shiftSettings.nightEnd)}
        </span>
        <button onClick={onOpenShiftSettings} type="button">
          <SlidersHorizontal size={16} />
          Смены
        </button>
      </div>
      {employees.length ? (
        <div className="assign-am-list">
          {employees.map((employee) => {
            const active = selectedEmployeeId === employee.id;
            return (
              <button aria-pressed={active} className={`assign-am-employee ${active ? "active" : ""}`} key={employee.id} onClick={() => onSelectEmployee(employee.id)} type="button">
                <Avatar name={employee.name} />
                <div className="assign-am-employee-main">
                  <strong>{employee.name}</strong>
                  <span>{employee.role}</span>
                  <small>Зона: {employee.zone}</small>
                </div>
                <div className="assign-am-shift">
                  <strong>{shiftText(employee.shift)}</strong>
                  <span>{shiftTime(employee.shift, shiftSettings)}</span>
                  <Wifi size={15} />
                </div>
                <span className="assign-am-radio" />
              </button>
            );
          })}
        </div>
      ) : status === "loading" ? (
        <EmptyPanel
          description="Получаем список сотрудников из backend API."
          title="Сотрудники загружаются"
        />
      ) : status === "error" ? (
        <EmptyPanel
          actionLabel="Повторить загрузку"
          description={errorMessage || "Проверьте backend API и повторите загрузку справочника сотрудников."}
          onAction={onRetry}
          title="Сотрудники API не загружены"
        />
      ) : (
        <EmptyPanel
          actionLabel={totalEmployees > 0 ? "Настроить избранных" : "Открыть сотрудников"}
          description={totalEmployees > 0 ? "Измените фильтры или настройте избранных сотрудников для быстрого доступа." : "Список будет загружен из справочника сотрудников."}
          onAction={totalEmployees > 0 ? onOpenPicker : () => onNavigate("employees")}
          title={totalEmployees > 0 ? "Сотрудники не найдены" : "Сотрудников нет"}
        />
      )}
    </Panel>
  );
}

export { AssignmentEmployeePickerModal } from "./AssignmentEmployeePickerModal";
export { ShiftSettingsModal } from "./ShiftSettingsModal";

export function RoutesPanel({
  routeDirectory,
  errorMessage,
  status,
  routes,
  selectedRouteId,
  onNavigate,
  onRetry,
  onSelectRoute,
}: {
  routeDirectory: RouteDirectoryItem[];
  errorMessage?: string;
  status: DataSourceStatus;
  routes: RouteOption[];
  selectedRouteId?: string;
  onNavigate: (screen: ScreenId) => void;
  onRetry: () => void | Promise<void>;
  onSelectRoute: (id: string) => void;
}) {
  return (
    <Panel className="assign-am-panel">
      <PanelHeader count={routes.length} icon={Route} title="Доступные маршруты" />
      {routes.length ? (
        <div className="assign-am-list routes">
          {routes.map((route) => <AssignmentRouteChoice key={route.id} route={route} selected={selectedRouteId === route.id} onSelect={onSelectRoute} directory={routeDirectory.find((item) => item.id === route.id)} />)}
        </div>
      ) : status === "loading" ? (
        <EmptyPanel
          description="Получаем список маршрутов из backend API."
          title="Маршруты загружаются"
        />
      ) : status === "error" ? (
        <EmptyPanel
          actionLabel="Повторить загрузку"
          description={errorMessage || "Проверьте backend API и повторите загрузку справочника маршрутов."}
          onAction={onRetry}
          title="Маршруты API не загружены"
        />
      ) : (
        <EmptyPanel
          actionLabel="Открыть маршруты"
          description="Маршруты появятся после заполнения справочника маршрутов и точек."
          onAction={() => onNavigate("routes")}
          title="Маршрутов для назначения нет"
        />
      )}
    </Panel>
  );
}

export function EmployeeHistoryPanel({
  assignments,
  canManage,
  employee,
  onCancelAssignment,
  onOpenEmployeePicker,
  onOpenRequest,
  onOpenRequestById,
  requests,
  savingAssignmentId,
}: {
  assignments: ActivePatrol[];
  canManage: boolean;
  employee?: Employee;
  onCancelAssignment: (assignmentId: string) => void | Promise<void>;
  onOpenEmployeePicker: () => void;
  onOpenRequest: () => void;
  onOpenRequestById: (requestId: string) => void;
  requests: ServiceRequest[];
  savingAssignmentId?: string;
}) {
  const employeeAssignments = employee
    ? assignments.filter((assignment) => assignment.employeeId === employee.id || assignment.employee === employee.name)
    : [];
  const employeeRequests = employee
    ? requests.filter((request) => request.employeeId === employee.id || request.employee === employee.name)
    : [];
  const historyCutoff = Date.now() - HISTORY_WINDOW_MS;
  const recentAssignments = employeeAssignments.filter((assignment) =>
    createAssignmentHistoryEvents(assignment).some((event) => event.sortAt >= historyCutoff),
  );
  const recentRequests = employeeRequests.filter((request) => parseRequestScheduledAt(request) >= historyCutoff);
  const activeAssignments = employeeAssignments.filter(isAssignmentCurrent);
  const allAssignmentRequestIds = new Set(employeeAssignments.map((assignment) => assignment.patrolRequestId).filter(Boolean));
  const activeRequestItems = [
    ...activeAssignments.map((assignment) => {
      const request = assignment.patrolRequestId
        ? employeeRequests.find((item) => item.id === assignment.patrolRequestId)
        : undefined;

      return {
        assignmentId: assignment.id,
        id: `assignment-${assignment.id}`,
        meta: formatAssignmentActionTime(assignment),
        requestId: request?.id,
        route: assignment.route,
        status: assignmentStatusText(assignment.status),
        title: request?.title || "Действующая заявка",
      };
    }),
    ...employeeRequests
      .filter((request) => isRequestCurrent(request) && !allAssignmentRequestIds.has(request.id))
      .map((request) => ({
        assignmentId: undefined,
        id: `request-${request.id}`,
        meta: `${formatDate(request.scheduledDate)} ${request.scheduledTime}`,
        requestId: request.id,
        route: request.route,
        status: request.status,
        title: request.title || "Заявка на обход",
      })),
  ].slice(0, 8);
  const historyEvents = [
    ...recentAssignments.flatMap((assignment) => createAssignmentHistoryEvents(assignment)),
    ...recentRequests
      .filter((request) => !allAssignmentRequestIds.has(request.id))
      .map((request) => ({
        id: `request-${request.id}`,
        meta: `План: ${formatDate(request.scheduledDate)} ${request.scheduledTime}`,
        route: request.route,
        sortAt: parseRequestScheduledAt(request),
        status: request.status,
        title: request.title || "Заявка на обход",
      })),
  ].filter((event) => event.sortAt >= historyCutoff).sort((left, right) => right.sortAt - left.sortAt).slice(0, 8);
  const routeCount = new Set([
    ...recentAssignments.map((assignment) => assignment.route),
    ...recentRequests.map((request) => request.route),
  ].filter(Boolean)).size;

  return (
    <Panel className="assign-am-panel assign-am-history-panel">
      <PanelHeader count={activeRequestItems.length} icon={Clock3} title="История сотрудника" />
      {employee ? (
        <>
          <div className="assign-am-history-profile">
            <Avatar name={employee.name} />
            <div>
              <strong>{employee.name}</strong>
              <span>{employee.role}</span>
              <small>Зона: {employee.zone}</small>
            </div>
          </div>
          <div className="assign-am-history-stats">
            <span><strong>{activeRequestItems.length}</strong><small>действующих</small></span>
            <span><strong>{recentRequests.length}</strong><small>заявок за 7 дней</small></span>
            <span><strong>{routeCount}</strong><small>маршрутов за 7 дней</small></span>
          </div>
          {activeRequestItems.length ? (
            <div className="assign-am-history-actions">
              <div className="assign-am-history-section-title">
                <strong>Действующие заявки</strong>
                <span>{activeRequestItems.length}</span>
              </div>
              {activeRequestItems.map((item) => (
                <article className="assign-am-history-action-card" key={item.id}>
                  <div>
                    <span>{item.title}</span>
                    <strong>{item.route || "Маршрут не указан"}</strong>
                    <small>{item.status} · {item.meta}</small>
                  </div>
                  <div className="assign-am-history-action-buttons">
                    {item.requestId ? (
                      <button className="assign-am-mini-button" onClick={() => onOpenRequestById(item.requestId!)} type="button">
                        Просмотр
                      </button>
                    ) : null}
                    {item.assignmentId ? (
                      <button
                        className="assign-am-mini-button danger"
                        disabled={!canManage || savingAssignmentId === item.assignmentId}
                        onClick={() => void onCancelAssignment(item.assignmentId!)}
                        title={canManage ? "Отменить назначение на обход" : "Недостаточно прав для отмены"}
                        type="button"
                      >
                        {savingAssignmentId === item.assignmentId ? "Отмена..." : "Отменить"}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          {historyEvents.length ? (
            <div className="assign-am-history-list">
              <div className="assign-am-history-section-title">
                <strong>События за последние 7 дней</strong>
                <span>{historyEvents.length}</span>
              </div>
              {historyEvents.map((event) => (
                <div className="assign-am-history-event" key={event.id}>
                  <div className="assign-am-history-event-main">
                    <span>{event.title}</span>
                    <strong>{event.route || "Маршрут не указан"}</strong>
                  </div>
                  <div className="assign-am-history-event-meta">
                    <span>{event.status}</span>
                    {event.meta.split(" · ").map((part) => (
                      <small key={`${event.id}-${part}`}>{part}</small>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel
              description="По выбранному сотруднику пока нет заявок и активных обходов в текущем контуре."
              title="История пуста"
            />
          )}
        </>
      ) : (
        <EmptyPanel
          actionLabel="Настроить сотрудников"
          description="Выберите сотрудника из левой панели, чтобы увидеть его заявки, маршруты и активные назначения."
          onAction={onOpenEmployeePicker}
          title="Сотрудник не выбран"
        />
      )}
    </Panel>
  );
}

export function ActiveAssignmentsCard({
  assignments,
  canManage,
  errorMessage,
  onRetry,
  onRunCommand,
  savingAssignmentId,
  status,
}: {
  assignments: ActivePatrol[];
  canManage: boolean;
  errorMessage?: string;
  onRetry: () => void | Promise<void>;
  onRunCommand: (id: string, command: "start" | "cancel" | "complete") => void | Promise<unknown>;
  savingAssignmentId?: string;
  status: DataSourceStatus;
}) {
  const [openActionMenu, setOpenActionMenu] = useState<{ assignmentId: string; left: number; top: number } | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const actionTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const currentAssignments = assignments.filter(isAssignmentCurrent);
  const waitingCount = currentAssignments.filter((assignment) => assignmentStatusText(assignment.status) === "Ожидает начала").length;
  const inProgressCount = currentAssignments.filter((assignment) => assignmentStatusText(assignment.status) === "Выполняется").length;

  useEffect(() => {
    if (!openActionMenu) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".patrol-active-table-actions, .patrol-active-table-action-menu")) return;
      setOpenActionMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        actionTriggerRefs.current[openActionMenu.assignmentId]?.focus({ preventScroll: true });
        setOpenActionMenu(null);
      }
    };
    const handleViewportChange = () => {
      const trigger = actionTriggerRefs.current[openActionMenu.assignmentId];
      if (!trigger?.isConnected) { setOpenActionMenu(null); return; }
      const rect = trigger.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) { setOpenActionMenu(null); return; }
      const size = actionMenuRef.current?.getBoundingClientRect();
      const position = assignmentMenuPosition(rect, size?.width ?? 196, size?.height ?? 116);
      setOpenActionMenu(current => !current || (current.top === position.top && current.left === position.left) ? current : { ...current, ...position });
    };

    actionMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    handleViewportChange();
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [openActionMenu?.assignmentId]);

  const columns: CompactTableColumn<ActivePatrol>[] = [
    {
      key: "assignment",
      header: "Назначение",
      render: (assignment) => (
        <span className="patrol-active-table-assignment">
          <strong className="patrol-active-table-primary" title={assignment.employee}>{assignment.employee}</strong>
          <span className="patrol-active-table-route" title={assignment.route}>{assignment.route}</span>
        </span>
      ),
      width: "52%",
    },
    {
      key: "state",
      header: "Состояние",
      render: (assignment) => (
        <span className="patrol-active-table-state">
          <span className="patrol-active-table-state-line">
            <StatusPill value={assignment.status} />
            <small>{formatAssignmentActionTime(assignment)}</small>
          </span>
          <span className="patrol-active-table-progress-line">
            <span
              aria-label={`Прогресс обхода ${assignment.progress}%`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={assignment.progress}
              className="patrol-active-table-progress"
              role="progressbar"
            >
              <i style={{ width: `${assignment.progress}%` }} />
            </span>
            <small>{assignment.progress}%</small>
          </span>
        </span>
      ),
      width: "38%",
    },
    {
      key: "actions",
      header: <span className="visually-hidden">Действия</span>,
      render: (assignment) => {
        const started = assignmentStatusText(assignment.status) === "Выполняется";
        const saving = savingAssignmentId === assignment.id;
        const menuOpen = openActionMenu?.assignmentId === assignment.id;
        const runCommand = (command: "start" | "cancel" | "complete") => {
          actionTriggerRefs.current[assignment.id]?.focus({ preventScroll: true });
          setOpenActionMenu(null);
          void onRunCommand(assignment.id, command);
        };
        const toggleMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
          if (menuOpen) {
            setOpenActionMenu(null);
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          setOpenActionMenu({
            assignmentId: assignment.id,
            ...assignmentMenuPosition(rect, 196, 116),
          });
        };
        return (
          <div className="patrol-active-table-actions">
            <IconButton
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              disabled={!canManage || saving}
              label={`Действия по маршруту: ${assignment.route}`}
              onClick={toggleMenu}
              ref={(element) => { actionTriggerRefs.current[assignment.id] = element; }}
            >
              <MoreVertical size={18} />
            </IconButton>
            {menuOpen && typeof document !== "undefined" ? createPortal(
              <div
                className="patrol-active-table-action-menu"
                ref={actionMenuRef}
                role="menu"
                style={{ left: openActionMenu.left, top: openActionMenu.top }}
              >
                <Button disabled={started || saving} onClick={() => runCommand("start")} role="menuitem" variant="ghost">Начать обход</Button>
                <Button disabled={saving} onClick={() => runCommand("complete")} role="menuitem" variant="ghost">Завершить обход</Button>
                <Button className="danger-outline" disabled={saving} onClick={() => runCommand("cancel")} role="menuitem" variant="ghost">Отменить назначение</Button>
              </div>,
              document.body,
            ) : null}
          </div>
        );
      },
      width: "44px",
    },
  ];

  return (
    <section className="assign-am-card assign-am-current-routes-card">
      <PanelHeader count={currentAssignments.length} icon={CheckCircle2} title="Назначенные маршруты сейчас" />
      {status === "loading" ? (
        <EmptyPanel description="Получаем актуальный список из backend API." title="Назначения загружаются" />
      ) : status === "error" ? (
        <EmptyPanel actionLabel="Повторить" description={errorMessage || "Backend API не вернул список назначений."} onAction={onRetry} title="Назначения API не загружены" />
      ) : currentAssignments.length ? (
        <>
          <div className="assign-am-active-summary">
            <span><strong>{waitingCount}</strong><small>ожидают начала</small></span>
            <span><strong>{inProgressCount}</strong><small>выполняются</small></span>
            <span><strong>{currentAssignments.length}</strong><small>всего активных</small></span>
          </div>
          <CompactTable
            className="patrol-active-assignments-table"
            columns={columns}
            getRowKey={(assignment) => assignment.id}
            rows={currentAssignments}
          />
        </>
      ) : (
        <EmptyPanel description="Назначенные маршруты появятся здесь после отправки заявки сотруднику. Отмененные и завершенные обходы в этот список не попадают." title="Текущих назначенных маршрутов нет" />
      )}
    </section>
  );
}

function assignmentMenuPosition(rect: Pick<DOMRect, "top" | "bottom" | "right">, width: number, height: number) {
  const opensUp = rect.bottom + 6 + height > window.innerHeight && rect.top > height + 6;
  return {
    left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
    top: opensUp ? Math.max(8, rect.top - height - 6) : Math.min(rect.bottom + 6, window.innerHeight - height - 8),
  };
}
