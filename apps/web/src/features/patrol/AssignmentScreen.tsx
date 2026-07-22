import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { buildNotificationText } from "./components/requests/requestModalUtils";
import { AssignmentStatusBadge as StatusPill } from "./assignments/AssignmentStatusBadge";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  ListChecks,
  MapPin,
  Plus,
  Route,
  Search,
  Send,
  SlidersHorizontal,
  UserPlus,
  Wifi,
} from "./assignments/AssignmentIcons";
import type { AssignmentIconComponent } from "./assignments/AssignmentIcons";
import {
  assignmentStatusText,
  isAssignableRequest,
  isAssignmentCurrent,
  isRequestCurrent,
  priorityText,
  shouldCreateAssignmentAfterRequest,
} from "./assignments/assignmentUtils";
import {
  addMonths,
  buildCalendarDays,
  createAssignmentHistoryEvents,
  formatShiftRange,
  formatAssignmentActionTime,
  formatDate,
  formatMonthLabel,
  formatPeriodLabel,
  getCalendarDayClass,
  normalizeDateRange,
  parseDateKey,
  parseRequestScheduledAt,
  shiftStartTime,
  shiftText,
  shiftTime,
  startOfMonth,
  toDateInput,
  toDateTimeInput,
} from "./assignments/assignmentDateUtils";
import {
  defaultAssignmentShiftSettings,
  hasStoredAssignmentFavoriteEmployeeIds,
  loadAssignmentFavoriteEmployeeIds,
  loadAssignmentShiftSettings,
  normalizeShiftSettings,
  saveAssignmentFavoriteEmployeeIds,
  saveAssignmentShiftSettings,
  subscribeAssignmentFavoriteEmployeeIds,
} from "./assignments/assignmentStorage";
import type { ShiftTimeSettings } from "./assignments/assignmentTypes";
import { useAssignmentsWorkspace } from "../../hooks/useAssignmentsWorkspace";
import {
  mapEmployeeToAssignable,
  mapRouteToAssignable,
} from "../../repositories/assignmentsRepository";
import type {
  ActivePatrol,
  CompleteAssignmentPayload,
  CreateServiceRequestPayload,
  DataSourceMode,
  DataSourceStatus,
  Employee,
  EmployeeDirectoryItem,
  PatrolCompletionPhotoPayload,
  RoutePoint,
  RouteOption,
  RouteDirectoryItem,
  ScreenId,
  ServiceRequest,
} from "../../types";

interface AssignmentScreenProps {
  activePatrols: ActivePatrol[];
  assignmentCreateIntent: number;
  canManage?: boolean;
  dataSourceMode: DataSourceMode;
  employeeDirectory: EmployeeDirectoryItem[];
  refreshPatrolData: () => Promise<void>;
  requestListErrorMessage?: string;
  requestListStatus: DataSourceStatus;
  requests: ServiceRequest[];
  routeDirectory: RouteDirectoryItem[];
  selectedEmployeeId: string;
  selectedRouteId: string;
  onOpenRequestById: (requestId: string) => void;
  onRefreshRequests: () => Promise<void> | void;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onCreatePatrolRequest: (payload: CreateServiceRequestPayload) => Promise<ServiceRequest> | ServiceRequest;
  onSelectEmployee: (id: string) => void;
  onSelectRoute: (id: string) => void;
}

interface LocalDraft {
  id: string;
  title: string;
  employeeId: string;
  employeeName: string;
  routeId: string;
  routeName: string;
  plannedDate: string;
  plannedStart: string;
  priority: "high" | "medium" | "low";
  comment: string;
  requestId?: string;
  changedAt: string;
}

const ASSIGNMENT_DRAFTS_STORAGE_KEY = "patrol360.assignment-drafts.v1";
const HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface PointCompletionDraft {
  routePointId: string;
  status: string;
  comment: string;
  issueType: string;
  severity: string;
  photos: number;
  photoAttachments: PatrolCompletionPhotoPayload[];
}

interface RequestPanelProps {
  canManage: boolean;
  comment: string;
  employee?: Employee;
  fieldErrors: Record<string, string[]>;
  favoriteEmployees: Employee[];
  hasConflict: boolean;
  isCreating: boolean;
  notificationText: string;
  onAssign: () => void | Promise<void>;
  onCommentChange: (value: string) => void;
  onPlannedDateChange: (value: string) => void;
  onPlannedStartChange: (value: string) => void;
  onPriorityChange: (value: "high" | "medium" | "low") => void;
  onSaveDraft: () => void;
  onSelectEmployee: (id: string) => void;
  onSelectRequest: (id: string) => void;
  plannedDate: string;
  plannedStart: string;
  priority: "high" | "medium" | "low";
  requestListStatus: DataSourceStatus;
  requests: ServiceRequest[];
  route?: RouteOption;
  selectedRequestId: string;
  shiftSettings: ShiftTimeSettings;
}

export function AssignmentScreen({
  activePatrols,
  assignmentCreateIntent,
  canManage = true,
  dataSourceMode,
  employeeDirectory,
  refreshPatrolData,
  requestListErrorMessage,
  requestListStatus,
  requests,
  routeDirectory,
  selectedEmployeeId,
  selectedRouteId,
  onOpenRequestById,
  onRefreshRequests,
  onNavigate,
  onNotify,
  onCreatePatrolRequest,
  onSelectEmployee,
  onSelectRoute,
}: AssignmentScreenProps) {
  const assignments = useAssignmentsWorkspace({
    dataSourceMode,
    refreshPatrolData,
    showToast: onNotify,
  });
  const defaultPeriodDate = toDateInput(new Date());
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [plannedDate, setPlannedDate] = useState(defaultPeriodDate);
  const [plannedStart, setPlannedStart] = useState("08:00");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("high");
  const [comment, setComment] = useState("");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<LocalDraft[]>(loadAssignmentDrafts);
  const [isCreatingRequest, setIsCreatingRequest] = useState(false);
  const [completionTarget, setCompletionTarget] = useState<ActivePatrol | null>(null);
  const [completionErrors, setCompletionErrors] = useState<Record<string, string>>({});
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [favoriteEmployeeIds, setFavoriteEmployeeIds] = useState<string[]>(() => loadAssignmentFavoriteEmployeeIds());
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [shiftSettings, setShiftSettings] = useState<ShiftTimeSettings>(() => loadAssignmentShiftSettings());
  const [shiftSettingsOpen, setShiftSettingsOpen] = useState(false);
  const [serverSettingsApplied, setServerSettingsApplied] = useState(false);

  const employees = useMemo(
    () => {
      const directoryEmployees = employeeDirectory.filter(isAssignableDirectoryEmployee).map(mapEmployeeToAssignable);
      const referenceEmployees = assignments.assignableEmployees.filter((employee) => employee.status !== "\u041d\u0435\u0442 \u0441\u0432\u044f\u0437\u0438");

      if (dataSourceMode === "api") {
        if (referenceEmployees.length > 0) return referenceEmployees;
        return directoryEmployees;
      }

      if (directoryEmployees.length > 0) return directoryEmployees;
      return assignments.assignableEmployeesFallback;
    },
    [assignments.assignableEmployees, assignments.assignableEmployeesFallback, dataSourceMode, employeeDirectory],
  );
  const favoriteEmployeeSet = useMemo(() => new Set(favoriteEmployeeIds), [favoriteEmployeeIds]);
  const routes = useMemo(
    () => {
      const directoryRoutes = routeDirectory.map(mapRouteToAssignable);
      if (directoryRoutes.length > 0) return directoryRoutes;
      if (assignments.assignableRoutes.length > 0) return assignments.assignableRoutes;
      return dataSourceMode === "api" ? [] : assignments.assignableRoutesFallback;
    },
    [assignments.assignableRoutes, assignments.assignableRoutesFallback, dataSourceMode, routeDirectory],
  );

  const normalizedSearch = search.trim().toLowerCase();
  const favoriteEmployees = employees
    .filter((employee) => favoriteEmployeeSet.has(employee.id))
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));
  const visibleEmployees = favoriteEmployees.filter(
    (employee) =>
      !normalizedSearch ||
      [employee.name, employee.role, employee.zone].join(" ").toLowerCase().includes(normalizedSearch),
  );
  const visibleRoutes = routes;
  const assignableRequests = useMemo(() => requests.filter(isAssignableRequest), [requests]);
  const referencePanelStatus = assignments.referenceStatus === "idle" ? "loading" : assignments.referenceStatus;
  const selectedEmployee = visibleEmployees.find((employee) => employee.id === selectedEmployeeId) ?? visibleEmployees[0];
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? visibleRoutes[0];
  const selectedRequest = assignableRequests.find((request) => request.id === selectedRequestId);
  const notificationText = useMemo(
    () =>
      selectedEmployee && selectedRoute
        ? buildNotificationText({
            employee: selectedEmployee.name,
            route: selectedRoute.name,
            scheduledDate: plannedDate,
            scheduledTime: plannedStart,
          })
        : "",
    [plannedDate, plannedStart, selectedEmployee, selectedRoute],
  );
  const screenAssignments = dataSourceMode === "api" ? assignments.activePatrols ?? [] : assignments.activePatrols ?? activePatrols;
  const activeAssignments = useMemo(() => screenAssignments.filter(isAssignmentCurrent), [screenAssignments]);
  const selectedEmployeeAssignment = useMemo(
    () => (selectedEmployee ? activeAssignments.find((assignment) => assignment.employeeId === selectedEmployee.id) : undefined),
    [activeAssignments, selectedEmployee],
  );
  const hasConflict = Boolean(
    selectedEmployeeAssignment &&
      selectedEmployee &&
      selectedEmployeeAssignment.shift === selectedEmployee.shift &&
      isAssignmentOnDate(selectedEmployeeAssignment, plannedDate),
  );
  const conflicts = useMemo(() => {
    const items: Array<{ id: string; type: "danger" | "warning" | "info"; title: string; description: string; time: string }> = [];

    if (selectedEmployeeAssignment && selectedEmployee) {
      const sameShift = selectedEmployeeAssignment.shift === selectedEmployee.shift && isAssignmentOnDate(selectedEmployeeAssignment, plannedDate);
      items.push({
        id: `employee-${selectedEmployeeAssignment.id}`,
        type: sameShift ? "danger" : "warning",
        title: sameShift ? "\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a \u0443\u0436\u0435 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d" : "\u0423 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0430 \u0435\u0441\u0442\u044c \u043d\u0435\u0437\u0430\u043a\u0440\u044b\u0442\u044b\u0439 \u043e\u0431\u0445\u043e\u0434",
        description: sameShift
          ? `${selectedEmployee.name} \u0443\u0436\u0435 \u0432\u044b\u043f\u043e\u043b\u043d\u044f\u0435\u0442 \u043c\u0430\u0440\u0448\u0440\u0443\u0442 \u00ab${selectedEmployeeAssignment.route}\u00bb \u0432 \u044d\u0442\u0443 \u0441\u043c\u0435\u043d\u0443.`
          : `${selectedEmployee.name} \u0441\u0435\u0439\u0447\u0430\u0441 \u0437\u0430\u043d\u044f\u0442 \u043c\u0430\u0440\u0448\u0440\u0443\u0442\u043e\u043c \u00ab${selectedEmployeeAssignment.route}\u00bb. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0435\u0433\u043e \u0441\u0442\u0430\u0442\u0443\u0441 \u043f\u0435\u0440\u0435\u0434 \u043d\u043e\u0432\u044b\u043c \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435\u043c.`,
        time: selectedEmployeeAssignment.plannedAt ?? "\u0441\u0435\u0439\u0447\u0430\u0441",
      });
    }

    if (requestListStatus === "error") {
      items.push({
        id: "requests",
        type: "warning",
        title: "\u0417\u0430\u044f\u0432\u043a\u0438 API \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b",
        description: requestListErrorMessage || "\u041d\u0435\u043b\u044c\u0437\u044f \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435, \u043f\u043e\u043a\u0430 \u043d\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u043b\u0441\u044f \u0441\u043f\u0438\u0441\u043e\u043a \u0437\u0430\u044f\u0432\u043e\u043a.",
        time: "API",
      });
    }

    if (assignments.referenceStatus === "error") {
      items.push({
        id: "reference",
        type: "warning",
        title: "\u0421\u043f\u0440\u0430\u0432\u043e\u0447\u043d\u0438\u043a\u0438 \u043d\u0435 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u044b",
        description: assignments.referenceErrorMessage || "\u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0441\u043e\u0435\u0434\u0438\u043d\u0435\u043d\u0438\u0435 \u0438 \u043f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0443 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432 \u0438 \u043c\u0430\u0440\u0448\u0440\u0443\u0442\u043e\u0432.",
        time: "API",
      });
    }

    if (assignments.listStatus === "error") {
      items.push({
        id: "assignments",
        type: "warning",
        title: "\u041d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f \u043d\u0435 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u044b",
        description: assignments.errorMessage || "\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u0441\u043f\u0438\u0441\u043e\u043a \u043e\u0431\u0445\u043e\u0434\u043e\u0432 \u043c\u043e\u0436\u0435\u0442 \u0431\u044b\u0442\u044c \u0443\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0438\u043c.",
        time: "API",
      });
    }

    return items;
  }, [assignments.errorMessage, assignments.listStatus, assignments.referenceErrorMessage, assignments.referenceStatus, plannedDate, requestListErrorMessage, requestListStatus, selectedEmployee, selectedEmployeeAssignment]);

  useEffect(() => {
    if (!selectedEmployeeId && visibleEmployees[0]) {
      onSelectEmployee(visibleEmployees[0].id);
    }
  }, [onSelectEmployee, selectedEmployeeId, visibleEmployees]);

  useEffect(() => {
    if (selectedEmployeeId && !visibleEmployees.some((employee) => employee.id === selectedEmployeeId)) {
      onSelectEmployee(visibleEmployees[0]?.id ?? "");
    }
  }, [onSelectEmployee, selectedEmployeeId, visibleEmployees]);

  useEffect(() => {
    if (!selectedRouteId && visibleRoutes[0]) {
      onSelectRoute(visibleRoutes[0].id);
    }
  }, [onSelectRoute, selectedRouteId, visibleRoutes]);

  useEffect(() => {
    if (selectedRequestId && !assignableRequests.some((request) => request.id === selectedRequestId)) {
      setSelectedRequestId("");
    }
  }, [assignableRequests, selectedRequestId]);

  useEffect(() => {
    if (assignmentCreateIntent > 0) {
      setRequestModalOpen(true);
    }
  }, [assignmentCreateIntent]);

  useEffect(() => {
    if (!selectedEmployee) return;
    setPlannedStart(shiftStartTime(selectedEmployee.shift, shiftSettings));
  }, [selectedEmployee?.id, selectedEmployee?.shift, shiftSettings]);

  useEffect(() => {
    return subscribeAssignmentFavoriteEmployeeIds(setFavoriteEmployeeIds);
  }, []);

  useEffect(() => {
    if (dataSourceMode !== "api" || serverSettingsApplied || !assignments.assignmentSettings) {
      return;
    }

    const serverFavoriteIds = assignments.assignmentSettings.favoriteEmployeeIds ?? [];
    const nextFavoriteIds = serverFavoriteIds;
    const nextShiftSettings = normalizeShiftSettings(assignments.assignmentSettings.shiftSettings);

    setFavoriteEmployeeIds(nextFavoriteIds);
    setShiftSettings(nextShiftSettings);
    saveAssignmentFavoriteEmployeeIds(nextFavoriteIds);
    saveAssignmentShiftSettings(nextShiftSettings);
    setServerSettingsApplied(true);

    if (!areStringArraysEqual(serverFavoriteIds, nextFavoriteIds)) {
      void assignments.updateAssignmentSettings({
        favoriteEmployeeIds: nextFavoriteIds,
        shiftSettings: nextShiftSettings,
      });
    }
  }, [assignments, assignments.assignmentSettings, dataSourceMode, favoriteEmployeeIds, serverSettingsApplied]);

  function handleShiftSettingsSave(nextSettings: ShiftTimeSettings) {
    setShiftSettings(nextSettings);
    saveAssignmentShiftSettings(nextSettings);
    void assignments.updateAssignmentSettings({
      favoriteEmployeeIds,
      shiftSettings: nextSettings,
    });
    setShiftSettingsOpen(false);
    onNotify("Настройки смен сохранены для группы назначений.");
  }

  function handleFavoriteEmployeeIdsChange(nextIds: string[]) {
    setFavoriteEmployeeIds(nextIds);
    saveAssignmentFavoriteEmployeeIds(nextIds);
    void assignments.updateAssignmentSettings({
      favoriteEmployeeIds: nextIds,
      shiftSettings,
    });
  }

  async function handleAssign() {
    if (isCreatingRequest || assignments.isCreating) {
      return;
    }

    if (!selectedEmployee || !selectedRoute || !plannedDate || !plannedStart) {
      onNotify("Выберите сотрудника, маршрут и время старта.");
      return;
    }

    if (selectedRequestId && !selectedRequest) {
      setSelectedRequestId("");
      onNotify("Выбранная заявка уже закрыта, отменена или назначена. Выберите другую заявку либо создайте новую.");
      return;
    }

    if (hasConflict) {
      onNotify("У выбранного сотрудника уже есть активное назначение на эту дату и смену.");
      return;
    }

    const plannedAt = new Date(`${plannedDate}T${plannedStart}:00`);
    if (Number.isNaN(plannedAt.getTime())) {
      onNotify("Укажите корректную дату и время старта.");
      return;
    }

    setIsCreatingRequest(true);
    try {
      const request = selectedRequest ?? await onCreatePatrolRequest({
        employeeId: selectedEmployee.id,
        employee: selectedEmployee.name,
        routeId: selectedRoute.id,
        route: selectedRoute.name,
        scheduledDate: plannedDate,
        scheduledTime: plannedStart,
        plannedAt: plannedAt.toISOString(),
        shift: selectedEmployee.shift,
        notifyEmployee: true,
        notificationText,
        description: comment.trim(),
      });

       if (shouldCreateAssignmentAfterRequest({
         dataSourceMode,
         hasSelectedRequest: Boolean(selectedRequest),
         hasLinkedAssignment: Boolean(request.assignmentId),
       })) {
        await assignments.createAssignment({
          patrolRequestId: request.id,
          employeeId: selectedEmployee.id,
          employeeName: selectedEmployee.name,
          routeId: selectedRoute.id,
          routeName: selectedRoute.name,
          plannedAt: plannedAt.toISOString(),
          priority,
          shift: selectedEmployee.shift,
          notifyEmployee: true,
          notificationText,
          comment: comment.trim(),
        });
      } else {
        await assignments.refreshAssignments();
        await refreshPatrolData();
      }
      setComment("");
      setSelectedRequestId("");
      setRequestModalOpen(false);
      await onRefreshRequests();
      onNotify("Заявка создана, уведомление подготовлено");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось создать заявку на обход");
    } finally {
      setIsCreatingRequest(false);
    }
  }

  async function handleCompleteAssignment(payload: CompleteAssignmentPayload) {
    if (!completionTarget) return;

    const errors: Record<string, string> = {};
    if (!payload.actualAt) errors.actualAt = "Укажите фактическое время.";
    if (!payload.status) errors.status = "Выберите статус результата.";
    if (!payload.comment?.trim()) errors.comment = "Заполните комментарий.";
    if (payload.status === "Замечание" && !payload.issueType?.trim()) errors.issueType = "Укажите тип замечания.";
    const pointIssueWithoutType = (payload.pointResults ?? []).some((point) => point.status === "Замечание" && !point.issueType?.trim());
    if (pointIssueWithoutType) errors.issueType = "Укажите тип замечания для точек с замечанием.";

    const completionRoute = routeDirectory.find((route) => route.id === completionTarget.routeId || route.name === completionTarget.route);
    const pointResultsById = new Map((payload.pointResults ?? []).map((point) => [point.routePointId, point]));
    const missingPhotos = getCompletionRoutePoints(completionRoute)
      .filter((point) => point.requiresPhoto && ((pointResultsById.get(point.id)?.photoAttachments?.length ?? 0) <= 0))
      .map((point) => point.name);
    if (missingPhotos.length > 0) {
      errors.photos = `Прикрепите файлы фото для точек: ${missingPhotos.join(", ")}`;
    }

    if (Object.keys(errors).length > 0) {
      setCompletionErrors(errors);
      return;
    }

    const commandResult = await assignments.runCommand(completionTarget.id, "complete", payload);
    if (!commandResult.succeeded) {
      setCompletionErrors(flattenServerFieldErrors(commandResult.errors));
      return;
    }

    setCompletionTarget(null);
    setCompletionErrors({});
  }

  async function handleCancelAssignment(assignmentId: string) {
    const target = screenAssignments.find((assignment) => assignment.id === assignmentId);
    const routeName = target?.route || "выбранный маршрут";
    const employeeName = target?.employee || "сотрудника";
    const confirmed = window.confirm(`Отменить маршрут "${routeName}" для ${employeeName}? Сотруднику будет отправлено уведомление об отмене.`);
    if (!confirmed) return;

    await assignments.runCommand(assignmentId, "cancel");
    await onRefreshRequests();
  }

  function saveDraft() {
    if (!selectedEmployee || !selectedRoute) {
      onNotify("Выберите сотрудника и маршрут перед сохранением черновика.");
      return;
    }

    setDrafts((current) => [
      {
        id: createLocalDraftId(),
        title: selectedRequest?.title || "Новая заявка на обход",
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name,
        routeId: selectedRoute.id,
        routeName: selectedRoute.name,
        plannedDate,
        plannedStart,
        priority,
        comment,
        requestId: selectedRequest?.id,
        changedAt: new Intl.DateTimeFormat("ru-RU", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit" }).format(new Date()),
      },
      ...current.slice(0, 3),
    ]);
    onNotify("Черновик назначения сохранен локально.");
  }

  function openDraft(draft: LocalDraft) {
    onSelectEmployee(draft.employeeId);
    onSelectRoute(draft.routeId);
    setPlannedDate(draft.plannedDate);
    setPlannedStart(draft.plannedStart);
    setPriority(draft.priority);
    setComment(draft.comment);
    setSelectedRequestId(draft.requestId ?? "");
    setRequestModalOpen(true);
  }

  function deleteDraft(draftId: string) {
    setDrafts((current) => current.filter((draft) => draft.id !== draftId));
    onNotify("Черновик удален.");
  }

  useEffect(() => {
    localStorage.setItem(ASSIGNMENT_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  }, [drafts]);

  return (
    <div className="assign-am-screen">
      <section className="assign-am-filters assign-am-search-only">
        <label className="assign-am-search">
          <input
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Поиск сотрудника по ФИО, должности или подразделению..."
            value={search}
          />
          <Search size={19} />
        </label>
      </section>

      {requestListStatus === "error" ? (
        <div className="notice danger-soft">
          <strong>Заявки не загружены</strong>
          <span>{requestListErrorMessage || "Создание назначения заблокировано, потому что patrolRequestId обязателен."}</span>
        </div>
      ) : null}

      <section className="assign-am-workspace">
        <EmployeesPanel
          employees={visibleEmployees}
          errorMessage={assignments.referenceErrorMessage}
          onOpenPicker={() => setEmployeePickerOpen(true)}
          onNavigate={onNavigate}
          onOpenShiftSettings={() => setShiftSettingsOpen(true)}
          onRetry={assignments.refreshReferenceData}
          onSelectEmployee={onSelectEmployee}
          selectedEmployeeId={selectedEmployee?.id}
          shiftSettings={shiftSettings}
          status={employees.length === 0 ? referencePanelStatus : "ready"}
          totalEmployees={employees.length}
        />
        <RoutesPanel
          errorMessage={assignments.referenceErrorMessage}
          onNavigate={onNavigate}
          onRetry={assignments.refreshReferenceData}
          onSelectRoute={onSelectRoute}
          routes={visibleRoutes}
          selectedRouteId={selectedRoute?.id}
          status={routes.length === 0 ? referencePanelStatus : "ready"}
        />
        <EmployeeHistoryPanel
          assignments={screenAssignments}
          canManage={canManage}
          employee={selectedEmployee}
          onCancelAssignment={handleCancelAssignment}
          onOpenEmployeePicker={() => setEmployeePickerOpen(true)}
          onOpenRequest={() => setRequestModalOpen(true)}
          onOpenRequestById={onOpenRequestById}
          requests={requests}
          savingAssignmentId={assignments.savingAssignmentId}
        />
      </section>

      <section className="assign-am-bottom">
        <ActiveAssignmentsCard
          assignments={screenAssignments}
          canManage={canManage}
          errorMessage={assignments.errorMessage}
          onRetry={assignments.refreshAssignments}
          onRunCommand={(id, command) => {
            if (command === "complete") {
              const target = screenAssignments.find((assignment) => assignment.id === id);
              if (target) setCompletionTarget(target);
              return;
            }

            if (command === "cancel") {
              return handleCancelAssignment(id);
            }

            return assignments.runCommand(id, command);
          }}
          savingAssignmentId={assignments.savingAssignmentId}
          status={dataSourceMode === "api" ? assignments.listStatus : "ready"}
        />
        {completionTarget ? (
          <CompleteAssignmentModal
            assignment={completionTarget}
            errors={completionErrors}
            onClose={() => {
              setCompletionTarget(null);
              setCompletionErrors({});
            }}
            onSubmit={handleCompleteAssignment}
            route={routeDirectory.find((route) => route.id === completionTarget.routeId || route.name === completionTarget.route)}
            saving={assignments.savingAssignmentId === completionTarget.id}
          />
        ) : null}
        <DraftsCard drafts={drafts} onDelete={deleteDraft} onOpen={openDraft} />
        <ConflictsCard conflicts={conflicts} />
      </section>
      {requestModalOpen ? (
        <RequestModal
          canManage={canManage}
          comment={comment}
          employee={selectedEmployee}
          favoriteEmployees={favoriteEmployees}
          fieldErrors={assignments.fieldErrors}
          hasConflict={hasConflict}
          isCreating={isCreatingRequest || assignments.isCreating}
          notificationText={notificationText}
          onAssign={handleAssign}
          onClose={() => setRequestModalOpen(false)}
          onCommentChange={setComment}
          onPlannedDateChange={setPlannedDate}
          onPlannedStartChange={setPlannedStart}
          onPriorityChange={setPriority}
          onSaveDraft={saveDraft}
          onSelectEmployee={onSelectEmployee}
          onSelectRequest={setSelectedRequestId}
          onSelectRoute={onSelectRoute}
          plannedDate={plannedDate}
          plannedStart={plannedStart}
          priority={priority}
          requestListStatus={requestListStatus}
          requests={assignableRequests}
          route={selectedRoute}
          routes={visibleRoutes}
          selectedRequestId={selectedRequestId}
          selectedRouteId={selectedRoute?.id}
          shiftSettings={shiftSettings}
        />
      ) : null}
      {employeePickerOpen ? (
        <AssignmentEmployeePickerModal
          employees={employees}
          favoriteEmployeeIds={favoriteEmployeeIds}
          onChange={handleFavoriteEmployeeIdsChange}
          onClose={() => setEmployeePickerOpen(false)}
        />
      ) : null}
      {shiftSettingsOpen ? (
        <ShiftSettingsModal
          onClose={() => setShiftSettingsOpen(false)}
          onReset={() => handleShiftSettingsSave(defaultAssignmentShiftSettings)}
          onSave={handleShiftSettingsSave}
          value={shiftSettings}
        />
      ) : null}
    </div>
  );
}

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
        <button className="assign-am-period-button" onClick={onOpen} type="button">
          <strong>{formatPeriodLabel(dateFrom, dateTo)}</strong>
          <em>Выбрать</em>
        </button>
      </span>
      <CalendarDays size={17} />
      {isOpen ? (
        <div className="assign-am-period-popover">
          <div className="date-range-calendar-head">
            <button
              aria-label="Предыдущий месяц"
              className="icon-button"
              onClick={() => setCalendarMonth((current) => addMonths(current, -1))}
              type="button"
            >
              ‹
            </button>
            <strong>{formatMonthLabel(calendarMonth)}</strong>
            <button
              aria-label="Следующий месяц"
              className="icon-button"
              onClick={() => setCalendarMonth((current) => addMonths(current, 1))}
              type="button"
            >
              ›
            </button>
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
            <button className="button ghost" onClick={onClear} type="button">Очистить</button>
            <button className="button primary" onClick={onApply} type="button">Применить</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function isAssignmentOnDate(assignment: ActivePatrol, date: string) {
  if (!date) return false;

  const source = assignment.plannedAtIso ?? assignment.plannedAt;
  if (!source) return false;

  const parsed = new Date(source);
  return !Number.isNaN(parsed.getTime()) && toDateInput(parsed) === date;
}

function isAssignableDirectoryEmployee(employee: EmployeeDirectoryItem) {
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

function EmployeesPanel({
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
    <section className="assign-am-panel">
      <PanelHeader actionLabel="Настроить избранных" count={employees.length} icon={UserPlus} onAction={onOpenPicker} title="Сотрудники" />
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
              <button className={`assign-am-employee ${active ? "active" : ""}`} key={employee.id} onClick={() => onSelectEmployee(employee.id)} type="button">
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
    </section>
  );
}

function AssignmentEmployeePickerModal({
  employees,
  favoriteEmployeeIds,
  onChange,
  onClose,
}: {
  employees: Employee[];
  favoriteEmployeeIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const favoriteSet = useMemo(() => new Set(favoriteEmployeeIds), [favoriteEmployeeIds]);
  const normalizedSearch = search.trim().toLowerCase();
  const visibleEmployees = employees
    .filter((employee) => !normalizedSearch || [employee.name, employee.role, employee.zone].join(" ").toLowerCase().includes(normalizedSearch))
    .slice(0, 80);

  function toggleEmployee(employeeId: string) {
    if (favoriteSet.has(employeeId)) {
      onChange(favoriteEmployeeIds.filter((id) => id !== employeeId));
      return;
    }

    onChange([...favoriteEmployeeIds, employeeId]);
  }

  return createPortal(
    <div className="assign-am-modal-backdrop" onClick={onClose}>
      <section className="assign-am-employee-picker" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header>
          <div>
            <h2>Избранные сотрудники для назначений</h2>
            <p>Избранные сотрудники поднимаются выше в списке назначений. Общий справочник не меняется.</p>
          </div>
          <button className="assign-am-picker-close" onClick={onClose} type="button">×</button>
        </header>
        <div className="assign-am-picker-toolbar">
          <label>
            <span>Поиск сотрудника</span>
            <input autoFocus value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="ФИО, должность, подразделение" />
          </label>
          <strong>{favoriteEmployeeIds.length} добавлено из {employees.length}</strong>
        </div>
        <div className="assign-am-picker-list">
          {visibleEmployees.map((employee) => {
            const selected = favoriteSet.has(employee.id);
            return (
              <button className={`assign-am-picker-employee ${selected ? "selected" : ""}`} key={employee.id} onClick={() => toggleEmployee(employee.id)} type="button">
                <Avatar name={employee.name} />
                <span>
                  <strong>{employee.name}</strong>
                  <small>{employee.role}</small>
                  <em>{employee.zone}</em>
                </span>
                <b>{selected ? "Добавлен" : "Добавить"}</b>
              </button>
            );
          })}
        </div>
        <footer>
          <button className="button ghost" onClick={() => onChange([])} type="button">Очистить список</button>
          <button className="button primary" onClick={onClose} type="button">Готово</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function ShiftSettingsModal({
  onClose,
  onReset,
  onSave,
  value,
}: {
  onClose: () => void;
  onReset: () => void;
  onSave: (settings: ShiftTimeSettings) => void;
  value: ShiftTimeSettings;
}) {
  const [draft, setDraft] = useState<ShiftTimeSettings>(value);

  function update(field: keyof ShiftTimeSettings, nextValue: string) {
    setDraft((current) => ({ ...current, [field]: nextValue }));
  }

  return (
    <div className="assign-am-modal-backdrop" onClick={onClose}>
      <section className="assign-am-shift-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header>
          <div>
            <h2>Настройка смен</h2>
            <p>Время применяется ко всем сотрудникам в списке назначений.</p>
          </div>
          <button className="assign-am-picker-close" onClick={onClose} type="button">×</button>
        </header>
        <div className="assign-am-shift-modal-grid">
          <fieldset>
            <legend>Дневная смена</legend>
            <label>
              <span>Начало</span>
              <input
                onChange={(event) => update("dayStart", event.currentTarget.value)}
                onInput={(event) => update("dayStart", event.currentTarget.value)}
                type="time"
                value={draft.dayStart}
              />
            </label>
            <label>
              <span>Окончание</span>
              <input
                onChange={(event) => update("dayEnd", event.currentTarget.value)}
                onInput={(event) => update("dayEnd", event.currentTarget.value)}
                type="time"
                value={draft.dayEnd}
              />
            </label>
          </fieldset>
          <fieldset>
            <legend>Ночная смена</legend>
            <label>
              <span>Начало</span>
              <input
                onChange={(event) => update("nightStart", event.currentTarget.value)}
                onInput={(event) => update("nightStart", event.currentTarget.value)}
                type="time"
                value={draft.nightStart}
              />
            </label>
            <label>
              <span>Окончание</span>
              <input
                onChange={(event) => update("nightEnd", event.currentTarget.value)}
                onInput={(event) => update("nightEnd", event.currentTarget.value)}
                type="time"
                value={draft.nightEnd}
              />
            </label>
          </fieldset>
        </div>
        <footer>
          <button className="button ghost" onClick={onReset} type="button">По умолчанию</button>
          <span>
            День {formatShiftRange(draft.dayStart, draft.dayEnd)} · Ночь {formatShiftRange(draft.nightStart, draft.nightEnd)}
          </span>
          <button className="button primary" onClick={() => onSave(draft)} type="button">Сохранить</button>
        </footer>
      </section>
    </div>
  );
}

function RoutesPanel({
  errorMessage,
  status,
  routes,
  selectedRouteId,
  onNavigate,
  onRetry,
  onSelectRoute,
}: {
  errorMessage?: string;
  status: DataSourceStatus;
  routes: RouteOption[];
  selectedRouteId?: string;
  onNavigate: (screen: ScreenId) => void;
  onRetry: () => void | Promise<void>;
  onSelectRoute: (id: string) => void;
}) {
  return (
    <section className="assign-am-panel">
      <PanelHeader count={routes.length} icon={Route} title="Доступные маршруты" />
      {routes.length ? (
        <div className="assign-am-list routes">
          {routes.map((route) => {
            const active = selectedRouteId === route.id;
            return (
              <button className={`assign-am-route ${active ? "active" : ""}`} key={route.id} onClick={() => onSelectRoute(route.id)} type="button">
                <div>
                  <strong>{route.name}</strong>
                  <div className="assign-am-tags">
                    <Tag>{route.zone}</Tag>
                    <Tag>{priorityText(route.priority)}</Tag>
                  </div>
                  <div className="assign-am-route-meta">
                    <span><MapPin size={14} />{route.points} точки</span>
                    <span><Clock3 size={14} />{route.duration}</span>
                    <span><ListChecks size={14} />{route.loadedEmployees}/{route.requiredEmployees}</span>
                  </div>
                </div>
                <span className="assign-am-radio" />
              </button>
            );
          })}
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
    </section>
  );
}

function EmployeeHistoryPanel({
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
  const assignmentRequestIds = new Set(activeAssignments.map((assignment) => assignment.patrolRequestId).filter(Boolean));
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
    <section className="assign-am-panel assign-am-history-panel">
      <PanelHeader actionLabel="Создать заявку" count={activeRequestItems.length} icon={Plus} onAction={onOpenRequest} title="История сотрудника" />
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
              actionLabel="Создать заявку"
              description="По выбранному сотруднику пока нет заявок и активных обходов в текущем контуре."
              onAction={onOpenRequest}
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
    </section>
  );
}

function RequestModal({
  onClose,
  onSelectRoute,
  routes,
  selectedRouteId,
  ...requestProps
}: RequestPanelProps & {
  onClose: () => void;
  onSelectRoute: (id: string) => void;
  routes: RouteOption[];
  selectedRouteId?: string;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return createPortal(
    <div className="assign-am-modal-backdrop" onClick={onClose}>
      <section className="assign-am-request-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header>
          <div>
            <h2>Создание заявки на обход</h2>
            <p>Выберите маршрут и заполните параметры назначения в одном окне.</p>
          </div>
          <button aria-label="Закрыть окно создания заявки" className="assign-am-picker-close" onClick={onClose} type="button">×</button>
        </header>
        <div className="assign-am-request-modal-body">
          <section className="assign-am-modal-route-picker">
            <PanelHeader count={routes.length} icon={Route} title="Маршрут" />
            {routes.length ? (
              <div className="assign-am-list routes">
                {routes.map((route) => {
                  const active = selectedRouteId === route.id;
                  return (
                    <button className={`assign-am-route ${active ? "active" : ""}`} key={route.id} onClick={() => onSelectRoute(route.id)} type="button">
                      <div>
                        <strong>{route.name}</strong>
                        <div className="assign-am-tags">
                          <Tag>{route.zone}</Tag>
                          <Tag>{priorityText(route.priority)}</Tag>
                        </div>
                        <div className="assign-am-route-meta">
                          <span><MapPin size={14} />{route.points} точки</span>
                          <span><Clock3 size={14} />{route.duration}</span>
                          <span><ListChecks size={14} />{route.loadedEmployees}/{route.requiredEmployees}</span>
                        </div>
                      </div>
                      <span className="assign-am-radio" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyPanel description="Маршруты появятся после загрузки справочника обхода." title="Маршрутов нет" />
            )}
          </section>
          <RequestPanel {...requestProps} />
        </div>
      </section>
    </div>,
    document.body,
  );
}

function RequestPanel({
  canManage,
  comment,
  employee,
  favoriteEmployees,
  fieldErrors,
  hasConflict,
  isCreating,
  notificationText,
  onAssign,
  onCommentChange,
  onPlannedDateChange,
  onPlannedStartChange,
  onPriorityChange,
  onSaveDraft,
  onSelectEmployee,
  onSelectRequest,
  plannedDate,
  plannedStart,
  priority,
  requestListStatus,
  requests,
  route,
  selectedRequestId,
  shiftSettings,
}: RequestPanelProps) {
  const disabled = !canManage || !employee || !route || requestListStatus === "error" || isCreating;

  return (
    <section className="assign-am-panel request">
      <PanelHeader icon={FileText} title="Заявка на обход территории" />
      <div className="assign-am-selected">
        <SummaryBlock label="Сотрудник">
          {employee ? (
            <>
              <Avatar name={employee.name} />
              <div>
                <strong>{employee.name}</strong>
                <span>{employee.role}</span>
              </div>
              <em>{shiftText(employee.shift)}<br />{shiftTime(employee.shift, shiftSettings)}</em>
            </>
          ) : (
            <span>Выберите сотрудника</span>
          )}
        </SummaryBlock>
        <FavoriteEmployeeQuickPicker
          employees={favoriteEmployees}
          onSelect={onSelectEmployee}
          selectedEmployeeId={employee?.id}
          shiftSettings={shiftSettings}
        />
        <SummaryBlock label="Маршрут">
          {route ? (
            <div>
              <strong>{route.name}</strong>
            </div>
          ) : (
            <span>Выберите маршрут</span>
          )}
        </SummaryBlock>
      </div>

      <label className="assign-am-field wide">
        <span>Основание (необязательно)</span>
        <select onChange={(event) => onSelectRequest(event.currentTarget.value)} value={selectedRequestId}>
          <option value="">Создать новую заявку</option>
          {requests.map((request) => (
            <option key={request.id} value={request.id}>
              {request.title} / {request.route}
            </option>
          ))}
        </select>
        {fieldErrors.patrolRequestId ? <small>{fieldErrors.patrolRequestId[0]}</small> : null}
      </label>

      <div className="assign-am-time-stack">
        <DateTimeField
          dateValue={plannedDate}
          label="Планируемое время начала"
          onDateChange={onPlannedDateChange}
          onTimeChange={onPlannedStartChange}
          timeValue={plannedStart}
        />
      </div>
      {fieldErrors.plannedAt ? <div className="field-error">{fieldErrors.plannedAt[0]}</div> : null}

      <div className="assign-am-date-grid single">
        <label className="assign-am-field">
          <span>Приоритет</span>
          <select onChange={(event) => onPriorityChange(event.currentTarget.value as "high" | "medium" | "low")} value={priority}>
            <option value="high">Высокий</option>
            <option value="medium">Средний</option>
            <option value="low">Низкий</option>
          </select>
        </label>
      </div>

      {notificationText ? (
        <div className="assign-am-notification-preview">
          <strong>Сообщение сотруднику</strong>
          <span>{notificationText}</span>
        </div>
      ) : null}

      <label className="assign-am-field wide">
        <span>Комментарий необязательно</span>
        <textarea
          maxLength={300}
          onChange={(event) => onCommentChange(event.currentTarget.value)}
          placeholder="Укажите особенности обхода, зоны внимания, доп. инструкции..."
          value={comment}
        />
        <small>{comment.length} / 300</small>
      </label>

      {hasConflict ? (
        <div className="assign-am-warning">
          <AlertTriangle size={18} />
          Потенциальный конфликт: сотрудник или маршрут уже загружен в выбранную смену.
        </div>
      ) : null}

      <div className="assign-am-form-actions">
        <button className="button ghost" onClick={onSaveDraft} type="button">Сохранить как черновик</button>
        <button className="button primary" disabled={disabled} onClick={() => void onAssign()} type="button">
          <Send size={17} />
          {isCreating ? "Отправка..." : "Отправить заявку"}
        </button>
      </div>
    </section>
  );
}

function FavoriteEmployeeQuickPicker({
  employees,
  onSelect,
  selectedEmployeeId,
  shiftSettings,
}: {
  employees: Employee[];
  onSelect: (id: string) => void;
  selectedEmployeeId?: string;
  shiftSettings: ShiftTimeSettings;
}) {
  const selectedValue = employees.some((employee) => employee.id === selectedEmployeeId) ? selectedEmployeeId : "";

  return (
    <label className="assign-am-favorite-select">
      <span>
        Сотрудник из избранного
        <small>{employees.length}</small>
      </span>
      <select
        aria-label="Сотрудник из избранного списка для обходов"
        disabled={employees.length === 0}
        onChange={(event) => onSelect(event.currentTarget.value)}
        value={selectedValue}
      >
        <option disabled value="">
          {employees.length === 0 ? "Избранные сотрудники не настроены" : "Выберите сотрудника"}
        </option>
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name} · {shiftText(employee.shift)} · {shiftTime(employee.shift, shiftSettings)}
          </option>
        ))}
      </select>
      <small>Список формируется в разделе «Сотрудники».</small>
    </label>
  );
}

function ActiveAssignmentsCard({
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
  const currentAssignments = assignments.filter(isAssignmentCurrent);
  const waitingCount = currentAssignments.filter((assignment) => assignmentStatusText(assignment.status) === "Ожидает начала").length;
  const inProgressCount = currentAssignments.filter((assignment) => assignmentStatusText(assignment.status) === "Выполняется").length;

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
          <div className="assign-am-table current-routes">
            <div className="head"><span>Сотрудник</span><span>Маршрут</span><span>Начало</span><span>Статус</span><span>Прогресс</span><span>Действия</span></div>
            {currentAssignments.map((assignment) => {
              const statusText = assignmentStatusText(assignment.status);
              const started = statusText === "Выполняется";
              return (
                <div className="row" key={assignment.id}>
                  <strong>{assignment.employee}</strong>
                  <span>{assignment.route}</span>
                  <span>{formatAssignmentActionTime(assignment)}</span>
                  <StatusPill value={assignment.status} />
                  <span className="assign-am-progress"><i style={{ width: `${assignment.progress}%` }} /></span>
                  <div className="actions">
                    <button disabled={!canManage || started || savingAssignmentId === assignment.id} onClick={() => void onRunCommand(assignment.id, "start")} type="button">Начать</button>
                    <button disabled={!canManage || savingAssignmentId === assignment.id} onClick={() => void onRunCommand(assignment.id, "complete")} type="button">Завершить</button>
                    <button className="danger" disabled={!canManage || savingAssignmentId === assignment.id} onClick={() => void onRunCommand(assignment.id, "cancel")} type="button">Отменить</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyPanel description="Назначенные маршруты появятся здесь после отправки заявки сотруднику. Отмененные и завершенные обходы в этот список не попадают." title="Текущих назначенных маршрутов нет" />
      )}
    </section>
  );
}

function CompleteAssignmentModal({
  assignment,
  errors,
  onClose,
  onSubmit,
  route,
  saving,
}: {
  assignment: ActivePatrol;
  errors: Record<string, string>;
  onClose: () => void;
  onSubmit: (payload: CompleteAssignmentPayload) => void | Promise<void>;
  route?: RouteDirectoryItem;
  saving?: boolean;
}) {
  const completionRoutePoints = getCompletionRoutePoints(route);
  const [actualAt, setActualAt] = useState(() => toDateTimeInput(new Date()));
  const [status, setStatus] = useState<CompleteAssignmentPayload["status"]>("Подтверждено");
  const [routePointId, setRoutePointId] = useState(() => completionRoutePoints[0]?.id ?? "");
  const [comment, setComment] = useState("");
  const [issueType, setIssueType] = useState("");
  const [severity, setSeverity] = useState<CompleteAssignmentPayload["severity"]>("Средняя");
  const [photos, setPhotos] = useState(0);
  const [pointResults, setPointResults] = useState<PointCompletionDraft[]>(() =>
    completionRoutePoints.map((point) => ({
      routePointId: point.id,
      status: "Подтверждено",
      comment: "",
      issueType: "",
      severity: "Средняя",
      photos: 0,
      photoAttachments: [],
    })),
  );
  const formError =
    errors.form ||
    errors.result ||
    errors.assignmentId ||
    errors.routeVersion ||
    errors.routeVersionNo ||
    errors.routePointId;

  const submit = async () => {
    const date = new Date(actualAt);
    void onSubmit({
      actualAt: Number.isNaN(date.getTime()) ? undefined : date.toISOString(),
      comment,
      issueType,
      pointResults: pointResults.length ? pointResults.map((point) => ({
        comment: point.comment || comment,
        issueType: point.issueType || (point.status === "Замечание" ? issueType : undefined),
        photoAttachments: point.photoAttachments,
        photos: Math.max(point.photos, point.photoAttachments.length),
        routePointId: point.routePointId,
        severity: point.severity || (point.status === "Замечание" ? severity : "-"),
        status: point.status || status,
      })) : undefined,
      photos,
      routePointId: routePointId || undefined,
      severity,
      status,
    });
  };

  function updatePointResult(routePointId: string, patch: Partial<PointCompletionDraft>) {
    setPointResults((current) => current.map((point) => (point.routePointId === routePointId ? { ...point, ...patch } : point)));
  }

  return (
    <div className="assign-am-modal-backdrop" onClick={onClose}>
      <section className="assign-am-complete-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header>
          <div>
            <h2>Завершить обход</h2>
            <p>{assignment.employee} · {assignment.route}</p>
          </div>
          <button className="button ghost" onClick={onClose} type="button">Закрыть</button>
        </header>
        <div className="assign-am-complete-summary">
          <span>{assignment.status}</span>
          <strong>{assignment.progress}%</strong>
          <small>{formatAssignmentActionTime(assignment)}</small>
        </div>
        {formError ? <p className="field-error assign-am-modal-error">{formError}</p> : null}
        <div className="assign-am-modal-grid">
          <label className="assign-am-field">
            <span>Фактическое время</span>
            <input onChange={(event) => setActualAt(event.currentTarget.value)} type="datetime-local" value={actualAt} />
            {errors.actualAt ? <small className="field-error">{errors.actualAt}</small> : null}
          </label>
          <label className="assign-am-field">
            <span>Статус результата</span>
            <select onChange={(event) => setStatus(event.currentTarget.value as CompleteAssignmentPayload["status"])} value={status}>
              <option value="Подтверждено">Подтверждено</option>
              <option value="Замечание">Замечание</option>
              <option value="Просрочено">Просрочено</option>
              <option value="Не подтверждено">Не подтверждено</option>
            </select>
            {errors.status ? <small className="field-error">{errors.status}</small> : null}
          </label>
          <label className="assign-am-field">
            <span>Точка маршрута</span>
            <select onChange={(event) => setRoutePointId(event.currentTarget.value)} value={routePointId}>
              {completionRoutePoints.map((point) => (
                <option key={point.id} value={point.id}>{point.name}</option>
              ))}
              {completionRoutePoints.length ? null : <option value="">Первая точка маршрута</option>}
            </select>
          </label>
          <label className="assign-am-field">
            <span>Фото</span>
            <input min={0} onChange={(event) => setPhotos(Number(event.currentTarget.value) || 0)} type="number" value={photos} />
          </label>
          <label className="assign-am-field">
            <span>Тип замечания</span>
            <input onChange={(event) => setIssueType(event.currentTarget.value)} placeholder="Например: повреждение, нарушение SLA" value={issueType} />
            {errors.issueType ? <small className="field-error">{errors.issueType}</small> : null}
          </label>
          <label className="assign-am-field">
            <span>Серьезность</span>
            <select onChange={(event) => setSeverity(event.currentTarget.value as CompleteAssignmentPayload["severity"])} value={severity}>
              <option value="-">-</option>
              <option value="Низкая">Низкая</option>
              <option value="Средняя">Средняя</option>
              <option value="Высокая">Высокая</option>
            </select>
          </label>
          <label className="assign-am-field wide">
            <span>Комментарий</span>
            <textarea onChange={(event) => setComment(event.currentTarget.value)} placeholder="Что проверили, что обнаружили, итог обхода" value={comment} />
            {errors.comment ? <small className="field-error">{errors.comment}</small> : null}
          </label>
        </div>
        {pointResults.length ? (
          <section className="assign-am-complete-checklist">
            <header>
              <div>
                <h3>Чек-лист точек маршрута</h3>
                <p>Заполните фото и комментарии по обязательным точкам перед закрытием обхода.</p>
              </div>
              <strong>{pointResults.length} точек</strong>
            </header>
            <div className="assign-am-list routes">
              {pointResults.map((pointResult, index) => {
                const point = completionRoutePoints.find((item) => item.id === pointResult.routePointId);
                return (
                  <div className="assign-am-route" key={pointResult.routePointId}>
                    <div>
                      <strong>{index + 1}. {point?.name ?? pointResult.routePointId}</strong>
                      <div className="assign-am-tags">
                        <Tag>{point?.tag || point?.type || "-"}</Tag>
                        {point?.requiresPhoto ? <Tag>фото обязательно</Tag> : null}
                      </div>
                      <div className="assign-am-point-grid">
                        <label className="assign-am-field">
                          <span>Статус точки</span>
                          <select
                            onChange={(event) => updatePointResult(pointResult.routePointId, { status: event.currentTarget.value })}
                            value={pointResult.status}
                          >
                            <option value="Подтверждено">Подтверждено</option>
                            <option value="Замечание">Замечание</option>
                            <option value="Просрочено">Просрочено</option>
                            <option value="Не подтверждено">Не подтверждено</option>
                          </select>
                        </label>
                        <label className="assign-am-field">
                          <span>Фото</span>
                          <input
                            min={0}
                            onChange={(event) => updatePointResult(pointResult.routePointId, { photos: Number(event.currentTarget.value) || 0 })}
                            type="number"
                            value={Math.max(pointResult.photos, pointResult.photoAttachments.length)}
                          />
                        </label>
                        <label className="assign-am-field">
                          <span>Файлы фото</span>
                          <input
                            accept="image/*"
                            multiple
                            onChange={(event) => {
                              const files = event.currentTarget.files;
                              void readPhotoFiles(files).then((photoAttachments) => {
                                updatePointResult(pointResult.routePointId, {
                                  photoAttachments,
                                  photos: Math.max(pointResult.photos, photoAttachments.length),
                                });
                              });
                            }}
                            type="file"
                          />
                          {pointResult.photoAttachments.length > 0 ? <small>{pointResult.photoAttachments.length} файл(ов)</small> : null}
                        </label>
                        <label className="assign-am-field">
                          <span>Комментарий</span>
                          <input
                            onChange={(event) => updatePointResult(pointResult.routePointId, { comment: event.currentTarget.value })}
                            value={pointResult.comment}
                          />
                        </label>
                        <label className="assign-am-field">
                          <span>Тип замечания</span>
                          <input
                            disabled={pointResult.status !== "Замечание"}
                            onChange={(event) => updatePointResult(pointResult.routePointId, { issueType: event.currentTarget.value })}
                            placeholder="Например: повреждение"
                            value={pointResult.issueType}
                          />
                        </label>
                        <label className="assign-am-field">
                          <span>Серьезность</span>
                          <select
                            disabled={pointResult.status !== "Замечание"}
                            onChange={(event) => updatePointResult(pointResult.routePointId, { severity: event.currentTarget.value })}
                            value={pointResult.severity}
                          >
                            <option value="-">-</option>
                            <option value="Низкая">Низкая</option>
                            <option value="Средняя">Средняя</option>
                            <option value="Высокая">Высокая</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {errors.pointResults ? <small className="field-error">{errors.pointResults}</small> : null}
            {errors.photos ? <small className="field-error">{errors.photos}</small> : null}
          </section>
        ) : null}
        <footer>
          <button className="button ghost" onClick={onClose} type="button">Отмена</button>
          <button className="button primary" disabled={saving} onClick={submit} type="button">
            <CheckCircle2 size={17} />
            {saving ? "Сохранение..." : "Завершить обход"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function DraftsCard({ drafts, onDelete, onOpen }: { drafts: LocalDraft[]; onDelete: (draftId: string) => void; onOpen: (draft: LocalDraft) => void }) {
  return (
    <section className="assign-am-card">
      <PanelHeader count={drafts.length} icon={FileText} title="Черновики" />
      {drafts.length ? (
        <div className="assign-am-drafts">
          {drafts.map((draft) => (
            <div key={draft.id}>
              <button className="assign-am-draft-main" onClick={() => onOpen(draft)} type="button">
                <strong>{draft.title}</strong>
                <span>{draft.employeeName}</span>
                <span>{draft.routeName}</span>
                <small>{draft.changedAt}</small>
              </button>
              <button className="assign-am-draft-delete" onClick={() => onDelete(draft.id)} type="button">Удалить</button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel description="Сохраненные черновики текущей сессии появятся здесь." title="Черновиков нет" />
      )}
    </section>
  );
}

function loadAssignmentDrafts(): LocalDraft[] {
  try {
    const value = localStorage.getItem(ASSIGNMENT_DRAFTS_STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as LocalDraft[];
    return Array.isArray(parsed) ? parsed.filter((draft) => draft?.id && draft.employeeId && draft.routeId).slice(0, 4) : [];
  } catch {
    return [];
  }
}

function createLocalDraftId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function ConflictsCard({ conflicts }: { conflicts: Array<{ id: string; type: "danger" | "warning" | "info"; title: string; description: string; time: string }> }) {
  return (
    <section className="assign-am-card">
      <PanelHeader count={conflicts.length} icon={AlertTriangle} title="Конфликты и уведомления" />
      {conflicts.length ? (
        <div className="assign-am-conflicts">
          {conflicts.map((conflict) => (
            <div key={conflict.id}>
              <span className={conflict.type}><AlertTriangle size={16} /></span>
              <div>
                <strong>{conflict.title}</strong>
                <small>{conflict.description}</small>
              </div>
              <em>{conflict.time}</em>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel description="Предупреждения появятся при пересечении смен, нехватке сотрудников или потере связи." title="Конфликтов нет" />
      )}
    </section>
  );
}

function PanelHeader({
  actionLabel,
  count,
  icon: Icon,
  onAction,
  title,
}: {
  actionLabel?: string;
  count?: number;
  icon: AssignmentIconComponent;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div className="assign-am-panel-head">
      <h2>{title}{typeof count === "number" ? <span>{count}</span> : null}</h2>
      {onAction ? (
        <button className="assign-am-panel-action" onClick={onAction} title={actionLabel} type="button">
          <Icon size={19} />
        </button>
      ) : (
        <Icon size={19} />
      )}
    </div>
  );
}

function EmptyPanel({ actionLabel, description, onAction, title }: { actionLabel?: string; description: string; onAction?: () => void | Promise<void>; title: string }) {
  return (
    <div className="assign-am-empty">
      <strong>{title}</strong>
      <span>{description}</span>
      {actionLabel ? <button className="button ghost" onClick={() => void onAction?.()} type="button">{actionLabel}</button> : null}
    </div>
  );
}

function SummaryBlock({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="assign-am-summary-block">
      <small>{label}</small>
      <div>{children}</div>
    </div>
  );
}

function InputField({ label, onChange, type, value }: { label: string; onChange: (value: string) => void; type: string; value: string }) {
  return (
    <label className="assign-am-field">
      <span>{label}</span>
      <input onChange={(event) => onChange(event.currentTarget.value)} type={type} value={value} />
    </label>
  );
}

function DateTimeField({
  dateValue,
  label,
  onDateChange,
  onTimeChange,
  timeValue,
}: {
  dateValue: string;
  label: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  timeValue: string;
}) {
  return (
    <label className="assign-am-time-row">
      <span>{label}</span>
      <input aria-label={`${label}: дата`} onChange={(event) => onDateChange(event.currentTarget.value)} type="date" value={dateValue} />
      <input aria-label={`${label}: время`} onChange={(event) => onTimeChange(event.currentTarget.value)} type="time" value={timeValue} />
    </label>
  );
}

function Avatar({ name }: { name: string }) {
  return <span className="assign-am-avatar">{getInitials(name)}</span>;
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="assign-am-tag">{children}</span>;
}

function getCompletionRoutePoints(route?: RouteDirectoryItem): RoutePoint[] {
  return (route?.points ?? []).filter((point) => {
    const status = String(point.status);
    return status !== "Черновик" && status !== "Draft";
  });
}

function flattenServerFieldErrors(errors?: Record<string, string[]>): Record<string, string> {
  if (!errors) return {};

  return Object.fromEntries(
    Object.entries(errors)
      .map(([field, messages]) => [field, messages.find(Boolean) ?? "Validation error"] as const)
      .filter(([, message]) => message.length > 0),
  );
}

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "С";
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

async function readPhotoFiles(files: FileList | null): Promise<PatrolCompletionPhotoPayload[]> {
  if (!files?.length) return [];

  const selectedFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
  return Promise.all(
    selectedFiles.map(
      (file) =>
        new Promise<PatrolCompletionPhotoPayload>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать файл фото."));
          reader.onload = () => {
            const value = typeof reader.result === "string" ? reader.result : "";
            resolve({
              contentType: file.type || "application/octet-stream",
              dataBase64: value.includes(",") ? value.slice(value.indexOf(",") + 1) : value,
              fileName: file.name,
            });
          };
          reader.readAsDataURL(file);
        }),
    ),
  );
}

export { shouldCreateAssignmentAfterRequest };
