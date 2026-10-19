import "./assignments/scoped-legacy.css";
import "./assignments/assignmentWorkspace.css";
import "./assignments/assignmentRedesign.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClientUuid } from "../../shared/clientUuid";
import { useAssignmentsWorkspace } from "../../hooks/useAssignmentsWorkspace";
import {
  mapEmployeeToAssignable,
  mapRouteToAssignable,
} from "../../repositories/assignmentsRepository";
import { Button, ModalShell, PageHeader } from "../../shared/ui";
import type {
  ActivePatrol,
  CancelAssignmentPayload,
  CompleteAssignmentPayload,
  CreateServiceRequestPayload,
  DataSourceMode,
  DataSourceStatus,
  EmployeeDirectoryItem,
  RouteDirectoryItem,
  ScreenId,
  ServiceRequest
} from "../../types";
import { subscribeAssignmentAutoRefresh } from "./assignments/assignmentAutoRefresh";
import {
  shiftStartTime,
  toDateInput
} from "./assignments/assignmentDateUtils";
import { AssignmentDraftConflictError, readAssignmentDrafts, writeAssignmentDrafts } from "./assignments/assignmentDrafts";
import { parseDateKey } from "../../shared/ui/dateRange";
import { AssignmentDraftRecoveryEditor } from "./assignments/AssignmentDraftRecoveryEditor";
import { AssignmentDraftPreview } from "./assignments/AssignmentDraftPreview";
import { LegacyDraftRecoveryModal } from "./assignments/LegacyDraftRecoveryModal";
import { AssignmentRequestModal } from "./assignments/AssignmentRequestModal";
import { AssignmentRoutePoints } from "./assignments/AssignmentRouteChoice";
import { AssignmentSelectionBar } from "./assignments/AssignmentSelectionBar";
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
import {
  isAssignableRequest,
  isAssignmentCurrent,
  resolveSelectedAssignmentEmployee,
  shouldCreateAssignmentAfterRequest
} from "./assignments/assignmentUtils";
import { buildNotificationText } from "./components/requests/requestModalUtils";

import { areStringArraysEqual, ASSIGNMENT_DRAFTS_STORAGE_KEY, CancelAssignmentModal, CompleteAssignmentModal, ConflictsCard, createLocalDraftId, DraftsCard, flattenServerFieldErrors, getCompletionRoutePoints, LocalDraft, mergeAssignmentSources } from "./assignmentOverlays";
import { ActiveAssignmentsCard, AssignmentEmployeePickerModal, EmployeeHistoryPanel, EmployeesPanel, isAssignableDirectoryEmployee, isAssignmentOnDate, RoutesPanel, ShiftSettingsModal } from "./assignments/AssignmentPanels";

interface AssignmentScreenProps {
  storageScope?: string;
  canRecoverLegacyDrafts?: boolean;
  activePatrols: ActivePatrol[];
  assignmentCreateIntent: number;
  onAssignmentCreateIntentHandled?: () => void;
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


export { mergeAssignmentSources } from "./assignmentOverlays";
export { shouldCreateAssignmentAfterRequest } from "./assignments/assignmentUtils";


export function AssignmentScreen(props: AssignmentScreenProps) {
  return <AssignmentWorkspace key={JSON.stringify([props.storageScope ?? "default", props.dataSourceMode, props.canManage ?? true, props.canRecoverLegacyDrafts ?? false])} {...props} />;
}

function AssignmentWorkspace({
  storageScope = "default",
  canRecoverLegacyDrafts = false,
  activePatrols,
  assignmentCreateIntent,
  onAssignmentCreateIntentHandled,
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
    sessionKey: storageScope,
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
  const [bottomTab, setBottomTab] = useState("active");
  const [routePreviewOpen, setRoutePreviewOpen] = useState(false);
  const draftStorageKey = `${ASSIGNMENT_DRAFTS_STORAGE_KEY}:${dataSourceMode}:${storageScope}`;
  const [draftState, setDraftState] = useState(() => readAssignmentDrafts(draftStorageKey));
  const drafts = draftState.drafts;
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [repairDraft, setRepairDraft] = useState<LocalDraft | null>(null);
  const [previewDraft, setPreviewDraft] = useState<LocalDraft | null>(null);
  const draftWriteError = useRef("");
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
  const mounted = useRef(true);
  const requestOperation = useRef<{ fingerprint: string; id: string; payload: CreateServiceRequestPayload; request?: ServiceRequest } | null>(null);
  const [requestError, setRequestError] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

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
  const selectedEmployee = requestModalOpen && selectedEmployeeId ? employees.find(employee => employee.id === selectedEmployeeId) : resolveSelectedAssignmentEmployee(employees, visibleEmployees, selectedEmployeeId);
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? (requestModalOpen && selectedRouteId ? undefined : visibleRoutes[0]);
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
    if (!requestModalOpen && selectedEmployeeId && !employees.some((employee) => employee.id === selectedEmployeeId)) {
      onSelectEmployee(visibleEmployees[0]?.id ?? employees[0]?.id ?? "");
    }
  }, [employees, onSelectEmployee, requestModalOpen, selectedEmployeeId, visibleEmployees]);

  useEffect(() => {
    if (!selectedRouteId && visibleRoutes[0]) {
      onSelectRoute(visibleRoutes[0].id);
    }
  }, [onSelectRoute, selectedRouteId, visibleRoutes]);

  useEffect(() => {
    if (!requestModalOpen && selectedRequestId && !assignableRequests.some((request) => request.id === selectedRequestId)) {
      setSelectedRequestId("");
    }
  }, [assignableRequests, requestModalOpen, selectedRequestId]);

  useEffect(() => {
    if (assignmentCreateIntent > 0) {
      setRequestError(""); setRequestModalOpen(true);
      onAssignmentCreateIntentHandled?.();
    }
  }, [assignmentCreateIntent, onAssignmentCreateIntentHandled]);

  useEffect(() => {
    if (!selectedEmployee || requestModalOpen) return;
    setPlannedStart(shiftStartTime(selectedEmployee.shift, shiftSettings));
  }, [selectedEmployee?.id, selectedEmployee?.shift, requestModalOpen, shiftSettings]);

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
    try { saveAssignmentFavoriteEmployeeIds(nextFavoriteIds); saveAssignmentShiftSettings(nextShiftSettings); }
    catch { /* The server is authoritative; a disabled browser cache must not break the workspace. */ }
    setServerSettingsApplied(true);

    if (!areStringArraysEqual(serverFavoriteIds, nextFavoriteIds)) {
      void assignments.updateAssignmentSettings({
        favoriteEmployeeIds: nextFavoriteIds,
        shiftSettings: nextShiftSettings,
      });
    }
  }, [assignments, assignments.assignmentSettings, dataSourceMode, favoriteEmployeeIds, serverSettingsApplied]);

  async function handleShiftSettingsSave(nextSettings: ShiftTimeSettings) {
    const saved = await assignments.updateAssignmentSettings({ shiftSettings: nextSettings });
    if (!mounted.current || !saved) return false;
    try { saveAssignmentShiftSettings(nextSettings); }
    catch { if (dataSourceMode !== "api") return false; }
    setShiftSettings(nextSettings);
    onNotify("Настройки смен сохранены для группы назначений.");
    return true;
  }

  async function handleFavoriteEmployeeIdsChange(nextIds: string[]) {
    const saved = await assignments.updateAssignmentSettings({ favoriteEmployeeIds: nextIds });
    if (!mounted.current || !saved) return false;
    try { saveAssignmentFavoriteEmployeeIds(nextIds); }
    catch { if (dataSourceMode !== "api") return false; }
    setFavoriteEmployeeIds(nextIds);
    return true;
  }

  async function handleAssign() {
    if (assignmentCreateInProgressRef.current || isCreatingRequest || assignments.isCreating) {
      return;
    }

    if (!selectedEmployee || !selectedRoute || !plannedDate || !plannedStart) {
      setRequestError("Выберите сотрудника, маршрут и время старта.");
      onNotify("Выберите сотрудника, маршрут и время старта.");
      return;
    }

    if (selectedRequestId && !selectedRequest) {
      setRequestError("Выбранное основание недоступно. Выберите другую заявку либо создайте новую.");
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
    setRequestError("");
    setIsCreatingRequest(true);
    try {
      const payload: CreateServiceRequestPayload = {
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
      };
      const fingerprint = JSON.stringify([selectedEmployee.id, selectedRoute.id, selectedRequestId, plannedDate, plannedStart, priority, comment]);
      if (requestOperation.current?.fingerprint !== fingerprint) requestOperation.current = { fingerprint, id: createClientUuid(), payload };
      const operation = requestOperation.current;
      const request = selectedRequest ?? operation.request ?? await onCreatePatrolRequest({ ...operation.payload, clientRequestId: operation.id });
      if (!mounted.current) return;
      operation.request = request;

       if (shouldCreateAssignmentAfterRequest({
         dataSourceMode,
         hasSelectedRequest: Boolean(selectedRequest),
         hasLinkedAssignment: Boolean(request.assignmentId),
       })) {
        const created = await assignments.createAssignment({
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
        if (!mounted.current || !created.succeeded) return;
      } else {
        await Promise.allSettled([assignments.refreshAssignments(), refreshPatrolData()]);
      }
      if (!mounted.current) return;
      setComment("");
      setSelectedRequestId("");
      setRequestModalOpen(false);
      requestOperation.current = null;
      try { await onRefreshRequests(); }
      catch { if (mounted.current) onNotify("Заявка отправлена. Список пока не обновился — обновите его позже."); }
      if (!mounted.current) return;
      onNotify("Заявка создана, уведомление подготовлено");
    } catch (error) {
      if (!mounted.current) return;
      setRequestError(error instanceof Error ? error.message : "Не удалось создать заявку на обход");
      onNotify(error instanceof Error ? error.message : "Не удалось создать заявку на обход");
    } finally {
      assignmentCreateInProgressRef.current = false;
      if (mounted.current) setIsCreatingRequest(false);
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

    if (Object.keys(errors).length > 0) {
      setCompletionErrors(errors);
      return;
    }

    const commandResult = await assignments.runCommand(completionTarget.id, "complete", payload);
    if (!mounted.current) return;
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
    if (!mounted.current) return;
    if (!commandResult.succeeded) {
      setCancelErrors(flattenServerFieldErrors(commandResult.errors));
      return;
    }

    setCancelTarget(null);
    setCancelErrors({});
    try { await onRefreshRequests(); } catch { if (mounted.current) onNotify("Отмена сохранена. Обновите список заявок позже."); }
  }

  function saveDraft() {
    if (!selectedEmployee || !selectedRoute) {
      onNotify("Выберите сотрудника и маршрут перед сохранением черновика.");
      return false;
    }

    const nextDrafts = [
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
      ...drafts,
    ];
    if (!persistDrafts(nextDrafts)) return false;
    onNotify("Черновик назначения сохранен локально.");
    return true;
  }

  function openDraft(draft: LocalDraft) {
    if (!canManage) { setPreviewDraft(structuredClone(draft)); return; }
    if (!employees.some(item => item.id === draft.employeeId) || !routes.some(item => item.id === draft.routeId) || !parseDateKey(draft.plannedDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.plannedStart)) {
      setRepairDraft(structuredClone(draft)); return;
    }
    onSelectEmployee(draft.employeeId);
    onSelectRoute(draft.routeId);
    setPlannedDate(draft.plannedDate);
    setPlannedStart(draft.plannedStart);
    setPriority(draft.priority);
    setComment(draft.comment);
    setSelectedRequestId(draft.requestId ?? "");
    setRequestError(""); setRequestModalOpen(true);
  }

  function deleteDraft(draftId: string) {
    if (persistDrafts(drafts.filter(draft => draft.id !== draftId))) onNotify("Черновик удален.");
  }

  function persistDrafts(next: LocalDraft[]) {
    if (!canManage) return false;
    try { setDraftState(writeAssignmentDrafts(draftStorageKey, draftState.raw, next)); draftWriteError.current = ""; return true; }
    catch (error) {
      if (error instanceof AssignmentDraftConflictError) refreshDrafts();
      draftWriteError.current = error instanceof Error ? error.message : "Не удалось сохранить черновик."; onNotify(draftWriteError.current); return false;
    }
  }

  function refreshDrafts() {
    const next = readAssignmentDrafts(draftStorageKey);
    setDraftState(previous => next.error && next.raw === null ? { ...previous, error: next.error } : next);
  }

  return (
    <div className="assign-am-screen assignment-workspace-v2">
      <PageHeader title="Назначения" description="Распределение сотрудников по маршрутам"
        actions={<Button variant="ghost" disabled={!selectedRoute} onClick={() => setRoutePreviewOpen(true)}>Проверить маршрут</Button>} />

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
          search={search}
          onSearchChange={setSearch}
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
          routeDirectory={routeDirectory}
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

      <section className="assign-am-bottom assignment-bottom-tabs">
        <div className="assignment-tab-list" role="tablist" aria-label="Состояние назначений">
          {[{ id: "active", title: "Текущие назначения", count: activeAssignments.length }, { id: "drafts", title: "Черновики", count: draftState.error ? "?" : drafts.length }, { id: "conflicts", title: "Конфликты", count: conflicts.length }].map((tab, index, tabs) => (
            <button key={tab.id} id={`assignment-tab-${tab.id}`} type="button" role="tab" aria-selected={bottomTab === tab.id}
              aria-controls={`assignment-panel-${tab.id}`} tabIndex={bottomTab === tab.id ? 0 : -1}
              onClick={() => setBottomTab(tab.id)} onKeyDown={(event) => {
                const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
                if (next < 0) return;
                event.preventDefault(); setBottomTab(tabs[next].id);
                document.getElementById(`assignment-tab-${tabs[next].id}`)?.focus();
              }}>{tab.title}<span>{tab.count}</span></button>
          ))}
        </div>
        <div role="tabpanel" id="assignment-panel-active" aria-labelledby="assignment-tab-active" hidden={bottomTab !== "active"} tabIndex={0}>
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
        </div>
        {completionTarget ? (
          <CompleteAssignmentModal
            key={completionTarget.id}
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
            key={cancelTarget.id}
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
        <div role="tabpanel" id="assignment-panel-drafts" aria-labelledby="assignment-tab-drafts" hidden={bottomTab !== "drafts"} tabIndex={0}><DraftsCard result={draftState} canManage={canManage} onDelete={deleteDraft} onOpen={openDraft} onReload={refreshDrafts} onRecover={canRecoverLegacyDrafts && canManage ? () => setRecoveryOpen(true) : undefined} /></div>
        <div role="tabpanel" id="assignment-panel-conflicts" aria-labelledby="assignment-tab-conflicts" hidden={bottomTab !== "conflicts"} tabIndex={0}><ConflictsCard conflicts={conflicts} /></div>
      </section>
      {previewDraft ? <AssignmentDraftPreview draft={previewDraft} onClose={() => setPreviewDraft(null)} /> : null}
      {repairDraft && canManage ? <AssignmentDraftRecoveryEditor source={repairDraft} requireExplicitSelection={false} employees={employees} routes={routes} onClose={() => setRepairDraft(null)} onRecover={draft => {
        if (!drafts.some(item => item.id === draft.id) && !persistDrafts([draft, ...drafts])) throw new Error(draftWriteError.current);
        setRepairDraft(null); onNotify("Копия добавлена в ваши черновики.");
      }} /> : null}
      {recoveryOpen && canRecoverLegacyDrafts && canManage ? <LegacyDraftRecoveryModal employees={employees} routes={routes} onClose={() => setRecoveryOpen(false)} onRecover={draft => {
        if (!drafts.some(item => item.id === draft.id) && !persistDrafts([draft, ...drafts])) throw new Error(draftWriteError.current);
        setRecoveryOpen(false); setBottomTab("drafts"); onNotify("Копия добавлена в ваши черновики.");
      }} /> : null}
      {routePreviewOpen && selectedRoute ? <ModalShell className="assignment-route-preview" title={selectedRoute.name} subtitle="Точки маршрута в порядке прохождения" onClose={() => setRoutePreviewOpen(false)}>
        <AssignmentRoutePoints points={routeDirectory.find((route) => route.id === selectedRoute.id)?.points} />
      </ModalShell> : null}
      {requestModalOpen ? (
        <AssignmentRequestModal
          routeDirectory={routeDirectory}
          canManage={canManage}
          comment={comment}
          employee={selectedEmployee}
          favoriteEmployees={favoriteEmployees}
          fieldErrors={{ ...assignments.fieldErrors, ...(requestError ? { form: [requestError] } : {}) }}
          hasConflict={hasConflict}
          isCreating={isCreatingRequest || assignments.isCreating}
          notificationText={notificationText}
          onAssign={handleAssign}
          onClose={() => setRequestModalOpen(false)}
          onCommentChange={setComment}
          onPlannedDateChange={setPlannedDate}
          onPlannedStartChange={setPlannedStart}
          onPriorityChange={setPriority}
          onSaveDraft={() => { if (!saveDraft()) return false; setRequestModalOpen(false); setBottomTab("drafts"); return true; }}
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
          onSave={handleShiftSettingsSave}
          value={shiftSettings}
        />
      ) : null}
    </div>
  );
}
