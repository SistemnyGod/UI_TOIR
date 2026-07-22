import { ScheduleEditPanel } from "./components/schedule/ScheduleEditPanel";
import { ScheduleGridPanel } from "./components/schedule/ScheduleGridPanel";
import { ScheduleSidePanels } from "./components/schedule/ScheduleSidePanels";
import { ScheduleToolbar } from "./components/schedule/ScheduleToolbar";
import {
  loadAssignmentFavoriteEmployeeIds,
  subscribeAssignmentFavoriteEmployeeIds,
} from "./assignments/assignmentStorage";
import { useSchedulePlanning } from "../../hooks/useSchedulePlanning";
import { useEffect, useMemo, useState } from "react";
import type {
  ActivePatrol,
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
  mode: ScheduleMode;
  onModeChange: (mode: ScheduleMode) => void;
  onNotify: (message: string) => void;
  onCreateScheduledRequest: (payload: CreateServiceRequestPayload) => MaybePromise<ServiceRequest>;
  onOpenRequestById: (requestId: string) => void;
  onRunAssignmentCommand: (assignmentId: string, command: "start" | "cancel" | "complete", payload?: CompleteAssignmentPayload) => MaybePromise<void>;
  patrolResults?: PatrolResult[];
  requests: ServiceRequest[];
  routeDirectory: RouteDirectoryItem[];
  selectedCellId: string;
  onSelectCell: (id: string) => void;
}) {
  const [anchorDate, setAnchorDate] = useState(() => toDateInput(new Date()));
  const [shiftFilter, setShiftFilter] = useState<"all" | "day" | "night">("all");
  const [favoriteEmployeeIds] = useState(() => loadAssignmentFavoriteEmployeeIds());
  const [syncedFavoriteEmployeeIds, setSyncedFavoriteEmployeeIds] = useState(() => loadAssignmentFavoriteEmployeeIds());
  const scheduleEmployees = useMemo(() => {
    const favoriteSet = new Set(syncedFavoriteEmployeeIds);
    return employeeDirectory.filter((employee) => favoriteSet.has(employee.id));
  }, [employeeDirectory, syncedFavoriteEmployeeIds]);
  const {
    errorMessage,
    exceptionCount,
    plannedCount,
    refreshScheduleReferences,
    scheduleCells,
    selected,
    status,
    weekDays,
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
  });

  useEffect(() => {
    setSyncedFavoriteEmployeeIds(favoriteEmployeeIds);
    return subscribeAssignmentFavoriteEmployeeIds(setSyncedFavoriteEmployeeIds);
  }, [favoriteEmployeeIds]);
  const selectedResultHistory = useMemo(
    () => selectScheduleResultHistory(patrolResults, selected),
    [patrolResults, selected],
  );

  return (
    <div className="screen-stack">
      <ScheduleToolbar
        canManage={canManage}
        mode={mode}
        anchorDate={anchorDate}
        shiftFilter={shiftFilter}
        plannedCount={plannedCount}
        exceptionCount={exceptionCount}
        onAnchorDateChange={setAnchorDate}
        onModeChange={onModeChange}
        onNotify={onNotify}
        onShiftFilterChange={setShiftFilter}
      />

      <div className="two-column wide-left">
        <ScheduleGridPanel
          mode={mode}
          scheduleCells={scheduleCells}
          status={status}
          errorMessage={errorMessage}
          weekDays={weekDays}
          selectedCellId={selectedCellId}
          onSelectCell={onSelectCell}
          onNotify={onNotify}
          onRetry={refreshScheduleReferences}
        />

        <ScheduleSidePanels
          exceptionCount={exceptionCount}
          onShowExceptions={() => onModeChange("exceptions")}
          onNotify={onNotify}
        />
      </div>

      {selected ? (
        <div
          className="schedule-plan-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onSelectCell("");
            }
          }}
          role="presentation"
        >
          <ScheduleEditPanel
            canManage={canManage}
            employees={scheduleEmployees}
            resultHistory={selectedResultHistory.results}
            resultHistoryMode={selectedResultHistory.mode}
            routes={routeDirectory}
            selected={selected}
            onClose={() => onSelectCell("")}
            onCreateScheduledRequest={onCreateScheduledRequest}
            onNotify={onNotify}
            onOpenRequestById={onOpenRequestById}
            onRunAssignmentCommand={onRunAssignmentCommand}
          />
        </div>
      ) : null}
    </div>
  );
}

const recentHistoryDays = 90;
const recentHistoryLimit = 10;

export function selectScheduleResultHistory(results: PatrolResult[], selected?: ScheduleCell) {
  if (!selected) return { mode: "day" as const, results: [] };
  const selectedDateKey = toDateInputKey(selected.date);
  const sortedResults = [...results].sort(
    (first, second) =>
      toSortableDate(second.actualAt || second.plannedAt).getTime() -
      toSortableDate(first.actualAt || first.plannedAt).getTime(),
  );
  const dayResults = sortedResults.filter(
    (result) => toDateInputKey(result.actualAt || result.plannedAt) === selectedDateKey,
  );
  if (dayResults.length > 0) return { mode: "day" as const, results: dayResults };

  const cutoff = toSortableDate(selected.date);
  cutoff.setDate(cutoff.getDate() - recentHistoryDays);
  const cutoffKey = toDateInput(cutoff);
  const candidates = sortedResults
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
