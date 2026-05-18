import { ActiveAssignmentsPanel } from "../components/assignments/ActiveAssignmentsPanel";
import { AssignableEmployeesPanel } from "../components/assignments/AssignableEmployeesPanel";
import { AssignableRoutesPanel } from "../components/assignments/AssignableRoutesPanel";
import { AssignmentDraftDrawer } from "../components/assignments/AssignmentDraftDrawer";
import { AssignmentToolbar } from "../components/assignments/AssignmentToolbar";
import { activePatrolsFallback } from "../repositories/activePatrolsRepository";
import { assignableEmployeesFallback, assignableRoutesFallback } from "../repositories/assignmentsRepository";
import type { ScreenId } from "../types";

export function AssignmentScreen({
  selectedEmployeeId,
  selectedRouteId,
  onNavigate,
  onNotify,
  onSelectEmployee,
  onSelectRoute,
  onAssign,
}: {
  selectedEmployeeId: string;
  selectedRouteId: string;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onSelectEmployee: (id: string) => void;
  onSelectRoute: (id: string) => void;
  onAssign: () => void;
}) {
  const activePatrols = activePatrolsFallback;
  const assignableRoutes = assignableRoutesFallback;
  const employees = assignableEmployeesFallback;
  const employee = employees.find((item) => item.id === selectedEmployeeId);
  const route = assignableRoutes.find((item) => item.id === selectedRouteId);
  const hasConflict = Boolean(
    route && employee && (route.loadedEmployees < route.requiredEmployees || employee.status === "В обходе"),
  );

  return (
    <div className="assign-screen">
      <AssignmentToolbar />

      <div className="assign-layout">
        <AssignableEmployeesPanel
          employees={employees}
          onNavigate={onNavigate}
          onSelectEmployee={onSelectEmployee}
          selectedEmployeeId={selectedEmployeeId}
        />
        <AssignableRoutesPanel
          onNavigate={onNavigate}
          onSelectRoute={onSelectRoute}
          routes={assignableRoutes}
          selectedRouteId={selectedRouteId}
        />
        <ActiveAssignmentsPanel activePatrols={activePatrols} onNotify={onNotify} />
        <AssignmentDraftDrawer
          employee={employee}
          hasConflict={hasConflict}
          onAssign={onAssign}
          onNavigate={onNavigate}
          onNotify={onNotify}
          route={route}
        />
      </div>
    </div>
  );
}
