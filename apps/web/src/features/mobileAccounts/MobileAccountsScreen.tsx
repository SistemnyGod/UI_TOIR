import { useEffect, useState } from "react";
import {
  MobileAccountCreateDrawer,
  MobileAccountDeletePanel,
  MobileAccountEditPanel,
  MobileAccountLinkPanel,
  MobileAccountPasswordPanel,
  MobileAccountViewPanel,
} from "./components/MobileAccountCreateDrawer";
import { MobileAccountListPanel, type MobileAccountWorkspacePanel } from "./components/MobileAccountListPanel";
import { MobileAccountMetrics } from "./components/MobileAccountMetrics";
import { MobileAccountSecurityPanels } from "./components/MobileAccountSecurityPanels";
import { createApiMobileAccountsRepository } from "../../repositories/mobileAccountsRepository";
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
  onAttachEmployee: (employeeId: string, employeeName: string) => MaybePromise<void>;
  onBindEmployees: (employeeIds: string[]) => MaybePromise<void>;
  onCreateAccount: (payload: CreateMobileAccountPayload) => MaybePromise<void>;
  onDeleteAccount: () => MaybePromise<void>;
  onDetachEmployee: (employeeId?: string, accountId?: string) => MaybePromise<void>;
  onNotify: (message: string) => void;
  onRefreshAccountSecurity: () => MaybePromise<void>;
  onResetPassword: () => MaybePromise<void>;
  onRetryAccounts: () => MaybePromise<void>;
  onToggleBlockAccount: (accountId?: string) => MaybePromise<void>;
  onUpdateAccount: (payload: UpdateMobileAccountPayload) => MaybePromise<void>;
}) {
  const selected = accounts.find((account) => account.id === selectedAccountId);
  const [activePanel, setActivePanel] = useState<MobileAccountWorkspacePanel | null>(null);
  const [fallbackEmployees, setFallbackEmployees] = useState<EmployeeDirectoryItem[]>([]);
  const [fallbackEmployeeAccountId, setFallbackEmployeeAccountId] = useState("");

  useEffect(() => {
    if (accountCreateIntent === 0) return;
    openPanel("create");
  }, [accountCreateIntent]);

  useEffect(() => {
    if (!activePanel) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closePanel();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activePanel]);

  function openPanel(panel: MobileAccountWorkspacePanel) {
    if (!canManage && panel !== "view") {
      onNotify("Недостаточно прав для управления мобильными аккаунтами.");
      return;
    }

    setActivePanel(panel);
  }

  function closePanel() {
    setActivePanel(null);
  }

  useEffect(() => {
    if (activePanel !== "link" || dataSourceMode !== "api" || employeeDirectory.length > 0 || !selected?.id) {
      return;
    }

    let cancelled = false;
    const repository = createApiMobileAccountsRepository();
    setFallbackEmployeeAccountId(selected.id);
    repository
      .getAvailableEmployees(selected.id)
      .then((employees) => {
        if (!cancelled) setFallbackEmployees(employees);
      })
      .catch((error) => {
        if (!cancelled) {
          setFallbackEmployees([]);
          onNotify(error instanceof Error ? error.message : "Не удалось загрузить сотрудников для привязки");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activePanel, dataSourceMode, employeeDirectory.length, onNotify, selected?.id]);

  function renderPanel(panel: MobileAccountWorkspacePanel) {
    if (panel === "create") {
      return (
        <MobileAccountCreateDrawer
          onClose={closePanel}
          onCreateAccount={onCreateAccount}
          onNotify={onNotify}
          selected={selected}
        />
      );
    }

    if (panel === "link") {
      return (
        <MobileAccountLinkPanel
          employeeDirectory={
            employeeDirectory.length > 0
              ? employeeDirectory
              : fallbackEmployeeAccountId === selected?.id
                ? fallbackEmployees
                : []
          }
          onAttachEmployee={onAttachEmployee}
          onBindEmployees={onBindEmployees}
          onClose={closePanel}
          onDetachEmployee={onDetachEmployee}
          onNotify={onNotify}
          selected={selected}
        />
      );
    }

    if (panel === "edit") {
      return (
        <MobileAccountEditPanel
          onClose={closePanel}
          onNotify={onNotify}
          onOpenLink={() => openPanel("link")}
          onUpdateAccount={onUpdateAccount}
          selected={selected}
        />
      );
    }

    if (panel === "view") {
      return (
        <MobileAccountViewPanel
          onClose={closePanel}
          onOpenEdit={() => openPanel("edit")}
          onOpenLink={() => openPanel("link")}
          onOpenPassword={() => openPanel("password")}
          selected={selected}
        />
      );
    }

    if (panel === "delete") {
      return (
        <MobileAccountDeletePanel
          onClose={closePanel}
          onDeleteAccount={onDeleteAccount}
          selected={selected}
        />
      );
    }

    return (
      <MobileAccountPasswordPanel
        onClose={closePanel}
        onNotify={onNotify}
        onResetPassword={onResetPassword}
        selected={selected}
      />
    );
  }

  return (
    <div className="screen-stack mobile-am-screen">
      <header className="mobile-am-page-head">
        <div>
          <h1>Мобильные аккаунты</h1>
          <p>Создавайте, управляйте и контролируйте мобильные аккаунты сотрудников</p>
        </div>
      </header>

      <MobileAccountMetrics accounts={accounts} />

      <MobileAccountListPanel
        activePanel={activePanel}
        accounts={accounts}
        canManage={canManage}
        errorMessage={accountListErrorMessage}
        mode={mode}
        selectedAccountId={selectedAccountId}
        status={accountListStatus}
        onDeleteAccount={onDeleteAccount}
        onDetachEmployee={onDetachEmployee}
        onModeChange={onModeChange}
        onNotify={onNotify}
        onOpenPanel={openPanel}
        onRetry={onRetryAccounts}
        onSelectAccount={onSelectAccount}
        onToggleBlockAccount={onToggleBlockAccount}
      />

      {activePanel ? (
        <div
          aria-label="Окно управления мобильным аккаунтом"
          className="account-panel-dock"
          onMouseDown={closePanel}
          role="presentation"
        >
          <div
            aria-label={accountPanelTitles[activePanel]}
            aria-modal="true"
            className={`account-panel-slot active ${activePanel}`}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            {renderPanel(activePanel)}
          </div>
        </div>
      ) : null}

      <MobileAccountSecurityPanels
        errorMessage={mobileAccountSecurityErrorMessage}
        onNotify={onNotify}
        onRefresh={onRefreshAccountSecurity}
        securityEvents={mobileAccountSecurityEvents}
        sessions={mobileAccountSessions}
        status={mobileAccountSecurityStatus}
      />
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
