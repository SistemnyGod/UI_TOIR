import { useEffect, useMemo, useState } from "react";
import type {
  CompleteAssignmentPayload,
  CreateServiceRequestPayload,
  DataSourceMode,
  ResultMode,
  RouteMode,
  ScheduleMode,
  ScreenId,
} from "../types";
import { RequestModals } from "../features/patrol/components/requests/RequestModals";
import { ScreenRouter } from "./routing/ScreenRouter";
import { Sidebar } from "./shell/Sidebar";
import { Topbar, type TopbarNotification } from "./shell/Topbar";
import { WorkspaceHeader } from "./shell/WorkspaceHeader";
import { TemporaryPasswordPanel } from "../features/mobileAccounts/components/TemporaryPasswordPanel";
import { LoginScreen } from "./auth/LoginScreen";
import { type RequestModalState } from "../domain/serviceRequests";
import { createApiAssignmentsRepository } from "../repositories/assignmentsRepository";
import { employeesFallback } from "../repositories/employeesRepository";
import { patrolResultsFallback } from "../repositories/resultsRepository";
import { routesFallback } from "../repositories/routesRepository";
import { screenRegistry } from "../repositories/navigationRepository";
import { useHashScreen } from "../hooks/useHashScreen";
import { getConfiguredDataSourceMode, getDefaultDataSourceMode, isDataSourceMode } from "../api/dataSource";
import { useMobileAccountsWorkspace, type TemporaryPasswordNotice } from "../hooks/useMobileAccountsWorkspace";
import { usePatrolDataSource } from "../hooks/usePatrolDataSource";
import { usePatrolWorkspaceData } from "../hooks/usePatrolWorkspaceData";
import { useSession } from "../hooks/useSession";
import { useStoredState } from "../hooks/useStoredState";
import { useSystemNotifications } from "../hooks/useSystemNotifications";
import { useToast } from "../hooks/useToast";
import { getPermissionDeniedMessage, getPrimaryActionPermission, hasPermission } from "../security/permissions";


export function App() {
  const [screen, navigate] = useHashScreen();
  const [resultMode, setResultMode] = useState<ResultMode>("all");
  const [selectedResultId, setSelectedResultId] = useState(patrolResultsFallback[0]?.id ?? "");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedDirectoryEmployeeId, setSelectedDirectoryEmployeeId] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("week");
  const [selectedScheduleCellId, setSelectedScheduleCellId] = useState("");
  const [routeMode, setRouteMode] = useState<RouteMode>("points");
  const [routeCreateIntent, setRouteCreateIntent] = useState(0);
  const [employeeCreateIntent, setEmployeeCreateIntent] = useState(0);
  const [assignmentCreateIntent, setAssignmentCreateIntent] = useState(0);
  const [selectedRouteDirectoryId, setSelectedRouteDirectoryId] = useState(routesFallback[0]?.id ?? "");
  const [selectedPointId, setSelectedPointId] = useState(routesFallback[0]?.points[0]?.id ?? "");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [requestModal, setRequestModal] = useState<RequestModalState>(null);
  const { toast, showToast } = useToast();
  const configuredDataSourceMode = getConfiguredDataSourceMode();
  const [storedDataSourceMode, setStoredDataSourceMode] = useStoredState<DataSourceMode>("patrol360.dataSourceMode", getDefaultDataSourceMode(), {
    ignoreStoredValue: configuredDataSourceMode !== null,
    validate: isDataSourceMode,
  });
  const dataSourceMode = configuredDataSourceMode ?? storedDataSourceMode;
  const session = useSession(dataSourceMode);
  const hasApiSession =
    dataSourceMode === "api" &&
    session.isAuthenticated &&
    session.user !== null &&
    session.user.id !== "mock-session-user";
  const dataAccessMode = dataSourceMode === "api" && !hasApiSession ? "mock" : dataSourceMode;
  const patrolData = usePatrolDataSource(dataAccessMode);
  const scheduleAssignmentsApi = useMemo(() => createApiAssignmentsRepository(), []);
  const [temporaryPasswordNotice, setTemporaryPasswordNotice] = useState<TemporaryPasswordNotice | null>(null);
  const mobileAccounts = useMobileAccountsWorkspace({
    dataSourceMode: dataAccessMode,
    showTemporaryPassword,
    showToast,
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const systemNotifications = useSystemNotifications({
    dataSourceMode,
    enabled: hasApiSession,
    showToast,
  });

  const {
    activePatrols,
    dashboardMetrics,
    employeeDirectory,
    refreshRequests,
    requestListErrorMessage,
    requestListStatus,
    requests,
    routeDirectory,
    createEmployee,
    createRoute,
    createRouteWithPoints,
    createRoutePoint,
    deleteEmployee,
    deleteRoute,
    deleteRoutePoint,
    movePoint,
    selectRouteDirectory,
    submitRequestDraft: submitWorkspaceRequestDraft,
    updateEmployee,
    updateRoute,
    updateRoutePoint,
  } = usePatrolWorkspaceData({
    dataSourceMode: dataAccessMode,
    patrolSnapshot: patrolData.snapshot,
    requestModal,
    refreshPatrolData: () => patrolData.refresh({ silent: true }),
    selectedPointId,
    selectedRouteDirectoryId,
    setRouteMode,
    setSelectedPointId,
    setSelectedRouteDirectoryId,
    showToast,
  });

  const currentScreen = useMemo(() => screenRegistry.find((item) => item.id === screen) ?? screenRegistry[0], [screen]);
  const primaryActionPermission = useMemo(() => getPrimaryActionPermission(screen), [screen]);
  const canUsePrimaryAction = !primaryActionPermission || hasPermission(session.user, primaryActionPermission);
  const selectedRequest = useMemo(
    () =>
      requestModal?.kind === "view"
        ? requests.find((request) => request.id === requestModal.requestId)
        : undefined,
    [requestModal, requests],
  );
  const requestSourceResult = useMemo(
    () =>
      requestModal?.kind === "create" && requestModal.sourceResultId
        ? patrolResultsFallback.find((result) => result.id === requestModal.sourceResultId)
        : undefined,
    [requestModal],
  );
  const topbarNotifications = useMemo<TopbarNotification[]>(() => {
    const next: TopbarNotification[] = systemNotifications.items.map((notification) => {
      const navigateTo = notification.navigateTo;
      return {
        id: notification.id,
        message: notification.message,
        time: formatNotificationTime(notification.createdAt),
        title: notification.title,
        tone: notification.tone,
        onClick: navigateTo ? () => navigate(resolveNotificationScreen(navigateTo)) : undefined,
      };
    });

    if (requestListStatus === "error") {
      next.push({
        id: "requests-load-error",
        title: "Заявки не загрузились",
        message: requestListErrorMessage ?? "Проверьте подключение к backend API.",
        time: "сейчас",
        tone: "danger",
        onClick: () => void refreshRequests(),
      });
    }

    const latestSecurityEvent = mobileAccounts.mobileAccountSecurityEvents[0];
    if (latestSecurityEvent) {
      const eventType = latestSecurityEvent.eventType.toLowerCase();
      const tone = eventType.includes("failed") || eventType.includes("blocked") ? "danger" : "warning";
      next.push({
        id: `security-${latestSecurityEvent.id}`,
        title: "Событие безопасности",
        message: latestSecurityEvent.message,
        time: latestSecurityEvent.createdAt,
        tone,
        onClick: () => navigate("accounts"),
      });
    }

    requests.slice(0, 2).forEach((request) => {
      next.push({
        id: `request-${request.id}`,
        title: request.title || "Заявка на обход",
        message: `${request.route}${request.employee ? ` · ${request.employee}` : ""}`,
        time: request.scheduledTime || request.dueAt || request.scheduledDate,
        tone: request.priority === "Критический" || request.priority === "Высокий" ? "warning" : "info",
        onClick: () => openRequestById(request.id),
      });
    });

    if (activePatrols.length === 0) {
      next.push({
        id: "active-patrols-empty",
        title: "Активных обходов нет",
        message: "Назначьте обход сотруднику, чтобы начать смену.",
        time: "сейчас",
        tone: "info",
        onClick: () => navigate("assign"),
      });
    }

    if (requests.length === 0) {
      next.push({
        id: "requests-empty",
        title: "Заявок на обход нет",
        message: "Создайте заявку или назначение для первого обхода.",
        time: "сейчас",
        tone: "info",
        onClick: () => openCreateRequest(),
      });
    }

    if (routeDirectory.length === 0) {
      next.push({
        id: "routes-empty",
        title: "Маршруты не заполнены",
        message: "Добавьте маршрут и контрольные точки.",
        time: "сейчас",
        tone: "warning",
        onClick: () => navigate("routes"),
      });
    }

    return next.slice(0, 6);
  }, [
    activePatrols.length,
    mobileAccounts.mobileAccountSecurityEvents,
    navigate,
    refreshRequests,
    requestListErrorMessage,
    requestListStatus,
    requests,
    routeDirectory.length,
    systemNotifications.items,
  ]);

  useEffect(() => {
    if (dataAccessMode === "api" && patrolData.status === "error" && patrolData.errorMessage) {
      showToast(`API недоступен: ${patrolData.errorMessage}`);
    }
  }, [dataAccessMode, patrolData.errorMessage, patrolData.status, showToast]);

  function openRequestForResult(resultId = selectedResultId) {
    if (!resultId) {
      if (requests[0]) {
        setRequestModal({ kind: "view", requestId: requests[0].id });
        return;
      }

      setRequestModal({ kind: "create" });
      return;
    }

    const request = requests.find((item) => item.sourceResultId === resultId);
    if (!request) {
      setRequestModal({ kind: "create", sourceResultId: resultId });
      return;
    }

    setRequestModal({ kind: "view", requestId: request.id });
  }

  function openRequestById(requestId: string) {
    setRequestModal({ kind: "view", requestId });
  }

  function openCreateRequest(sourceResultId = selectedResultId) {
    setRequestModal({ kind: "create", sourceResultId });
  }

  async function submitRequestDraft(payload: CreateServiceRequestPayload) {
    const nextRequest = await submitWorkspaceRequestDraft(payload);
    setRequestModal({ kind: "view", requestId: nextRequest.id });
  }

  async function createPatrolRequestFromScreen(payload: CreateServiceRequestPayload) {
    return submitWorkspaceRequestDraft(payload);
  }

  async function runScheduleAssignmentCommand(
    assignmentId: string,
    command: "start" | "cancel" | "complete",
    payload?: CompleteAssignmentPayload,
  ) {
    if (!assignmentId) {
      showToast("Назначение для этой ячейки не найдено");
      return;
    }

    if (dataAccessMode !== "api") {
      showToast("Команды назначения доступны в API-режиме");
      return;
    }

    const result =
      command === "start"
        ? await scheduleAssignmentsApi.startAssignment(assignmentId)
        : command === "cancel"
          ? await scheduleAssignmentsApi.cancelAssignment(assignmentId)
          : await scheduleAssignmentsApi.completeAssignment(assignmentId, payload);

    await patrolData.refresh({ silent: true });
    await refreshRequests();
    showToast(result.message || "Назначение обновлено");
  }

  function handlePrimaryAction() {
    if (!canUsePrimaryAction) {
      showToast(getPermissionDeniedMessage(primaryActionPermission));
      return;
    }

    if (screen === "dashboard" || screen === "results") {
      openCreateRequest(selectedResultId);
      return;
    }

    if (screen === "assign") {
      setAssignmentCreateIntent((value) => value + 1);
      return;
    }

    if (screen === "schedule") {
      showToast("Выберите ячейку расписания и сохраните заявку на обход");
      return;
    }

    if (screen === "routes") {
      setRouteCreateIntent((value) => value + 1);
      return;
    }

    if (screen === "employees") {
      setEmployeeCreateIntent((value) => value + 1);
      return;
    }

    if (screen === "accounts") {
      mobileAccounts.openCreateAccountPanel();
      return;
    }

    if (screen === "users") {
      showToast("Заполните форму создания пользователя в панели слева");
      return;
    }

    if (screen.startsWith("inventory-")) {
      showToast(`${currentScreen.title}: сначала подключаем read API и миграционные таблицы`);
      return;
    }

    if (screen.startsWith("emu-")) {
      showToast("Основные действия ЭМУ доступны внутри вкладки: кнопка «Отправить в работу», модалки паузы и завершения.");
      return;
    }

    showToast(`${currentScreen.createLabel}: действие уже доступно в текущем разделе`);
  }

  function runSearch(queryValue = searchQuery) {
    const query = queryValue.trim();
    showToast(query ? `Поиск по "${query}" применится к текущему разделу после выбора фильтра` : "Введите запрос для поиска");
  }

  function showTemporaryPassword(nextNotice: TemporaryPasswordNotice) {
    setTemporaryPasswordNotice(nextNotice);
  }

  async function handleLogout() {
    await session.logout();
    setDataSourceMode("api");
  }

  function setDataSourceMode(nextMode: DataSourceMode) {
    setStoredDataSourceMode(configuredDataSourceMode ?? nextMode);
  }

  if (dataSourceMode === "api" && !hasApiSession) {
    return (
      <LoginScreen
        errorMessage={session.errorMessage}
        isSubmitting={session.status === "loading"}
        onLogin={session.login}
        onUseMockMode={() => {
          if (isDataSourceMode("mock")) {
            setDataSourceMode("mock");
            return;
          }

          showToast("Локальный режим отключен: используйте вход через backend API.");
        }}
      />
    );
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        currentUser={session.user}
        screen={screen}
        screens={screenRegistry}
        sidebarCollapsed={sidebarCollapsed}
        onNavigate={navigate}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
      />

      <main className="workspace">
        <Topbar
          currentUser={session.user}
          notifications={topbarNotifications}
          searchQuery={searchQuery}
          onLogout={() => void handleLogout()}
          onRunSearch={runSearch}
          onSearchQueryChange={setSearchQuery}
          onNotify={showToast}
        />

        <WorkspaceHeader
          canUsePrimaryAction={canUsePrimaryAction}
          currentScreen={currentScreen}
          primaryActionDisabledReason={getPermissionDeniedMessage(primaryActionPermission)}
          screen={screen}
          onOpenRequest={() => openRequestForResult()}
          onPrimaryAction={handlePrimaryAction}
        />

        <ScreenRouter
          accountCreateIntent={mobileAccounts.accountCreateIntent}
          assignmentCreateIntent={assignmentCreateIntent}
          accountMode={mobileAccounts.accountMode}
          accountListErrorMessage={mobileAccounts.accountListErrorMessage}
          accountListStatus={mobileAccounts.accountListStatus}
          accounts={mobileAccounts.accounts}
          activePatrols={activePatrols}
          currentUser={session.user}
          dataSourceMode={dataAccessMode}
          dashboardMetrics={dashboardMetrics}
          employeeDirectory={employeeDirectory}
          mobileAccountSecurityErrorMessage={mobileAccounts.mobileAccountSecurityErrorMessage}
          mobileAccountSecurityEvents={mobileAccounts.mobileAccountSecurityEvents}
          mobileAccountSecurityStatus={mobileAccounts.mobileAccountSecurityStatus}
          mobileAccountSessions={mobileAccounts.mobileAccountSessions}
          onAccountModeChange={mobileAccounts.setAccountMode}
          onAttachEmployee={mobileAccounts.attachEmployeeToSelectedAccount}
          onBindEmployees={mobileAccounts.bindEmployeesToSelectedAccount}
          onCreateAccount={mobileAccounts.createMobileAccount}
          onCreateEmployee={createEmployee}
          onCreateRequest={openCreateRequest}
          onCreateScheduledRequest={createPatrolRequestFromScreen}
          onCreateRoute={createRoute}
          onCreateRouteWithPoints={createRouteWithPoints}
          onCreateRoutePoint={createRoutePoint}
          onDeleteAccount={mobileAccounts.deleteSelectedAccount}
          onDetachEmployee={mobileAccounts.detachEmployeeFromSelectedAccount}
          onDeleteEmployee={deleteEmployee}
          onDeleteRoute={deleteRoute}
          onDeleteRoutePoint={deleteRoutePoint}
          onNavigate={navigate}
          onNotify={showToast}
          onOpenRequest={openRequestForResult}
          onOpenRequestById={openRequestById}
          onRefreshAccountSecurity={mobileAccounts.refreshMobileAccountSecurity}
          onRefreshPatrolData={() => patrolData.refresh({ silent: true })}
          onResetPassword={mobileAccounts.resetSelectedPassword}
          onRetryAccounts={mobileAccounts.refreshMobileAccounts}
          onResultModeChange={setResultMode}
          onRouteModeChange={setRouteMode}
          onScheduleModeChange={setScheduleMode}
          onSelectAccount={mobileAccounts.setSelectedAccountId}
          onSelectDirectoryEmployee={setSelectedDirectoryEmployeeId}
          onSelectEmployee={setSelectedEmployeeId}
          onSelectPoint={setSelectedPointId}
          onSelectResult={setSelectedResultId}
          onSelectRoute={setSelectedRouteId}
          onSelectRouteDirectory={selectRouteDirectory}
          onSelectScheduleCell={setSelectedScheduleCellId}
          onSelectUser={setSelectedUserId}
          onShowTemporaryPassword={showTemporaryPassword}
          onRunScheduleAssignmentCommand={runScheduleAssignmentCommand}
          onToggleBlockAccount={mobileAccounts.toggleSelectedAccountBlock}
          onUpdateAccount={mobileAccounts.updateSelectedAccount}
          onUpdateRoute={updateRoute}
          onUpdateRoutePoint={updateRoutePoint}
          onUpdateEmployee={updateEmployee}
          onMoveRoutePoint={movePoint}
          requests={requests}
          requestListErrorMessage={requestListErrorMessage}
          requestListStatus={requestListStatus}
          onRetryRequests={refreshRequests}
          resultMode={resultMode}
          employeeCreateIntent={employeeCreateIntent}
          routeCreateIntent={routeCreateIntent}
          routeDirectory={routeDirectory}
          routeMode={routeMode}
          scheduleMode={scheduleMode}
          screen={screen}
          selectedAccountId={mobileAccounts.selectedAccountId}
          selectedDirectoryEmployeeId={selectedDirectoryEmployeeId}
          selectedEmployeeId={selectedEmployeeId}
          selectedPointId={selectedPointId}
          selectedResultId={selectedResultId}
          selectedRouteDirectoryId={selectedRouteDirectoryId}
          selectedRouteId={selectedRouteId}
          selectedScheduleCellId={selectedScheduleCellId}
          selectedUserId={selectedUserId}
        />
      </main>

      <RequestModals
        employeeOptions={employeeDirectory.length > 0 ? employeeDirectory : employeesFallback}
        modal={requestModal}
        request={selectedRequest}
        routeOptions={routeDirectory}
        sourceResult={requestSourceResult}
        sourceResultId={requestModal?.kind === "create" ? requestModal.sourceResultId : undefined}
        onClose={() => setRequestModal(null)}
        onCreateRelated={openCreateRequest}
        onSubmitCreate={submitRequestDraft}
      />

      {temporaryPasswordNotice ? (
        <TemporaryPasswordPanel
          accountLogin={temporaryPasswordNotice.accountLogin}
          password={temporaryPasswordNotice.password}
          title={temporaryPasswordNotice.title}
          onDismiss={() => setTemporaryPasswordNotice(null)}
          onNotify={showToast}
        />
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const now = Date.now();
  const diffMs = now - date.getTime();
  if (diffMs >= 0 && diffMs < 60_000) return "сейчас";
  if (diffMs >= 0 && diffMs < 60 * 60_000) return `${Math.max(1, Math.floor(diffMs / 60_000))} мин`;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(date);
}

function resolveNotificationScreen(value: string): ScreenId {
  return screenRegistry.some((screen) => screen.id === value) ? (value as ScreenId) : "dashboard";
}
