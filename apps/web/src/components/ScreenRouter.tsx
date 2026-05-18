import type {
  AccountMode,
  ActivePatrol,
  CreateMobileAccountPayload,
  DataSourceStatus,
  Metric,
  EmployeeDirectoryItem,
  EmployeeFormPayload,
  MobileAccount,
  MobileAccountSecurityEvent,
  MobileAccountSession,
  ResultMode,
  RouteDirectoryItem,
  RouteFormPayload,
  RouteMode,
  RoutePointFormPayload,
  ScheduleMode,
  ScreenId,
  ServiceRequest,
  UpdateMobileAccountPayload,
} from "../types";
import { AssignmentScreen } from "../screens/AssignmentScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { EmployeesScreen } from "../screens/EmployeesScreen";
import { MobileAccountsScreen } from "../screens/MobileAccountsScreen";
import { ResultsScreen } from "../screens/ResultsScreen";
import { RoutesScreen } from "../screens/RoutesScreen";
import { ScheduleScreen } from "../screens/ScheduleScreen";
import { SiteUsersScreen } from "../screens/SiteUsersScreen";

type MaybePromise<T> = T | Promise<T>;

export function ScreenRouter({
  accountCreateIntent,
  accountMode,
  accountListErrorMessage,
  accountListStatus,
  accounts,
  activePatrols,
  dashboardMetrics,
  employeeDirectory,
  mobileAccountSecurityErrorMessage,
  mobileAccountSecurityEvents,
  mobileAccountSecurityStatus,
  mobileAccountSessions,
  onAccountModeChange,
  onAssign,
  onAttachEmployee,
  onCreateAccount,
  onCreateEmployee,
  onCreateRequest,
  onCreateRoute,
  onCreateRoutePoint,
  onDeleteAccount,
  onDetachEmployee,
  onDeleteEmployee,
  onDeleteRoute,
  onDeleteRoutePoint,
  onNavigate,
  onNotify,
  onOpenRequest,
  onOpenRequestById,
  onRefreshAccountSecurity,
  onResetPassword,
  onRetryAccounts,
  onRetryRequests,
  onResultModeChange,
  onRouteModeChange,
  onScheduleModeChange,
  onSelectAccount,
  onSelectDirectoryEmployee,
  onSelectEmployee,
  onSelectPoint,
  onSelectResult,
  onSelectRoute,
  onSelectRouteDirectory,
  onSelectScheduleCell,
  onSelectUser,
  onToggleBlockAccount,
  onUpdateAccount,
  onUpdateRoute,
  onUpdateRoutePoint,
  onUpdateEmployee,
  onMoveRoutePoint,
  requests,
  requestListErrorMessage,
  requestListStatus,
  resultMode,
  employeeCreateIntent,
  routeCreateIntent,
  routeDirectory,
  routeMode,
  scheduleMode,
  screen,
  selectedAccountId,
  selectedDirectoryEmployeeId,
  selectedEmployeeId,
  selectedPointId,
  selectedResultId,
  selectedRouteDirectoryId,
  selectedRouteId,
  selectedScheduleCellId,
  selectedUserId,
}: {
  accountCreateIntent: number;
  accountMode: AccountMode;
  accountListErrorMessage?: string;
  accountListStatus: DataSourceStatus;
  accounts: MobileAccount[];
  activePatrols: ActivePatrol[];
  dashboardMetrics: Metric[];
  employeeDirectory: EmployeeDirectoryItem[];
  mobileAccountSecurityErrorMessage?: string;
  mobileAccountSecurityEvents: MobileAccountSecurityEvent[];
  mobileAccountSecurityStatus: DataSourceStatus;
  mobileAccountSessions: MobileAccountSession[];
  onAccountModeChange: (mode: AccountMode) => void;
  onAssign: () => void;
  onAttachEmployee: (employeeId: string, employeeName: string) => MaybePromise<void>;
  onCreateAccount: (payload: CreateMobileAccountPayload) => MaybePromise<void>;
  onCreateEmployee: (payload: EmployeeFormPayload) => MaybePromise<string>;
  onCreateRequest: (sourceResultId?: string) => void;
  onCreateRoute: (payload: RouteFormPayload) => MaybePromise<string>;
  onCreateRoutePoint: (routeId: string, payload: RoutePointFormPayload) => MaybePromise<string>;
  onDeleteAccount: () => MaybePromise<void>;
  onDetachEmployee: (employeeId?: string) => MaybePromise<void>;
  onDeleteEmployee: (employeeId: string) => MaybePromise<void>;
  onDeleteRoute: (routeId: string) => MaybePromise<void>;
  onDeleteRoutePoint: (routeId: string, pointId: string) => MaybePromise<void>;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onOpenRequest: (resultId?: string) => void;
  onOpenRequestById: (requestId: string) => void;
  onRefreshAccountSecurity: () => MaybePromise<void>;
  onResetPassword: () => MaybePromise<void>;
  onToggleBlockAccount: () => MaybePromise<void>;
  onRetryAccounts: () => MaybePromise<void>;
  onRetryRequests: () => MaybePromise<void>;
  onResultModeChange: (mode: ResultMode) => void;
  onRouteModeChange: (mode: RouteMode) => void;
  onScheduleModeChange: (mode: ScheduleMode) => void;
  onSelectAccount: (id: string) => void;
  onSelectDirectoryEmployee: (id: string) => void;
  onSelectEmployee: (id: string) => void;
  onSelectPoint: (id: string) => void;
  onSelectResult: (id: string) => void;
  onSelectRoute: (id: string) => void;
  onSelectRouteDirectory: (id: string) => void;
  onSelectScheduleCell: (id: string) => void;
  onSelectUser: (id: string) => void;
  onUpdateRoute: (routeId: string, payload: RouteFormPayload) => MaybePromise<void>;
  onUpdateRoutePoint: (routeId: string, pointId: string, payload: RoutePointFormPayload) => MaybePromise<void>;
  onUpdateEmployee: (employeeId: string, payload: EmployeeFormPayload) => MaybePromise<void>;
  onUpdateAccount: (payload: UpdateMobileAccountPayload) => MaybePromise<void>;
  onMoveRoutePoint: (routeId: string, pointId: string, direction: -1 | 1) => MaybePromise<void>;
  requests: ServiceRequest[];
  requestListErrorMessage?: string;
  requestListStatus: DataSourceStatus;
  resultMode: ResultMode;
  employeeCreateIntent: number;
  routeCreateIntent: number;
  routeDirectory: RouteDirectoryItem[];
  routeMode: RouteMode;
  scheduleMode: ScheduleMode;
  screen: ScreenId;
  selectedAccountId: string;
  selectedDirectoryEmployeeId: string;
  selectedEmployeeId: string;
  selectedPointId: string;
  selectedResultId: string;
  selectedRouteDirectoryId: string;
  selectedRouteId: string;
  selectedScheduleCellId: string;
  selectedUserId: string;
}) {
  return (
    <div className="screen-area">
      {screen === "dashboard" ? (
        <DashboardScreen
          activePatrols={activePatrols}
          dashboardMetrics={dashboardMetrics}
          onCreateRequest={onCreateRequest}
          onNavigate={onNavigate}
          onOpenRequestById={onOpenRequestById}
          onOpenRequest={onOpenRequest}
          onNotify={onNotify}
          routeDirectory={routeDirectory}
          requests={requests}
          requestListErrorMessage={requestListErrorMessage}
          requestListStatus={requestListStatus}
          onRetryRequests={onRetryRequests}
        />
      ) : null}
      {screen === "results" ? (
        <ResultsScreen
          mode={resultMode}
          onModeChange={onResultModeChange}
          selectedResultId={selectedResultId}
          onSelectResult={onSelectResult}
          onCreateRequest={onCreateRequest}
          onOpenRequest={onOpenRequest}
          onNavigate={onNavigate}
          onNotify={onNotify}
        />
      ) : null}
      {screen === "assign" ? (
        <AssignmentScreen
          selectedEmployeeId={selectedEmployeeId}
          selectedRouteId={selectedRouteId}
          onNavigate={onNavigate}
          onNotify={onNotify}
          onSelectEmployee={onSelectEmployee}
          onSelectRoute={onSelectRoute}
          onAssign={onAssign}
        />
      ) : null}
      {screen === "employees" ? (
        <EmployeesScreen
          employees={employeeDirectory}
          employeeCreateIntent={employeeCreateIntent}
          selectedEmployeeId={selectedDirectoryEmployeeId}
          onCreateEmployee={onCreateEmployee}
          onDeleteEmployee={onDeleteEmployee}
          onNavigate={onNavigate}
          onNotify={onNotify}
          onSelectEmployee={onSelectDirectoryEmployee}
          onUpdateEmployee={onUpdateEmployee}
        />
      ) : null}
      {screen === "schedule" ? (
        <ScheduleScreen
          mode={scheduleMode}
          onNotify={onNotify}
          onModeChange={onScheduleModeChange}
          selectedCellId={selectedScheduleCellId}
          onSelectCell={onSelectScheduleCell}
        />
      ) : null}
      {screen === "accounts" ? (
        <MobileAccountsScreen
          accountCreateIntent={accountCreateIntent}
          accounts={accounts}
          accountListErrorMessage={accountListErrorMessage}
          accountListStatus={accountListStatus}
          selectedAccountId={selectedAccountId}
          employeeDirectory={employeeDirectory}
          mobileAccountSecurityErrorMessage={mobileAccountSecurityErrorMessage}
          mobileAccountSecurityEvents={mobileAccountSecurityEvents}
          mobileAccountSecurityStatus={mobileAccountSecurityStatus}
          mobileAccountSessions={mobileAccountSessions}
          mode={accountMode}
          onModeChange={onAccountModeChange}
          onSelectAccount={onSelectAccount}
          onAttachEmployee={onAttachEmployee}
          onCreateAccount={onCreateAccount}
          onDeleteAccount={onDeleteAccount}
          onDetachEmployee={onDetachEmployee}
          onNotify={onNotify}
          onRefreshAccountSecurity={onRefreshAccountSecurity}
          onResetPassword={onResetPassword}
          onRetryAccounts={onRetryAccounts}
          onToggleBlockAccount={onToggleBlockAccount}
          onUpdateAccount={onUpdateAccount}
        />
      ) : null}
      {screen === "routes" ? (
        <RoutesScreen
          selectedRouteId={selectedRouteDirectoryId}
          selectedPointId={selectedPointId}
          mode={routeMode}
          onModeChange={onRouteModeChange}
          onNavigate={onNavigate}
          onNotify={onNotify}
          routeCreateIntent={routeCreateIntent}
          routeDirectory={routeDirectory}
          onSelectRoute={onSelectRouteDirectory}
          onSelectPoint={onSelectPoint}
          onCreateRoute={onCreateRoute}
          onUpdateRoute={onUpdateRoute}
          onDeleteRoute={onDeleteRoute}
          onCreateRoutePoint={onCreateRoutePoint}
          onUpdateRoutePoint={onUpdateRoutePoint}
          onDeleteRoutePoint={onDeleteRoutePoint}
          onMoveRoutePoint={onMoveRoutePoint}
        />
      ) : null}
      {screen === "users" ? (
        <SiteUsersScreen
          selectedUserId={selectedUserId}
          onNotify={onNotify}
          onSelectUser={onSelectUser}
        />
      ) : null}
    </div>
  );
}
