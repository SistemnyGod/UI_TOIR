import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
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
  MoreVertical,
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
  resolveSelectedAssignmentEmployee,
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
  loadAssignmentFavoriteEmployeeIds,
  loadAssignmentShiftSettings,
  normalizeShiftSettings,
  saveAssignmentFavoriteEmployeeIds,
  saveAssignmentShiftSettings,
  subscribeAssignmentFavoriteEmployeeIds,
} from "./assignments/assignmentStorage";
import type { ShiftTimeSettings } from "./assignments/assignmentTypes";
import { AssignmentSelectionBar } from "./assignments/AssignmentSelectionBar";
import { subscribeAssignmentAutoRefresh } from "./assignments/assignmentAutoRefresh";
import "./assignments/assignmentWorkspace.css";
import { useAssignmentsWorkspace } from "../../hooks/useAssignmentsWorkspace";
import { Button, CompactTable, FilterBar, IconButton, ModalShell, Panel, type CompactTableColumn } from "../../shared/ui";
import {
  mapEmployeeToAssignable,
  mapRouteToAssignable,
} from "../../repositories/assignmentsRepository";
import type {
  ActivePatrol,
  CancelAssignmentPayload,
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
  onRefreshRequests: (options?: { signal?: AbortSignal; silent?: boolean }) => Promise<void> | void;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onCreatePatrolRequest: (payload: CreateServiceRequestPayload) => Promise<ServiceRequest> | ServiceRequest;
  onSelectEmployee: (id: string) => void;
  onSelectRoute: (id: string) => void;
}

import { LocalDraft, ASSIGNMENT_DRAFTS_STORAGE_KEY, PointCompletionDraft, CompleteAssignmentModal, CancelAssignmentModal, DraftsCard, mergeAssignmentSources, loadAssignmentDrafts, createLocalDraftId, ConflictsCard, PanelHeader, EmptyPanel, SummaryBlock, DateTimeField, Avatar, Tag, getCompletionRoutePoints, flattenServerFieldErrors, getInitials, areStringArraysEqual } from "./assignmentOverlays";
const HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
  const [cancelTarget, setCancelTarget] = useState<ActivePatrol | null>(null);
  const [cancelErrors, setCancelErrors] = useState<Record<string, string>>({});
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [favoriteEmployeeIds, setFavoriteEmployeeIds] = useState<string[]>(() => loadAssignmentFavoriteEmployeeIds());
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [shiftSettings, setShiftSettings] = useState<ShiftTimeSettings>(() => loadAssignmentShiftSettings());
  const [shiftSettingsOpen, setShiftSettingsOpen] = useState(false);
  const [serverSettingsApplied, setServerSettingsApplied] = useState(false);
  const assignmentCreateInProgressRef = useRef(false);

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
  const selectedEmployee = resolveSelectedAssignmentEmployee(employees, visibleEmployees, selectedEmployeeId);
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
  const screenAssignments = dataSourceMode === "api"
    ? mergeAssignmentSources(assignments.activePatrols ?? [], activePatrols)
    : assignments.activePatrols ?? activePatrols;
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
    if (selectedEmployeeId && !employees.some((employee) => employee.id === selectedEmployeeId)) {
      onSelectEmployee(visibleEmployees[0]?.id ?? employees[0]?.id ?? "");
    }
  }, [employees, onSelectEmployee, selectedEmployeeId, visibleEmployees]);

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

  const backgroundRefreshRef = useRef({
    refreshAssignments: assignments.refreshAssignments,
    refreshPatrolData,
    refreshRequests: onRefreshRequests,
  });
  backgroundRefreshRef.current = {
    refreshAssignments: assignments.refreshAssignments,
    refreshPatrolData,
    refreshRequests: onRefreshRequests,
  };

  useEffect(() => {
    if (dataSourceMode !== "api") return;

    return subscribeAssignmentAutoRefresh(async () => {
      const refreshers = backgroundRefreshRef.current;
      await Promise.allSettled([
        refreshers.refreshAssignments({ silent: true }),
        refreshers.refreshPatrolData(),
        Promise.resolve(refreshers.refreshRequests({ silent: true })),
      ]);
    });
  }, [dataSourceMode]);

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
    if (assignmentCreateInProgressRef.current || isCreatingRequest || assignments.isCreating) {
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

    assignmentCreateInProgressRef.current = true;
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
      assignmentCreateInProgressRef.current = false;
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

  function handleCancelAssignment(assignmentId: string) {
    const target = screenAssignments.find((assignment) => assignment.id === assignmentId);
    if (!target) return;
    setCancelErrors({});
    setCancelTarget(target);
    return;
  }

  async function handleConfirmCancel(payload: CancelAssignmentPayload) {
    if (!cancelTarget) return;

    const commandResult = await assignments.runCommand(cancelTarget.id, "cancel", undefined, payload);
    if (!commandResult.succeeded) {
      setCancelErrors(flattenServerFieldErrors(commandResult.errors));
      return;
    }

    setCancelTarget(null);
    setCancelErrors({});
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
      <FilterBar ariaLabel="Фильтры назначения обхода" className="assign-am-filters assign-am-search-only">
        <label className="assign-am-search">
          <input
            onChange={(event) => setSearch(event.currentTarget.value)}
            aria-label="Поиск сотрудника для назначения обхода"
            placeholder="Поиск сотрудника по ФИО, должности или подразделению..."
            value={search}
          />
          <Search size={19} />
        </label>
      </FilterBar>

      <AssignmentSelectionBar
        canCreate={canManage && requestListStatus !== "error"}
        employeeName={selectedEmployee?.name}
        employeeRole={selectedEmployee?.role}
        hasConflict={hasConflict}
        isCreating={isCreatingRequest || assignments.isCreating}
        onCreate={() => setRequestModalOpen(true)}
        plannedDate={plannedDate}
        plannedStart={plannedStart}
        routeName={selectedRoute?.name}
      />

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
        {cancelTarget ? (
          <CancelAssignmentModal
            assignment={cancelTarget}
            errors={cancelErrors}
            onClose={() => {
              setCancelTarget(null);
              setCancelErrors({});
            }}
            onSubmit={handleConfirmCancel}
            saving={assignments.savingAssignmentId === cancelTarget.id}
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
    <Panel className="assign-am-panel">
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
    </Panel>
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
    <ModalShell
      className="assign-am-employee-picker"
      onClose={onClose}
      subtitle="Избранные сотрудники поднимаются выше в списке назначений. Общий справочник не меняется."
      title="Избранные сотрудники для назначений"
    >
        <div className="assign-am-picker-toolbar">
          <label>
            <span>Поиск сотрудника</span>
            <input aria-label="Поиск сотрудников в избранном" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="ФИО, должность, подразделение" />
          </label>
          <strong aria-live="polite">Показано {visibleEmployees.length} из {employees.length} · добавлено {favoriteEmployeeIds.length}</strong>
        </div>
        <div className="assign-am-picker-list">
          {visibleEmployees.length ? visibleEmployees.map((employee) => {
              const selected = favoriteSet.has(employee.id);
              return (
                <button
                  aria-label={`${employee.name}. ${employee.role}. ${employee.zone}. ${selected ? "Добавлен" : "Добавить"}`}
                  aria-pressed={selected}
                  className={`assign-am-picker-employee ${selected ? "selected" : ""}`}
                  key={employee.id}
                  onClick={() => toggleEmployee(employee.id)}
                  type="button"
                >
                  <Avatar name={employee.name} />
                  <span>
                    <strong title={employee.name}>{employee.name}</strong>
                    <small title={employee.role}>{employee.role}</small>
                    <em title={employee.zone}>{employee.zone}</em>
                  </span>
                  <b>{selected ? "Добавлен" : "Добавить"}</b>
                </button>
              );
            }) : (
              <div className="assign-am-picker-empty" role="status">
                <strong>{employees.length === 0 ? "Сотрудников нет" : "Сотрудники не найдены"}</strong>
                <span>{employees.length === 0 ? "Справочник сотрудников пока пуст." : "Измените поисковый запрос, чтобы увидеть сотрудников."}</span>
                {normalizedSearch ? <Button onClick={() => setSearch("")} variant="ghost">Очистить поиск</Button> : null}
              </div>
            )}
        </div>
        <footer>
          <Button onClick={() => onChange([])} variant="ghost">Очистить список</Button>
          <Button onClick={onClose} variant="primary">Готово</Button>
        </footer>
    </ModalShell>,
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
    <ModalShell
      className="assign-am-shift-modal"
      onClose={onClose}
      subtitle="Время применяется ко всем сотрудникам в списке назначений."
      title="Настройка смен"
    >
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
          <Button onClick={onReset} variant="ghost">По умолчанию</Button>
          <span>
            День {formatShiftRange(draft.dayStart, draft.dayEnd)} · Ночь {formatShiftRange(draft.nightStart, draft.nightEnd)}
          </span>
          <Button onClick={() => onSave(draft)} variant="primary">Сохранить</Button>
        </footer>
    </ModalShell>
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
    <Panel className="assign-am-panel">
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
    </Panel>
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
    </Panel>
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
  return createPortal(
    <ModalShell
      className="assign-am-request-modal"
      onClose={onClose}
      subtitle="Выберите маршрут и заполните параметры назначения в одном окне."
      title="Создание заявки на обход"
    >
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
    </ModalShell>,
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
        <Button onClick={onSaveDraft} variant="ghost">Сохранить как черновик</Button>
        <Button disabled={disabled} onClick={() => void onAssign()} variant="primary">
          <Send size={17} />
          {isCreating ? "Отправка..." : "Отправить заявку"}
        </Button>
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
    const handleViewportChange = () => setOpenActionMenu(null);

    actionMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleViewportChange);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleViewportChange);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [openActionMenu]);

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
          setOpenActionMenu(null);
          void onRunCommand(assignment.id, command);
        };
        const toggleMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
          if (menuOpen) {
            setOpenActionMenu(null);
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          const menuWidth = 196;
          const menuHeight = 116;
          const gap = 6;
          const opensUp = rect.bottom + gap + menuHeight > window.innerHeight && rect.top > menuHeight + gap;
          setOpenActionMenu({
            assignmentId: assignment.id,
            left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
            top: opensUp ? Math.max(8, rect.top - menuHeight - gap) : Math.min(rect.bottom + gap, window.innerHeight - menuHeight - 8),
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

export { mergeAssignmentSources } from "./assignmentOverlays";
export { shouldCreateAssignmentAfterRequest } from "./assignments/assignmentUtils";
