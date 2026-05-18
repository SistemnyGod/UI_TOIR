import { useState } from "react";
import { MobileAccountCreateDrawer } from "../components/accounts/MobileAccountCreateDrawer";
import { MobileAccountListPanel } from "../components/accounts/MobileAccountListPanel";
import { MobileAccountMetrics } from "../components/accounts/MobileAccountMetrics";
import { MobileAccountSecurityPanels } from "../components/accounts/MobileAccountSecurityPanels";
import { securityEventsFallback } from "../repositories/mobileAccountsRepository";
import type { AccountMode, CreateMobileAccountPayload, DataSourceStatus, MobileAccount } from "../types";

type MaybePromise<T> = T | Promise<T>;

export function MobileAccountsScreen({
  accountListErrorMessage,
  accountListStatus,
  accounts,
  selectedAccountId,
  mode,
  onModeChange,
  onSelectAccount,
  onAttachEmployee,
  onCreateAccount,
  onDeleteAccount,
  onNotify,
  onResetPassword,
  onRetryAccounts,
}: {
  accountListErrorMessage?: string;
  accountListStatus: DataSourceStatus;
  accounts: MobileAccount[];
  selectedAccountId: string;
  mode: AccountMode;
  onModeChange: (mode: AccountMode) => void;
  onSelectAccount: (id: string) => void;
  onAttachEmployee: (employeeName: string) => MaybePromise<void>;
  onCreateAccount: (payload: CreateMobileAccountPayload) => MaybePromise<void>;
  onDeleteAccount: () => MaybePromise<void>;
  onNotify: (message: string) => void;
  onResetPassword: () => MaybePromise<void>;
  onRetryAccounts: () => MaybePromise<void>;
}) {
  const securityEvents = securityEventsFallback;
  const selected = accounts.find((account) => account.id === selectedAccountId);
  const [employeeNameDraft, setEmployeeNameDraft] = useState("");

  return (
    <div className="screen-stack">
      <MobileAccountMetrics accounts={accounts} />

      <div className="two-column wide-left">
        <MobileAccountListPanel
          accounts={accounts}
          errorMessage={accountListErrorMessage}
          employeeName={employeeNameDraft}
          mode={mode}
          selectedAccountId={selectedAccountId}
          status={accountListStatus}
          onAttachEmployee={onAttachEmployee}
          onDeleteAccount={onDeleteAccount}
          onModeChange={onModeChange}
          onNotify={onNotify}
          onResetPassword={onResetPassword}
          onRetry={onRetryAccounts}
          onSelectAccount={onSelectAccount}
        />
        <MobileAccountCreateDrawer
          onCreateAccount={onCreateAccount}
          onEmployeeNameDraftChange={setEmployeeNameDraft}
          onNotify={onNotify}
          selected={selected}
        />
      </div>

      <MobileAccountSecurityPanels securityEvents={securityEvents} onNotify={onNotify} />
    </div>
  );
}
