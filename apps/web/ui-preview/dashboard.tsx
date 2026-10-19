// Development-only preview of the real dashboard, results and schedule screens.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Sidebar } from "../src/app/shell/Sidebar";
import { Topbar } from "../src/app/shell/Topbar";
import { screens } from "../src/data";
import { DashboardView } from "../src/features/dashboard/DashboardScreen";
import { buildDashboardSummary, dashboardRange, type DashboardPeriod } from "../src/features/dashboard/dashboardSummary";
import { ResultsWorkspace } from "../src/features/patrol/results/ResultsWorkspace";
import { ScheduleScreen } from "../src/features/patrol/ScheduleScreen";
import { RequestViewModal } from "../src/features/patrol/components/requests/RequestViewModal";
import type { SessionUserDto } from "../src/api/contracts";
import type { ScheduleMode, ScreenId } from "../src/types";
import { dashboardPreviewActive as active, dashboardPreviewEmployees as employees, dashboardPreviewNow as now, dashboardPreviewPlans as plans, dashboardPreviewResults as records, dashboardPreviewRoutes as routes } from "./dashboardData";
import "../src/styles.css";
import "../src/shared/styles/tokens.css";
import "../src/styles/interface-polish.css";
import "../src/shared/styles/foundation.css";
import "../src/styles/non-ppe-ui.css";
import "../src/styles/button-polish.css";
import "../src/styles/sidebar-navigation-polish.css";
if (!import.meta.env.DEV) throw new Error("The visual fixture is available only in development.");
const administrator: SessionUserDto = { id: "dashboard-preview-admin", login: "admin", displayName: "Администратор", roles: ["admin"], permissions: [] };
const favoriteEmployeeIds = employees.map((employee) => employee.id);
const readScreen = () => (["dashboard", "results", "schedule"].includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : "dashboard") as ScreenId;
const refresh = async () => undefined;
const rejectMutation = async (): Promise<never> => { throw new Error("Это предпросмотр: заявки и команды не отправляются на сервер."); };

function Preview() {
  const [screen, setScreen] = useState<ScreenId>(readScreen);
  const [period, setPeriod] = useState<DashboardPeriod>("week");
  const [collapsed, setCollapsed] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedResultId, setSelectedResultId] = useState("");
  const [openResultId, setOpenResultId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("week");
  const [selectedCellId, setSelectedCellId] = useState("");
  const range = dashboardRange(period, now);
  useEffect(() => { const onHash = () => { setScreen(readScreen()); setOpenResultId(""); setRequestId(""); }; window.addEventListener("hashchange", onHash); return () => window.removeEventListener("hashchange", onHash); }, []);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 5000); return () => window.clearTimeout(timer); }, [notice]);
  function navigate(next: ScreenId) {
    if (!["dashboard", "results", "schedule"].includes(next)) { window.location.assign(`/#${next}`); return; }
    if (screen !== next) window.history.pushState(null, "", `#${next}`);
    setScreen(next); setNavigationOpen(false); setRequestId(""); setOpenResultId("");
  }
  function openResult(id: string) { navigate("results"); setSelectedResultId(id); setOpenResultId(id); }
  const request = plans.find((item) => item.id === requestId);
  return <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""} ${navigationOpen ? "mobile-navigation-open" : ""}`}>
    <Sidebar currentUser={administrator} screens={screens} screen={screen} sidebarCollapsed={collapsed} mobileOpen={navigationOpen} onCloseMobile={() => setNavigationOpen(false)} onNavigate={navigate} onToggleCollapsed={() => setCollapsed(!collapsed)} />
    <main className="workspace"><Topbar currentUser={administrator} searchQuery={query} onSearchQueryChange={setQuery} onRunSearch={() => setNotice("Поиск доступен в основном приложении")} onNotify={setNotice} onLogout={() => undefined} onOpenNavigation={() => setNavigationOpen(true)} />
      <div className="screen-area">
        {screen === "dashboard" ? <DashboardView dataSourceMode="mock" activePatrols={active} period={period} onPeriodChange={setPeriod} range={range} summary={buildDashboardSummary(records, range)} hasResults resultsLoading={false} refreshedAt={now} onRefreshResults={refresh} requests={plans} requestListStatus="ready" onRetryRequests={refresh} selectedResultId={selectedResultId} onSelectResult={setSelectedResultId} onNavigate={navigate} onQuickAssign={() => navigate("assign")} onCreateRequest={() => navigate("assign")} onNotify={setNotice} onOpenResult={openResult} onOpenRequestById={setRequestId} /> : null}
        {screen === "results" ? <ResultsWorkspace dataSourceMode="mock" mockResults={records} selectedResultId={selectedResultId} openResultId={openResultId} onOpenResultHandled={() => setOpenResultId("")} onSelectResult={setSelectedResultId} onNavigate={navigate} onCreateRequest={() => navigate("assign")} onNotify={setNotice} canManageResults={false} routeDirectory={routes} requests={plans} onOpenResult={openResult} addToast={setNotice} /> : null}
        {screen === "schedule" ? <><header className="page-header"><h1>Плановый обход</h1></header><ScheduleScreen activePatrols={active} dataSourceMode="mock" employeeDirectory={employees} favoriteEmployeeIds={favoriteEmployeeIds} routeDirectory={routes} requests={plans} patrolResults={records} mode={scheduleMode} onModeChange={setScheduleMode} selectedCellId={selectedCellId} onSelectCell={setSelectedCellId} onNotify={setNotice} onOpenRequestById={setRequestId} onCreateScheduledRequest={rejectMutation} onRunAssignmentCommand={rejectMutation} /></> : null}
      </div>
    </main>
    {request ? <RequestViewModal request={request} onClose={() => setRequestId("")} onCreateRelated={() => navigate("assign")} /> : null}
    <small style={{ position: "fixed", bottom: 5, right: 16, color: "#6b7d9f", fontSize: 11, pointerEvents: "none" }}>Демонстрационные данные · 02.10.2026, 10:24</small>
    {notice ? <div className="toast" role="status">{notice}</div> : null}
  </div>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
