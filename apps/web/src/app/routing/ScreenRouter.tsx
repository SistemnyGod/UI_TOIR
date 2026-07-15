import { lazy, Suspense, useEffect, useState } from "react";
import type {
  AccountMode,
  ActivePatrol,
  CompleteAssignmentPayload,
  CreateMobileAccountPayload,
  CreateServiceRequestPayload,
  DataSourceMode,
  DataSourceStatus,
  EmuScreenId,
  Metric,
  EmployeeDirectoryItem,
  EmployeeFormPayload,
  InventoryScreenId,
  MobileAccount,
  MobileAccountSecurityEvent,
  MobileAccountSession,
  PatrolResult,
  ResultMode,
  RouteDirectoryItem,
  RouteFormPayload,
  RouteMode,
  RoutePointFormPayload,
  ScheduleMode,
  ScreenId,
  ServiceRequest,
  UpdateMobileAccountPayload,
} from "../../types";
import type { SessionUserDto } from "../../api/contracts";
import { hasPermission } from "../../security/permissions";
import { PageTransition, RouteLoadingBar, SkeletonCards, SkeletonForm, SkeletonPreview, SkeletonTable } from "../../shared/ui";

type MaybePromise<T> = T | Promise<T>;

const AssignmentScreen = lazy(() => import("../../features/patrol/AssignmentScreen").then((module) => ({ default: module.AssignmentScreen })));
const DashboardScreen = lazy(() => import("../../features/dashboard/DashboardScreen").then((module) => ({ default: module.DashboardScreen })));
const EmployeesScreen = lazy(() => import("../../features/patrol/EmployeesScreen").then((module) => ({ default: module.EmployeesScreen })));
const EmuScreen = lazy(() => import("../../features/emu/EmuScreen").then((module) => ({ default: module.EmuScreen })));
const InventoryScreen = lazy(() => import("../../features/inventory/InventoryScreen").then((module) => ({ default: module.InventoryScreen })));
const MobileAccountsScreen = lazy(() => import("../../features/mobileAccounts/MobileAccountsScreen").then((module) => ({ default: module.MobileAccountsScreen })));
const PercoIntegrationScreen = lazy(() => import("../../features/perco/PercoIntegrationScreen").then((module) => ({ default: module.PercoIntegrationScreen })));
const ResultsScreen = lazy(() => import("../../features/patrol/ResultsScreen").then((module) => ({ default: module.ResultsScreen })));
const RoutesScreen = lazy(() => import("../../features/patrol/RoutesScreen").then((module) => ({ default: module.RoutesScreen })));
const ScheduleScreen = lazy(() => import("../../features/patrol/ScheduleScreen").then((module) => ({ default: module.ScheduleScreen })));
const SiteUsersScreen = lazy(() => import("../../features/users/SiteUsersScreen").then((module) => ({ default: module.SiteUsersScreen })));

const inventoryScreens = new Set<ScreenId>([
  "inventory-overview",
  "inventory-employees",
  "inventory-items",
  "inventory-issue",
  "inventory-operations",
  "inventory-custody",
  "inventory-ppe",
  "inventory-history",
  "inventory-reports",
  "inventory-users",
  "inventory-settings",
  "inventory-system-log",
]);

const emuScreens = new Set<ScreenId>(["emu-dashboard", "emu-work-accounting", "emu-completed-work-history"]);

function isInventoryScreen(screen: ScreenId): screen is InventoryScreenId {
  return inventoryScreens.has(screen);
}

function isEmuScreen(screen: ScreenId): screen is EmuScreenId {
  return emuScreens.has(screen);
}

function ScreenSkeleton({ screen }: { screen: ScreenId }) {
  const isPreviewLike = screen === "inventory-ppe" || screen === "inventory-reports" || screen === "results";
  const isFormLike = screen === "assign" || screen === "schedule" || screen === "routes";

  return (
    <div className="screen-loading screen-skeleton" aria-label="Загрузка раздела">
      <SkeletonCards cards={isPreviewLike ? 5 : 4} />
      <div className="screen-skeleton-grid">
        <SkeletonTable rows={isFormLike ? 5 : 7} columns={isPreviewLike ? 7 : 5} />
        {isPreviewLike ? <SkeletonPreview /> : <SkeletonForm fields={5} />}
      </div>
    </div>
  );
}

export function ScreenRouter({
  accountCreateIntent,
  assignmentCreateIntent,
  accountMode,
  accountListErrorMessage,
  accountListStatus,
  accounts,
  activePatrols,
  currentUser,
  dataSourceMode,
  dashboardMetrics,
  employeeDirectory,
  mobileAccountSecurityErrorMessage,
  mobileAccountSecurityEvents,
  mobileAccountSecurityStatus,
  mobileAccountSessions,
  onAccountModeChange,
  onAttachEmployee,
  onBindEmployees,
  onCreateAccount,
  onCreateEmployee,
  onCreateRequest,
  onCreateScheduledRequest,
  onCreateRoute,
  onCreateRouteWithPoints,
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
  onRefreshPatrolData,
  onResetPassword,
  onRetryAccounts,
  onRetryRequests,
  onResultModeChange,
  onRouteModeChange,
  onRunScheduleAssignmentCommand,
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
  onShowTemporaryPassword,
  onToggleBlockAccount,
  onUpdateAccount,
  onUpdateRoute,
  onUpdateRoutePoint,
  onUpdateEmployee,
  onMoveRoutePoint,
  requests,
  requestListErrorMessage,
  requestListStatus,
  patrolResults,
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
  assignmentCreateIntent: number;
  accountMode: AccountMode;
  accountListErrorMessage?: string;
  accountListStatus: DataSourceStatus;
  accounts: MobileAccount[];
  activePatrols: ActivePatrol[];
  currentUser: SessionUserDto | null;
  dataSourceMode: DataSourceMode;
  dashboardMetrics: Metric[];
  employeeDirectory: EmployeeDirectoryItem[];
  mobileAccountSecurityErrorMessage?: string;
  mobileAccountSecurityEvents: MobileAccountSecurityEvent[];
  mobileAccountSecurityStatus: DataSourceStatus;
  mobileAccountSessions: MobileAccountSession[];
  onAccountModeChange: (mode: AccountMode) => void;
  onAttachEmployee: (employeeId: string, employeeName: string) => MaybePromise<void>;
  onBindEmployees: (employeeIds: string[]) => MaybePromise<void>;
  onCreateAccount: (payload: CreateMobileAccountPayload) => MaybePromise<void>;
  onCreateEmployee: (payload: EmployeeFormPayload) => MaybePromise<string>;
  onCreateRequest: (sourceResultId?: string) => void;
  onCreateScheduledRequest: (payload: CreateServiceRequestPayload) => MaybePromise<ServiceRequest>;
  onCreateRoute: (payload: RouteFormPayload) => MaybePromise<string>;
  onCreateRouteWithPoints: (routePayload: RouteFormPayload, pointPayloads: RoutePointFormPayload[]) => MaybePromise<string>;
  onCreateRoutePoint: (routeId: string, payload: RoutePointFormPayload) => MaybePromise<string>;
  onDeleteAccount: () => MaybePromise<void>;
  onDetachEmployee: (employeeId?: string, accountId?: string) => MaybePromise<void>;
  onDeleteEmployee: (employeeId: string) => MaybePromise<void>;
  onDeleteRoute: (routeId: string) => MaybePromise<void>;
  onDeleteRoutePoint: (routeId: string, pointId: string) => MaybePromise<void>;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onOpenRequest: (resultId?: string) => void;
  onOpenRequestById: (requestId: string) => void;
  onRefreshAccountSecurity: () => MaybePromise<void>;
  onRefreshPatrolData: () => Promise<void>;
  onResetPassword: () => MaybePromise<void>;
  onToggleBlockAccount: (accountId?: string) => MaybePromise<void>;
  onRetryAccounts: () => MaybePromise<void>;
  onRetryRequests: () => MaybePromise<void>;
  onResultModeChange: (mode: ResultMode) => void;
  onRouteModeChange: (mode: RouteMode) => void;
  onRunScheduleAssignmentCommand: (assignmentId: string, command: "start" | "cancel" | "complete", payload?: CompleteAssignmentPayload) => MaybePromise<void>;
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
  onShowTemporaryPassword: (notice: { accountLogin: string; password: string; title: string }) => void;
  onUpdateRoute: (routeId: string, payload: RouteFormPayload) => MaybePromise<void>;
  onUpdateRoutePoint: (routeId: string, pointId: string, payload: RoutePointFormPayload) => MaybePromise<void>;
  onUpdateEmployee: (employeeId: string, payload: EmployeeFormPayload) => MaybePromise<void>;
  onUpdateAccount: (payload: UpdateMobileAccountPayload) => MaybePromise<void>;
  onMoveRoutePoint: (routeId: string, pointId: string, direction: -1 | 1) => MaybePromise<void>;
  requests: ServiceRequest[];
  requestListErrorMessage?: string;
  requestListStatus: DataSourceStatus;
  patrolResults: PatrolResult[];
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
  const [routePending, setRoutePending] = useState(false);

  useEffect(() => {
    setRoutePending(true);
    const timeoutId = window.setTimeout(() => setRoutePending(false), 220);
    return () => window.clearTimeout(timeoutId);
  }, [screen]);

  return (
    <div className="screen-area">
      <RouteLoadingBar active={routePending} />
      <Suspense fallback={<ScreenSkeleton screen={screen} />}>
        <PageTransition key={screen} screenKey={screen}>
        {screen === "dashboard" ? (
          <DashboardScreen
            activePatrols={activePatrols}
            dashboardMetrics={dashboardMetrics}
            dataSourceMode={dataSourceMode}
            employeeDirectory={employeeDirectory}
            onCreateRequest={onCreateRequest}
            onNavigate={onNavigate}
            onOpenRequestById={onOpenRequestById}
            onOpenRequest={onOpenRequest}
            onNotify={onNotify}
            onSelectResult={onSelectResult}
            routeDirectory={routeDirectory}
            requests={requests}
            selectedResultId={selectedResultId}
            requestListErrorMessage={requestListErrorMessage}
            requestListStatus={requestListStatus}
            onRetryRequests={onRetryRequests}
          />
        ) : null}
        {screen === "results" ? (
          <ResultsScreen
            canCreateRequest={hasPermission(currentUser, "requests.write")}
            dataSourceMode={dataSourceMode}
            mode={resultMode}
            onModeChange={onResultModeChange}
            selectedResultId={selectedResultId}
            onSelectResult={onSelectResult}
            onCreateRequest={onCreateRequest}
            onOpenRequest={onOpenRequest}
            onNavigate={onNavigate}
            onNotify={onNotify}
            routeDirectory={routeDirectory}
          />
        ) : null}
        {screen === "assign" ? (
          <AssignmentScreen
            activePatrols={activePatrols}
            assignmentCreateIntent={assignmentCreateIntent}
            canManage={hasPermission(currentUser, "assignments.write")}
            dataSourceMode={dataSourceMode}
            employeeDirectory={employeeDirectory}
            refreshPatrolData={onRefreshPatrolData}
            requestListErrorMessage={requestListErrorMessage}
            requestListStatus={requestListStatus}
            requests={requests}
            routeDirectory={routeDirectory}
            selectedEmployeeId={selectedEmployeeId}
            selectedRouteId={selectedRouteId}
            onOpenRequestById={onOpenRequestById}
            onRefreshRequests={onRetryRequests}
            onNavigate={onNavigate}
            onNotify={onNotify}
            onCreatePatrolRequest={onCreateScheduledRequest}
            onSelectEmployee={onSelectEmployee}
            onSelectRoute={onSelectRoute}
          />
        ) : null}
        {screen === "employees" ? (
          <EmployeesScreen
            canManage={hasPermission(currentUser, "employees.write")}
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
            activePatrols={activePatrols}
            canManage={hasPermission(currentUser, "schedule.write")}
            dataSourceMode={dataSourceMode}
            employeeDirectory={employeeDirectory}
            mode={scheduleMode}
            patrolResults={patrolResults}
            requests={requests}
            routeDirectory={routeDirectory}
            onCreateScheduledRequest={onCreateScheduledRequest}
            onNotify={onNotify}
            onModeChange={onScheduleModeChange}
            onOpenRequestById={onOpenRequestById}
            onRunAssignmentCommand={onRunScheduleAssignmentCommand}
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
            dataSourceMode={dataSourceMode}
            employeeDirectory={employeeDirectory}
            mobileAccountSecurityErrorMessage={mobileAccountSecurityErrorMessage}
            mobileAccountSecurityEvents={mobileAccountSecurityEvents}
            mobileAccountSecurityStatus={mobileAccountSecurityStatus}
            mobileAccountSessions={mobileAccountSessions}
            mode={accountMode}
            onModeChange={onAccountModeChange}
            onSelectAccount={onSelectAccount}
            onAttachEmployee={onAttachEmployee}
            onBindEmployees={onBindEmployees}
            onCreateAccount={onCreateAccount}
            onDeleteAccount={onDeleteAccount}
            onDetachEmployee={onDetachEmployee}
            canManage={hasPermission(currentUser, "mobile_accounts.write")}
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
            canManage={hasPermission(currentUser, "routes.write")}
            canAssign={hasPermission(currentUser, "assignments.write")}
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
            onCreateRouteWithPoints={onCreateRouteWithPoints}
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
            canManage={hasPermission(currentUser, "site_users.write")}
            dataSourceMode={dataSourceMode}
            selectedUserId={selectedUserId}
            onNotify={onNotify}
            onSelectUser={onSelectUser}
            onShowTemporaryPassword={onShowTemporaryPassword}
          />
        ) : null}
        {screen === "perco-integration" ? (
          <PercoIntegrationScreen
            currentUser={currentUser}
            employeeDirectory={employeeDirectory}
            onNotify={onNotify}
          />
        ) : null}
        {isInventoryScreen(screen) ? (
          <InventoryScreen
            currentUser={currentUser}
            dataSourceMode={dataSourceMode}
            screen={screen}
            onNavigate={onNavigate}
            onNotify={onNotify}
          />
        ) : null}
        {isEmuScreen(screen) ? (
          <EmuScreen
            currentUser={currentUser}
            dataSourceMode={dataSourceMode}
            employeeDirectory={employeeDirectory}
            onNotify={onNotify}
            screen={screen}
          />
        ) : null}
        </PageTransition>
      </Suspense>
    </div>
  );
}
