import { PlanningSummaryCards } from "./components/schedule/PlanningSummaryCards";
import { ScheduleEditPanel } from "./components/schedule/ScheduleEditPanel";
import { ScheduleGridPanel } from "./components/schedule/ScheduleGridPanel";
import { ScheduleSidePanels } from "./components/schedule/ScheduleSidePanels";
import { ScheduleToolbar } from "./components/schedule/ScheduleToolbar";
import { useSchedulePlanning } from "../../hooks/useSchedulePlanning";
import { useState } from "react";
import type {
  ActivePatrol,
  CompleteAssignmentPayload,
  CreateServiceRequestPayload,
  EmployeeDirectoryItem,
  RouteDirectoryItem,
  ScheduleMode,
  ServiceRequest,
} from "../../types";

type MaybePromise<T> = T | Promise<T>;

export function ScheduleScreen({
  activePatrols,
  canManage = true,
  employeeDirectory,
  mode,
  onModeChange,
  onNotify,
  onCreateScheduledRequest,
  onOpenRequestById,
  onRunAssignmentCommand,
  requests,
  routeDirectory,
  selectedCellId,
  onSelectCell,
}: {
  activePatrols: ActivePatrol[];
  canManage?: boolean;
  employeeDirectory: EmployeeDirectoryItem[];
  mode: ScheduleMode;
  onModeChange: (mode: ScheduleMode) => void;
  onNotify: (message: string) => void;
  onCreateScheduledRequest: (payload: CreateServiceRequestPayload) => MaybePromise<ServiceRequest>;
  onOpenRequestById: (requestId: string) => void;
  onRunAssignmentCommand: (assignmentId: string, command: "start" | "cancel" | "complete", payload?: CompleteAssignmentPayload) => MaybePromise<void>;
  requests: ServiceRequest[];
  routeDirectory: RouteDirectoryItem[];
  selectedCellId: string;
  onSelectCell: (id: string) => void;
}) {
  const [anchorDate, setAnchorDate] = useState(() => toDateInput(new Date()));
  const [shiftFilter, setShiftFilter] = useState<"all" | "day" | "night">("all");
  const {
    coveragePercent,
    dayCount,
    errorMessage,
    exceptionCount,
    nightCount,
    plannedCount,
    refreshScheduleReferences,
    scheduleCells,
    selected,
    status,
    weekDays,
  } = useSchedulePlanning({
    activePatrols,
    anchorDate,
    employeeDirectory,
    mode,
    requests,
    routeDirectory,
    selectedCellId,
    shiftFilter,
  });

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

      <PlanningSummaryCards
        coveragePercent={coveragePercent}
        dayCount={dayCount}
        plannedCount={plannedCount}
        exceptionCount={exceptionCount}
        nightCount={nightCount}
        onModeChange={onModeChange}
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

        <ScheduleEditPanel
          canManage={canManage}
          employees={employeeDirectory}
          routes={routeDirectory}
          selected={selected}
          onCreateScheduledRequest={onCreateScheduledRequest}
          onNotify={onNotify}
          onOpenRequestById={onOpenRequestById}
          onRunAssignmentCommand={onRunAssignmentCommand}
        />
      </div>
    </div>
  );
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
