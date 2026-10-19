import "./scoped-legacy.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { MobileAccountCreateDrawer } from "./components/MobileAccountCreateDrawer";
import { MobileAccountEditPanel } from "./components/MobileAccountEditPanel";
import { MobileAccountLinkPanel } from "./components/MobileAccountLinkPanel";
import { MobileAccountDeletePanel, MobileAccountPasswordPanel } from "./components/MobileAccountActionPanels";
import { MobileAccountListPanel, type MobileAccountWorkspacePanel } from "./components/MobileAccountListPanel";
import { MobileAccountActivity } from "./components/MobileAccountActivity";
import { MobileAccountDetail } from "./components/MobileAccountDetail";
import { AccountDialogHost } from "./components/AccountDialogHost";
import { useDialogCloseGuard } from "../../shared/ui";
import { createApiMobileAccountsRepository } from "../../repositories/mobileAccountsRepository";
import "./mobileAccountsWorkspace.css";
import type {
  AccountMode,
  CreateMobileAccountPayload,
  DataSourceStatus,
  DataSourceMode,
  EmployeeDirectoryItem,
  MobileAccount,
  MobileAccountSecurityEvent,
  MobileAccountSession,
  UpdateMobileAccountPayload,
} from "../../types";

type MaybePromise<T> = T | Promise<T>;

export function MobileAccountsScreen({
  accountCreateIntent,
  accountListErrorMessage,
  accountListStatus,
  accounts,
  canManage = true,
  dataSourceMode,
  employeeDirectory,
  mobileAccountSecurityErrorMessage,
  mobileAccountSecurityEvents,
  mobileAccountSecurityStatus,
  mobileAccountSessions,
  selectedAccountId,
  mode,
  onModeChange,
  onSelectAccount,
  onAttachEmployee,
  onBindEmployees,
  onCreateAccount,
  onDeleteAccount,
  onDetachEmployee,
  onNotify,
  onRefreshAccountSecurity,
  onResetPassword,
  onRetryAccounts,
  onToggleBlockAccount,
  onUpdateAccount,
}: {
  accountCreateIntent: number;
  accountListErrorMessage?: string;
  accountListStatus: DataSourceStatus;
  accounts: MobileAccount[];
  canManage?: boolean;
  dataSourceMode: DataSourceMode;
  employeeDirectory: EmployeeDirectoryItem[];
  mobileAccountSecurityErrorMessage?: string;
  mobileAccountSecurityEvents: MobileAccountSecurityEvent[];
  mobileAccountSecurityStatus: DataSourceStatus;
  mobileAccountSessions: MobileAccountSession[];
  selectedAccountId: string;
  mode: AccountMode;
  onModeChange: (mode: AccountMode) => void;
  onSelectAccount: (id: string) => void;
  onAttachEmployee: (employeeId: string, employeeName: string, accountId?: string) => MaybePromise<void>;
  onBindEmployees: (employeeIds: string[], accountId?: string) => MaybePromise<void>;
  onCreateAccount: (payload: CreateMobileAccountPayload) => MaybePromise<void>;
  onDeleteAccount: (accountId?: string) => MaybePromise<void>;
  onDetachEmployee: (employeeId?: string, accountId?: string) => MaybePromise<void>;
  onNotify: (message: string) => void;
  onRefreshAccountSecurity: () => MaybePromise<void>;
  onResetPassword: (accountId?: string) => MaybePromise<void>;
  onRetryAccounts: () => MaybePromise<void>;
  onToggleBlockAccount: (accountId?: string) => MaybePromise<void>;
  onUpdateAccount: (payload: UpdateMobileAccountPayload, accountId?: string) => MaybePromise<void>;
}) {
  const selected = accounts.find((account) => account.id === selectedAccountId);
  const [activePanel, setActivePanel] = useState<MobileAccountWorkspacePanel | null>(null);
  const [panelAccount, setPanelAccount] = useState<MobileAccount>();
  const [fallbackEmployees, setFallbackEmployees] = useState<EmployeeDirectoryItem[]>([]);
  const [fallbackEmployeeAccountId, setFallbackEmployeeAccountId] = useState("");
  const [panelBusy, setPanelBusy] = useState(false);
  const panelBusyRef = useRef(false);
  const panelDirtyRef = useRef(false);
  const mounted = useRef(true);
  const destination = useRef<() => void>(() => undefined);
  const notifyRef = useRef(onNotify);
  notifyRef.current = onNotify;
  const dialogOpenerRef = useRef<HTMLElement | null>(null);
  const onDirtyChange = useCallback((dirty: boolean) => { panelDirtyRef.current = dirty; }, []);
  const { requestClose, discardDialog } = useDialogCloseGuard({
    dirty: () => panelDirtyRef.current,
    pending: panelBusy,
    onClose: () => destination.current(),
  });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (accountCreateIntent === 0) return;
    openPanel("create");
  }, [accountCreateIntent]);

  function openPanel(panel: MobileAccountWorkspacePanel, accountId = panelAccount?.id ?? selectedAccountId) {
    if (panelBusyRef.current) return;
    if (!canManage && panel !== "view") {
      onNotify("Недостаточно прав для управления мобильными аккаунтами.");
      return;
    }

    const account = accounts.find((item) => item.id === accountId) ?? (panelAccount?.id === accountId ? panelAccount : undefined);
    if (panel !== "create" && !account) return;
    const open = () => {
      panelDirtyRef.current = false;
      setPanelAccount(account ? { ...account, boundEmployeeIds: [...account.boundEmployeeIds], boundEmployees: [...account.boundEmployees] } : undefined);
      setActivePanel(panel);
    };
    if (!activePanel) {
      dialogOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      open();
    } else {
      destination.current = open;
      requestClose();
    }
  }

  function closePanel() {
    if (panelBusyRef.current) return;
    destination.current = () => { panelDirtyRef.current = false; setActivePanel(null); setPanelAccount(undefined); };
    requestClose();
  }

  function finishPanel() {
    if (!mounted.current || panelBusyRef.current) return;
    panelDirtyRef.current = false;
    setActivePanel(null);
    setPanelAccount(undefined);
  }

  async function runPanelOperation(operation: () => MaybePromise<void>) {
    if (panelBusyRef.current) throw new Error("Операция с аккаунтом уже выполняется.");
    panelBusyRef.current = true;
    setPanelBusy(true);
    try {
      await operation();
      if (mounted.current) panelDirtyRef.current = false;
    } finally {
      panelBusyRef.current = false;
      if (mounted.current) setPanelBusy(false);
    }
  }

  useEffect(() => {
    if (activePanel !== "link" || dataSourceMode !== "api" || employeeDirectory.length > 0 || !panelAccount?.id) {
      return;
    }

    let cancelled = false;
    const repository = createApiMobileAccountsRepository();
    setFallbackEmployeeAccountId(panelAccount.id);
    setFallbackEmployees([]);
    repository
      .getAvailableEmployees(panelAccount.id)
      .then((employees) => {
        if (!cancelled) setFallbackEmployees(employees);
      })
      .catch((error) => {
        if (!cancelled) {
          setFallbackEmployees([]);
          notifyRef.current(error instanceof Error ? error.message : "Не удалось загрузить сотрудников для привязки");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activePanel, dataSourceMode, employeeDirectory.length, panelAccount?.id]);

  function renderPanel(panel: MobileAccountWorkspacePanel) {
    if (panel === "create") {
      return (
        <MobileAccountCreateDrawer
          onSaved={finishPanel}
          onClose={closePanel}
          onDirtyChange={onDirtyChange}
          onCreateAccount={(payload) => runPanelOperation(() => onCreateAccount(payload))}
          onNotify={onNotify}
          selected={panelAccount}
        />
      );
    }

    if (panel === "link") {
      return (
        <MobileAccountLinkPanel
          onSaved={finishPanel}
          employeeDirectory={
            employeeDirectory.length > 0
              ? employeeDirectory
              : fallbackEmployeeAccountId === panelAccount?.id
                ? fallbackEmployees
                : []
          }
          onAttachEmployee={(employeeId, employeeName) => runPanelOperation(() => onAttachEmployee(employeeId, employeeName, panelAccount?.id))}
          onBindEmployees={(employeeIds) => runPanelOperation(() => onBindEmployees(employeeIds, panelAccount?.id))}
          onClose={closePanel}
          onDirtyChange={onDirtyChange}
          onDetachEmployee={(employeeId) => runPanelOperation(() => onDetachEmployee(employeeId, panelAccount?.id))}
          onNotify={onNotify}
          selected={panelAccount}
        />
      );
    }

    if (panel === "edit") {
      return (
        <MobileAccountEditPanel
          onSaved={finishPanel}
          onClose={closePanel}
          onDirtyChange={onDirtyChange}
          onNotify={onNotify}
          onOpenLink={() => openPanel("link")}
          onUpdateAccount={(payload) => runPanelOperation(() => onUpdateAccount(payload, panelAccount?.id))}
          selected={panelAccount}
        />
      );
    }

    if (panel === "delete") {
      return (
        <MobileAccountDeletePanel
          onSaved={finishPanel}
          onClose={closePanel}
          onDeleteAccount={() => runPanelOperation(() => onDeleteAccount(panelAccount?.id))}
          selected={panelAccount}
        />
      );
    }

    return (
      <MobileAccountPasswordPanel
        onSaved={finishPanel}
        onClose={closePanel}
        onNotify={onNotify}
        onResetPassword={() => runPanelOperation(() => onResetPassword(panelAccount?.id))}
        selected={panelAccount}
      />
    );
  }

  return (
    <div className="screen-stack accounts-ui mobile-accounts-workspace">
      <header className="aui-page-head">
        <div><h1>Мобильные аккаунты</h1><p>Доступ сотрудников к мобильному приложению</p></div>
        {canManage ? <button className="aui-button primary" disabled={panelBusy} onClick={() => openPanel("create")} type="button"><Plus aria-hidden="true" size={20} />Создать аккаунт</button> : null}
      </header>
      <MobileAccountListPanel
        activePanel={activePanel} accounts={accounts} canManage={canManage}
        errorMessage={accountListErrorMessage} isBusy={panelBusy} mode={mode}
        selectedAccountId={selectedAccountId} status={accountListStatus}
        sessions={mobileAccountSessions} events={mobileAccountSecurityEvents}
        securityStatus={mobileAccountSecurityStatus} securityErrorMessage={mobileAccountSecurityErrorMessage}
        onRefreshSecurity={onRefreshAccountSecurity} onDeleteAccount={onDeleteAccount}
        onDetachEmployee={(employeeId, accountId) => runPanelOperation(() => onDetachEmployee(employeeId, accountId))}
        onModeChange={onModeChange} onNotify={onNotify} onOpenPanel={openPanel}
        onRetry={onRetryAccounts} onSelectAccount={onSelectAccount}
        onToggleBlockAccount={(accountId) => runPanelOperation(() => onToggleBlockAccount(accountId))}
      />
      {mode === "accounts" || mode === "bindings" ? <MobileAccountActivity
        selected={selected} sessions={mobileAccountSessions} events={mobileAccountSecurityEvents}
        status={mobileAccountSecurityStatus} errorMessage={mobileAccountSecurityErrorMessage}
        onRefresh={onRefreshAccountSecurity} onShowSessions={() => onModeChange("sessions")}
        onShowSecurity={() => onModeChange("security")}
      /> : null}
      {activePanel === "view" ? <MobileAccountDetail
        key={panelAccount?.id} selected={accounts.find((item) => item.id === panelAccount?.id) ?? panelAccount} sessions={mobileAccountSessions} events={mobileAccountSecurityEvents}
        status={mobileAccountSecurityStatus} errorMessage={mobileAccountSecurityErrorMessage}
        onRefresh={onRefreshAccountSecurity} employeeDirectory={employeeDirectory} canManage={canManage}
        restoreFocusRef={dialogOpenerRef} onClose={closePanel} onOpenEdit={() => openPanel("edit")} onOpenLink={() => openPanel("link")}
        onOpenPassword={() => openPanel("password")}
      /> : activePanel ? <AccountDialogHost key={`${activePanel}:${panelAccount?.id ?? "new"}`} title={accountPanelTitles[activePanel]} panel={activePanel} busy={panelBusy} onClose={closePanel} restoreFocusRef={dialogOpenerRef}>{renderPanel(activePanel)}</AccountDialogHost> : null}
      {discardDialog}
    </div>
  );
}
const accountPanelTitles: Record<MobileAccountWorkspacePanel, string> = {
  create: "Создание мобильного аккаунта",
  edit: "Редактирование мобильного аккаунта",
  link: "Привязка сотрудника к мобильному аккаунту",
  password: "Изменение пароля мобильного аккаунта",
  view: "Просмотр мобильного аккаунта",
  delete: "Удаление мобильного аккаунта",
};
