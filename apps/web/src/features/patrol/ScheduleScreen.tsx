import { ScheduleEditPanel } from "./components/schedule/ScheduleEditPanel";
import { ScheduleGridPanel } from "./components/schedule/ScheduleGridPanel";
import { ScheduleToolbar } from "./components/schedule/ScheduleToolbar";
import { filterScheduleCells, scheduleState, type ScheduleStatusFilter } from "./components/schedule/schedulePresentation";
import "./components/schedule/scheduleWorkspace.css";
import {
  loadAssignmentFavoriteEmployeeIds,
  subscribeAssignmentFavoriteEmployeeIds,
} from "./assignments/assignmentStorage";
import { useSchedulePlanning } from "../../hooks/useSchedulePlanning";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ActivePatrol,
  CancelAssignmentPayload,
  CompleteAssignmentPayload,
  CreateServiceRequestPayload,
  DataSourceMode,
  EmployeeDirectoryItem,
  PatrolResult,
  RouteDirectoryItem,
  ScheduleCell,
  ScheduleMode,
  ServiceRequest,
} from "../../types";

type MaybePromise<T> = T | Promise<T>;

export function ScheduleScreen({
  activePatrols,
  canManage = true,
  dataSourceMode,
  employeeDirectory,
  favoriteEmployeeIds: favoriteEmployeeIdsOverride,
  mode,
  onModeChange,
  onNotify,
  onCreateScheduledRequest,
  onOpenRequestById,
  onRunAssignmentCommand,
  patrolResults = [],
  requests,
  routeDirectory,
  selectedCellId,
  onSelectCell,
}: {
  activePatrols: ActivePatrol[];
  canManage?: boolean;
  dataSourceMode: DataSourceMode;
  employeeDirectory: EmployeeDirectoryItem[];
  /** Optional externally supplied favorites, e.g. in a preview without storage writes. */
  favoriteEmployeeIds?: string[];
  mode: ScheduleMode;
  onModeChange: (mode: ScheduleMode) => void;
  onNotify: (message: string) => void;
  onCreateScheduledRequest: (payload: CreateServiceRequestPayload) => MaybePromise<ServiceRequest>;
  onOpenRequestById: (requestId: string) => void;
  onRunAssignmentCommand: (
    assignmentId: string,
    command: "start" | "cancel" | "complete",
    payload?: CompleteAssignmentPayload | CancelAssignmentPayload,
  ) => MaybePromise<void>;
  patrolResults?: PatrolResult[];
  requests: ServiceRequest[];
  routeDirectory: RouteDirectoryItem[];
  selectedCellId: string;
  onSelectCell: (id: string) => void;
}) {
  const [anchorDate, setAnchorDate] = useState(() => toDateInput(new Date()));
  const [shiftFilter, setShiftFilter] = useState<"all" | "day" | "night">("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ScheduleStatusFilter>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(true);
  const [dialogCell, setDialogCell] = useState<ScheduleCell>();
  const draftNumber = useRef(0);
  const [favoriteEmployeeIds] = useState(() => loadAssignmentFavoriteEmployeeIds());
  const [syncedFavoriteEmployeeIds, setSyncedFavoriteEmployeeIds] = useState(() => loadAssignmentFavoriteEmployeeIds());
  const scheduleEmployees = useMemo(() => {
    const favoriteSet = new Set(favoriteEmployeeIdsOverride ?? syncedFavoriteEmployeeIds);
    return favoritesOnly && favoriteSet.size > 0 ? employeeDirectory.filter((employee) => favoriteSet.has(employee.id)) : employeeDirectory;
  }, [employeeDirectory, favoriteEmployeeIdsOverride, syncedFavoriteEmployeeIds, favoritesOnly]);
  const favoriteCount = (favoriteEmployeeIdsOverride ?? syncedFavoriteEmployeeIds).length;
  const {
    errorMessage,
    exceptionCount,
    plannedCount,
    refreshScheduleReferences,
    scheduleCells,
    selected: selectedFromPlan,
    status,
    days,
  } = useSchedulePlanning({
    activePatrols,
    anchorDate,
    dataSourceMode,
    employeeDirectory: scheduleEmployees,
    mode,
    requests,
    routeDirectory,
    selectedCellId,
    shiftFilter,
    restrictToDirectory: favoritesOnly && favoriteCount > 0,
  });
  const selected = dialogCell ?? selectedFromPlan;
  const filteredCells = useMemo(() => filterScheduleCells(scheduleCells, query, statusFilter), [scheduleCells, query, statusFilter]);
  const eligibleEmployees = scheduleEmployees.filter(employee => employee.status !== "Отпуск" && (shiftFilter === "all" || (employee.shift.includes("Ноч") ? "night" : "day") === shiftFilter));
  const canCreate = scheduleEmployees.some(employee => employee.status !== "Отпуск") && routeDirectory.some(route => route.status !== "Архив");
  const hasFilters = Boolean(query.trim() || statusFilter !== "all" || shiftFilter !== "all" || (favoriteCount > 0 && favoritesOnly));
  const completedCount = scheduleCells.filter(cell => scheduleState(cell).tone === "completed").length;
  const activeCount = scheduleCells.filter(cell => scheduleState(cell).tone === "active").length;

  function createForDay(date = anchorDate, template?: ScheduleCell) {
    if (!canManage || !canCreate) return;
    const employee = (template ? scheduleEmployees.find(item => item.id === template.employeeId) : eligibleEmployees[0]) ?? scheduleEmployees.find(item => item.status !== "Отпуск");
    if (!employee) return;
    onSelectCell("");
    setDialogCell({ id: `draft:${++draftNumber.current}`, date, day: new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T00:00:00`)),
      employee: employee.fullName, employeeId: employee.id, shift: template?.shift ?? (shiftFilter === "night" || (shiftFilter === "all" && employee.shift.includes("Ноч")) ? "Ночная" : "Дневная"), state: "empty", route: "", zone: employee.department });
  }

  function selectCell(id: string) {
    setDialogCell(scheduleCells.find(cell => cell.id === id));
    onSelectCell(id);
  }

  useEffect(() => {
    setSyncedFavoriteEmployeeIds(favoriteEmployeeIds);
    return subscribeAssignmentFavoriteEmployeeIds(setSyncedFavoriteEmployeeIds);
  }, [favoriteEmployeeIds]);
  const selectedResultHistory = useMemo(
    () => selectScheduleResultHistory(patrolResults, selected, { matchSelectedOnly: true }),
    [patrolResults, selected],
  );

  return (
    <div className="screen-stack schedule-workspace">
      <header className="plan-page-heading"><div><h1>Плановый обход</h1><p>Расписание сотрудников по маршрутам и сменам</p></div></header>
      <ScheduleToolbar
        canManage={canManage}
        canCreate={canCreate}
        mode={mode}
        anchorDate={anchorDate}
        shiftFilter={shiftFilter}
        exceptionCount={exceptionCount}
        onAnchorDateChange={setAnchorDate}
        onModeChange={onModeChange}
        query={query}
        statusFilter={statusFilter}
        favoritesOnly={favoritesOnly}
        favoriteCount={favoriteCount}
        onQueryChange={setQuery}
        onStatusFilterChange={setStatusFilter}
        onFavoritesOnlyChange={setFavoritesOnly}
        onCreate={() => createForDay()}
        onShiftFilterChange={setShiftFilter}
      />

      <div className="plan-summary" aria-label="Сводка за выбранный период">
        <div><span className="plan-summary-dot planned" /><strong>{plannedCount}</strong><span>Запланировано</span></div>
        <div><span className="plan-summary-dot active" /><strong>{activeCount}</strong><span>В работе</span></div>
        <div><span className="plan-summary-dot completed" /><strong>{completedCount}</strong><span>Выполнено</span></div>
        <button aria-label="Показать исключения" onClick={() => onModeChange("exceptions")} type="button"><span className="plan-summary-dot cancelled" /><strong>{exceptionCount}</strong><span>Исключения</span></button>
      </div>
        <ScheduleGridPanel
          mode={mode}
          scheduleCells={filteredCells}
          status={status}
          errorMessage={errorMessage}
          days={days}
          selectedCellId={selectedCellId}
          onSelectCell={selectCell}
          canManage={canManage}
          hasFilters={hasFilters}
          onCreateDay={createForDay}
          onResetFilters={() => { setQuery(""); setStatusFilter("all"); setShiftFilter("all"); setFavoritesOnly(false); }}
          onRetry={refreshScheduleReferences}
        />


      {selected ? (
        <ScheduleEditPanel
          key={selected.id}
          canManage={canManage}
          employees={scheduleEmployees}
          resultHistory={selectedResultHistory.results}
          resultHistoryMode={selectedResultHistory.mode}
          routes={routeDirectory.filter(route => route.status !== "Архив" || route.id === selected.routeId)}
          selected={selected}
          onClose={() => { setDialogCell(undefined); onSelectCell(""); }}
          onCreateScheduledRequest={onCreateScheduledRequest}
          onNotify={onNotify}
          onOpenRequestById={onOpenRequestById}
          onRunAssignmentCommand={onRunAssignmentCommand}
        />
      ) : null}
    </div>
  );
}

const recentHistoryDays = 90;
const recentHistoryLimit = 10;

export function selectScheduleResultHistory(results: PatrolResult[], selected?: ScheduleCell, { matchSelectedOnly = false }: { matchSelectedOnly?: boolean } = {}) {
  if (!selected) return { mode: "day" as const, results: [] };
  const selectedDateKey = toDateInputKey(selected.date);
  const sortedResults = [...results].sort(
    (first, second) =>
      toSortableDate(second.actualAt || second.plannedAt).getTime() -
      toSortableDate(first.actualAt || first.plannedAt).getTime(),
  );
  const relevantResults = matchSelectedOnly ? sortedResults.filter(result =>
    result.employeeId === selected.employeeId || result.employee === selected.employee ||
    Boolean(selected.routeId && result.routeId === selected.routeId) || Boolean(selected.route && result.route === selected.route)) : sortedResults;
  const dayResults = relevantResults.filter(
    (result) => toDateInputKey(result.actualAt || result.plannedAt) === selectedDateKey,
  );
  if (dayResults.length > 0) return { mode: "day" as const, results: dayResults };

  const cutoff = toSortableDate(selected.date);
  cutoff.setDate(cutoff.getDate() - recentHistoryDays);
  const cutoffKey = toDateInput(cutoff);
  const candidates = relevantResults
    .filter((result) => {
      const resultDateKey = toDateInputKey(result.actualAt || result.plannedAt);
      return resultDateKey >= cutoffKey && resultDateKey <= selectedDateKey;
    })
    .map((result) => {
      const matchesEmployee = Boolean(
        selected.employeeId && (result.employeeId === selected.employeeId || result.employee === selected.employee),
      );
      const matchesRoute = Boolean(
        selected.routeId && (result.routeId === selected.routeId || result.route === selected.route),
      );
      return { result, rank: matchesEmployee && matchesRoute ? 0 : matchesEmployee || matchesRoute ? 1 : 2 };
    })
    .filter(({ rank }) => rank < 2)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, recentHistoryLimit)
    .map(({ result }) => result);

  return { mode: "recent" as const, results: candidates };
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateInputKey(value: string) {
  const date = toSortableDate(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return toDateInput(date);
}

function toSortableDate(value: string) {
  const ruMatch = value.match(/(\d{2})\.(\d{2})\.(\d{4})(?:,\s*(\d{2}):(\d{2}))?/);
  if (ruMatch) {
    const [, day, month, year, hour = "00", minute = "00"] = ruMatch;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
  }

  return new Date(value);
}
