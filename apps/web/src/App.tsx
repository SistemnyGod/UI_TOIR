import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AccountMode,
  CreateMobileAccountPayload,
  CreateServiceRequestPayload,
  DataSourceMode,
  DataSourceStatus,
  MobileAccount,
  ResultMode,
  RouteMode,
  ScheduleMode,
  UpdateMobileAccountPayload,
} from "./types";
import { ApiError } from "./api/client";
import { RequestModals } from "./components/RequestModals";
import { ScreenRouter } from "./components/ScreenRouter";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import { TemporaryPasswordPanel } from "./components/accounts/TemporaryPasswordPanel";
import {
  attachEmployeeToMobileAccount,
  blockMobileAccountLocal,
  createApiMobileAccountsRepository,
  createLocalMobileAccount,
  deleteMobileAccount,
  detachEmployeeFromMobileAccount,
  isMobileAccountList,
  mobileAccountsFallback,
  mobileAccountsStorageKey,
  resetMobileAccountLocalPassword,
  unblockMobileAccountLocal,
  updateMobileAccountLocal,
} from "./repositories/mobileAccountsRepository";
import { type RequestModalState } from "./domain/serviceRequests";
import { employeesFallback } from "./repositories/employeesRepository";
import { patrolResultsFallback } from "./repositories/resultsRepository";
import { routesFallback } from "./repositories/routesRepository";
import { screenRegistry } from "./repositories/navigationRepository";
import { useHashScreen } from "./hooks/useHashScreen";
import { isDataSourceMode } from "./api/dataSource";
import { usePatrolDataSource } from "./hooks/usePatrolDataSource";
import { usePatrolWorkspaceData } from "./hooks/usePatrolWorkspaceData";
import { useStoredState } from "./hooks/useStoredState";
import { useToast } from "./hooks/useToast";

interface TemporaryPasswordNotice {
  accountLogin: string;
  password: string;
  title: string;
}

export function App() {
  const [screen, navigate] = useHashScreen();
  const [resultMode, setResultMode] = useState<ResultMode>("all");
  const [selectedResultId, setSelectedResultId] = useState(patrolResultsFallback[0]?.id ?? "");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedDirectoryEmployeeId, setSelectedDirectoryEmployeeId] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("week");
  const [selectedScheduleCellId, setSelectedScheduleCellId] = useState("");
  const [accounts, setAccounts] = useStoredState<MobileAccount[]>(mobileAccountsStorageKey, mobileAccountsFallback, {
    validate: isMobileAccountList,
  });
  const [accountMode, setAccountMode] = useState<AccountMode>("accounts");
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [accountCreateIntent, setAccountCreateIntent] = useState(0);
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
  const apiMobileAccounts = useMemo(() => createApiMobileAccountsRepository(), []);
  const [apiAccounts, setApiAccounts] = useState<MobileAccount[]>([]);
  const [accountListStatus, setAccountListStatus] = useState<DataSourceStatus>("idle");
  const [accountListErrorMessage, setAccountListErrorMessage] = useState<string | undefined>();
  const [temporaryPasswordNotice, setTemporaryPasswordNotice] = useState<TemporaryPasswordNotice | null>(null);
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
  const visibleAccounts = dataSourceMode === "api" ? apiAccounts : accounts;
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

  const refreshMobileAccounts = useCallback(
    async ({ signal }: { signal?: AbortSignal } = {}) => {
      if (dataSourceMode !== "api") {
        setAccountListStatus("idle");
        setAccountListErrorMessage(undefined);
        return;
      }

      setAccountListStatus("loading");
      setAccountListErrorMessage(undefined);

      try {
        const nextAccounts = await apiMobileAccounts.getAccounts({ signal });
        setApiAccounts(nextAccounts);
        setSelectedAccountId((currentId) => {
          if (nextAccounts.some((account) => account.id === currentId)) return currentId;
          return nextAccounts[0]?.id ?? "";
        });
        setAccountListStatus("ready");
      } catch (error) {
        if (signal?.aborted) return;

        const message = error instanceof Error ? error.message : "Не удалось загрузить мобильные аккаунты API";
        setApiAccounts([]);
        setAccountListStatus("error");
        setAccountListErrorMessage(message);
        showToast(`Не удалось загрузить мобильные аккаунты API: ${message}`);
      }
    },
    [apiMobileAccounts, dataSourceMode, showToast],
  );

  useEffect(() => {
    if (visibleAccounts.length === 0) {
      if (selectedAccountId) setSelectedAccountId("");
      return;
    }

    if (!visibleAccounts.some((account) => account.id === selectedAccountId)) {
      setSelectedAccountId(visibleAccounts[0].id);
    }
  }, [selectedAccountId, visibleAccounts]);

  useEffect(() => {
    if (dataSourceMode !== "api") {
      setAccountListStatus("idle");
      setAccountListErrorMessage(undefined);
      return;
    }

    const controller = new AbortController();

    void refreshMobileAccounts({ signal: controller.signal });

    return () => controller.abort();
  }, [dataSourceMode, refreshMobileAccounts]);

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
      setAccountMode("accounts");
      setAccountCreateIntent((value) => value + 1);
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

  async function createMobileAccount(payload: CreateMobileAccountPayload) {
    if (dataSourceMode === "api") {
      try {
        const result = await apiMobileAccounts.createAccount(payload);
        await refreshMobileAccounts();
        setSelectedAccountId(result.account.id);
        setAccountMode("accounts");
        if (result.temporaryPassword) {
          showTemporaryPassword({
            accountLogin: result.account.login,
            password: result.temporaryPassword,
            title: "Временный пароль для нового аккаунта",
          });
        }
        showToast(`Мобильный аккаунт ${result.account.login} создан`);
      } catch (error) {
        showToast(getErrorMessage(error, "Не удалось создать мобильный аккаунт"));
        throw error;
      }
      return;
    }

    const { account, accounts: nextAccounts, temporaryPassword } = createLocalMobileAccount(accounts, payload);

    setAccounts(nextAccounts);
    setSelectedAccountId(account.id);
    setAccountMode("accounts");
    if (temporaryPassword) {
      showTemporaryPassword({
        accountLogin: account.login,
        password: temporaryPassword,
        title: "Временный пароль для локального аккаунта",
      });
    }
    showToast(`Мобильный аккаунт ${account.login} создан: ${account.employee}`);
  }

  async function attachEmployeeToSelectedAccount(employeeId: string, employeeName: string) {
    if (!selectedAccountId) {
      showToast("Сначала выберите мобильный аккаунт");
      return;
    }

    const normalizedEmployeeName = employeeName.trim();
    if (!employeeId || !normalizedEmployeeName) {
      showToast("Выберите сотрудника из справочника");
      return;
    }

    if (dataSourceMode === "api") {
      try {
        await apiMobileAccounts.attachEmployee(selectedAccountId, employeeId, normalizedEmployeeName);
        await refreshMobileAccounts();
        showToast(`Аккаунт привязан к ${normalizedEmployeeName}`);
      } catch (error) {
        showToast(getErrorMessage(error, "Не удалось привязать сотрудника"));
        throw error;
      }
      return;
    }

    setAccounts(attachEmployeeToMobileAccount(accounts, selectedAccountId, normalizedEmployeeName, employeeId));
    showToast(`Аккаунт привязан к ${normalizedEmployeeName}`);
  }

  async function updateSelectedAccount(payload: UpdateMobileAccountPayload) {
    if (!selectedAccountId) {
      showToast("Сначала выберите мобильный аккаунт");
      return;
    }

    if (dataSourceMode === "api") {
      try {
        const account = await apiMobileAccounts.updateAccount(selectedAccountId, payload);
        await refreshMobileAccounts();
        setSelectedAccountId(account.id);
        showToast(`Аккаунт ${account.login} сохранен`);
      } catch (error) {
        showToast(getErrorMessage(error, "Не удалось сохранить аккаунт"));
        throw error;
      }
      return;
    }

    setAccounts(updateMobileAccountLocal(accounts, selectedAccountId, payload));
    showToast(`Аккаунт ${payload.login} сохранен`);
  }

  async function toggleSelectedAccountBlock() {
    if (!selectedAccountId) {
      showToast("Сначала выберите мобильный аккаунт");
      return;
    }

    const account = visibleAccounts.find((item) => item.id === selectedAccountId);
    const isBlocked = account?.status === "Заблокирован";

    if (dataSourceMode === "api") {
      try {
        const nextAccount = isBlocked
          ? await apiMobileAccounts.unblockAccount(selectedAccountId)
          : await apiMobileAccounts.blockAccount(selectedAccountId);
        await refreshMobileAccounts();
        showToast(isBlocked ? `Аккаунт ${nextAccount.login} разблокирован` : `Аккаунт ${nextAccount.login} заблокирован`);
      } catch (error) {
        showToast(getErrorMessage(error, isBlocked ? "Не удалось разблокировать аккаунт" : "Не удалось заблокировать аккаунт"));
        throw error;
      }
      return;
    }

    setAccounts(isBlocked ? unblockMobileAccountLocal(accounts, selectedAccountId) : blockMobileAccountLocal(accounts, selectedAccountId));
    showToast(isBlocked ? "Аккаунт разблокирован" : "Аккаунт заблокирован");
  }

  async function detachEmployeeFromSelectedAccount(employeeId?: string) {
    if (!selectedAccountId) {
      showToast("Сначала выберите мобильный аккаунт");
      return;
    }

    const account = visibleAccounts.find((item) => item.id === selectedAccountId);
    const resolvedEmployeeId = employeeId ?? account?.boundEmployeeIds?.[0];
    if (!resolvedEmployeeId && dataSourceMode === "api") {
      showToast("Для отвязки нужен employeeId. Перепривяжите сотрудника из справочника или обновите данные аккаунта.");
      return;
    }

    if (dataSourceMode === "api") {
      try {
        await apiMobileAccounts.detachEmployee(selectedAccountId, resolvedEmployeeId!);
        await refreshMobileAccounts();
        showToast("Сотрудник отвязан от аккаунта");
      } catch (error) {
        showToast(getErrorMessage(error, "Не удалось отвязать сотрудника"));
        throw error;
      }
      return;
    }

    setAccounts(detachEmployeeFromMobileAccount(accounts, selectedAccountId, resolvedEmployeeId));
    showToast("Сотрудник отвязан от аккаунта");
  }

  async function deleteSelectedAccount() {
    if (!selectedAccountId) {
      showToast("Сначала выберите мобильный аккаунт");
      return;
    }

    const account = visibleAccounts.find((item) => item.id === selectedAccountId);

    if (dataSourceMode === "api") {
      try {
        await apiMobileAccounts.deleteAccount(selectedAccountId);
        await refreshMobileAccounts();
        showToast(account ? `Аккаунт ${account.login} удален` : "Аккаунт удален");
      } catch (error) {
        showToast(getErrorMessage(error, "Не удалось удалить аккаунт"));
        throw error;
      }
      return;
    }

    const nextAccounts = deleteMobileAccount(accounts, selectedAccountId);
    setAccounts(nextAccounts);
    setSelectedAccountId(nextAccounts[0]?.id ?? "");
    showToast(account ? `Аккаунт ${account.login} удален из локального прототипа` : "Аккаунт удален");
  }

  async function resetSelectedPassword() {
    if (!selectedAccountId) {
      showToast("Сначала выберите мобильный аккаунт");
      return;
    }

    if (dataSourceMode === "api") {
      try {
        const result = await apiMobileAccounts.resetPassword(selectedAccountId);
        await refreshMobileAccounts();
        const account = visibleAccounts.find((item) => item.id === selectedAccountId);
        showTemporaryPassword({
          accountLogin: account?.login ?? selectedAccountId,
          password: result.temporaryPassword,
          title: "Временный пароль после сброса",
        });
        showToast("Временный пароль выдан");
      } catch (error) {
        showToast(getErrorMessage(error, "Не удалось сбросить пароль"));
        throw error;
      }
      return;
    }

    const result = resetMobileAccountLocalPassword(accounts, selectedAccountId);
    setAccounts(result.accounts);
    const account = visibleAccounts.find((item) => item.id === selectedAccountId);
    showTemporaryPassword({
      accountLogin: account?.login ?? selectedAccountId,
      password: result.temporaryPassword,
      title: "Временный пароль после локального сброса",
    });
    showToast("Пароль обновлен");
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
          accountCreateIntent={accountCreateIntent}
          accountMode={accountMode}
          accountListErrorMessage={accountListErrorMessage}
          accountListStatus={accountListStatus}
          accounts={visibleAccounts}
          activePatrols={activePatrols}
          dashboardMetrics={dashboardMetrics}
          employeeDirectory={employeeDirectory}
          onAccountModeChange={setAccountMode}
          onAssign={() => showToast("Назначение отправлено сотруднику")}
          onAttachEmployee={attachEmployeeToSelectedAccount}
          onCreateAccount={createMobileAccount}
          onCreateEmployee={createEmployee}
          onCreateRequest={openCreateRequest}
          onCreateRoute={createRoute}
          onCreateRoutePoint={createRoutePoint}
          onDeleteAccount={deleteSelectedAccount}
          onDetachEmployee={detachEmployeeFromSelectedAccount}
          onDeleteEmployee={deleteEmployee}
          onDeleteRoute={deleteRoute}
          onDeleteRoutePoint={deleteRoutePoint}
          onNavigate={navigate}
          onNotify={showToast}
          onOpenRequest={openRequestForResult}
          onOpenRequestById={openRequestById}
          onResetPassword={resetSelectedPassword}
          onRetryAccounts={refreshMobileAccounts}
          onResultModeChange={setResultMode}
          onRouteModeChange={setRouteMode}
          onScheduleModeChange={setScheduleMode}
          onSelectAccount={setSelectedAccountId}
          onSelectDirectoryEmployee={setSelectedDirectoryEmployeeId}
          onSelectEmployee={setSelectedEmployeeId}
          onSelectPoint={setSelectedPointId}
          onSelectResult={setSelectedResultId}
          onSelectRoute={setSelectedRouteId}
          onSelectRouteDirectory={selectRouteDirectory}
          onSelectScheduleCell={setSelectedScheduleCellId}
          onSelectUser={setSelectedUserId}
          onToggleBlockAccount={toggleSelectedAccountBlock}
          onUpdateAccount={updateSelectedAccount}
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
          selectedAccountId={selectedAccountId}
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

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.errors) {
    const fieldMessages = Object.values(error.errors).flat().filter(Boolean);
    if (fieldMessages.length > 0) {
      return `${fallback}: ${fieldMessages[0]}`;
    }
  }

  return error instanceof Error ? `${fallback}: ${error.message}` : fallback;
}
