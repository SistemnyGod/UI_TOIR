import { useEffect, useMemo, useState } from "react";
import type {
  CreateServiceRequestPayload,
  DataSourceMode,
  ResultMode,
  RouteMode,
  ScheduleMode,
} from "./types";
import { RequestModals } from "./components/RequestModals";
import { ScreenRouter } from "./components/ScreenRouter";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import { TemporaryPasswordPanel } from "./components/accounts/TemporaryPasswordPanel";
import { type RequestModalState } from "./domain/serviceRequests";
import { employeesFallback } from "./repositories/employeesRepository";
import { patrolResultsFallback } from "./repositories/resultsRepository";
import { routesFallback } from "./repositories/routesRepository";
import { screenRegistry } from "./repositories/navigationRepository";
import { useHashScreen } from "./hooks/useHashScreen";
import { isDataSourceMode } from "./api/dataSource";
import { useMobileAccountsWorkspace, type TemporaryPasswordNotice } from "./hooks/useMobileAccountsWorkspace";
import { usePatrolDataSource } from "./hooks/usePatrolDataSource";
import { usePatrolWorkspaceData } from "./hooks/usePatrolWorkspaceData";
import { useStoredState } from "./hooks/useStoredState";
import { useToast } from "./hooks/useToast";


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
  const [selectedRouteDirectoryId, setSelectedRouteDirectoryId] = useState(routesFallback[0]?.id ?? "");
  const [selectedPointId, setSelectedPointId] = useState(routesFallback[0]?.points[0]?.id ?? "");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [requestModal, setRequestModal] = useState<RequestModalState>(null);
  const { toast, showToast } = useToast();
  const [dataSourceMode, setDataSourceMode] = useStoredState<DataSourceMode>("patrol360.dataSourceMode", "mock", {
    validate: isDataSourceMode,
  });
  const patrolData = usePatrolDataSource(dataSourceMode);
  const [temporaryPasswordNotice, setTemporaryPasswordNotice] = useState<TemporaryPasswordNotice | null>(null);
  const mobileAccounts = useMobileAccountsWorkspace({
    dataSourceMode,
    showTemporaryPassword,
    showToast,
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
    dataSourceMode,
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

  useEffect(() => {
    if (dataSourceMode === "api" && patrolData.status === "error" && patrolData.errorMessage) {
      showToast(`API недоступен: ${patrolData.errorMessage}`);
    }
  }, [dataSourceMode, patrolData.errorMessage, patrolData.status, showToast]);

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

  function handlePrimaryAction() {
    if (screen === "dashboard" || screen === "results") {
      openCreateRequest(selectedResultId);
      return;
    }

    if (screen === "assign") {
      showToast("Назначение подготовлено к отправке");
      return;
    }

    if (screen === "schedule") {
      showToast("План сохранен как локальный UI-черновик");
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

    showToast(`${currentScreen.createLabel}: действие уже доступно в текущем разделе`);
  }

  function runSearch(queryValue = searchQuery) {
    const query = queryValue.trim();
    showToast(query ? `Поиск по "${query}" применится к текущему разделу после выбора фильтра` : "Введите запрос для поиска");
  }

  function showTemporaryPassword(nextNotice: TemporaryPasswordNotice) {
    setTemporaryPasswordNotice(nextNotice);
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        screen={screen}
        screens={screenRegistry}
        sidebarCollapsed={sidebarCollapsed}
        onNavigate={navigate}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
      />

      <main className="workspace">
        <Topbar
          searchQuery={searchQuery}
          onRunSearch={runSearch}
          onSearchQueryChange={setSearchQuery}
          onNotify={showToast}
        />

        <WorkspaceHeader
          currentScreen={currentScreen}
          screen={screen}
          onOpenRequest={() => openRequestForResult()}
          onPrimaryAction={handlePrimaryAction}
        />

        <ScreenRouter
          accountCreateIntent={mobileAccounts.accountCreateIntent}
          accountMode={mobileAccounts.accountMode}
          accountListErrorMessage={mobileAccounts.accountListErrorMessage}
          accountListStatus={mobileAccounts.accountListStatus}
          accounts={mobileAccounts.accounts}
          activePatrols={activePatrols}
          dashboardMetrics={dashboardMetrics}
          employeeDirectory={employeeDirectory}
          mobileAccountSecurityErrorMessage={mobileAccounts.mobileAccountSecurityErrorMessage}
          mobileAccountSecurityEvents={mobileAccounts.mobileAccountSecurityEvents}
          mobileAccountSecurityStatus={mobileAccounts.mobileAccountSecurityStatus}
          mobileAccountSessions={mobileAccounts.mobileAccountSessions}
          onAccountModeChange={mobileAccounts.setAccountMode}
          onAssign={() => showToast("Назначение отправлено сотруднику")}
          onAttachEmployee={mobileAccounts.attachEmployeeToSelectedAccount}
          onCreateAccount={mobileAccounts.createMobileAccount}
          onCreateEmployee={createEmployee}
          onCreateRequest={openCreateRequest}
          onCreateRoute={createRoute}
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
