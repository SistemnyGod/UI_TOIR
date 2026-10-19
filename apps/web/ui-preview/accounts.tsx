// Development-only visual fixture. No API requests, credentials or storage writes.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Sidebar } from "../src/app/shell/Sidebar";
import { Topbar } from "../src/app/shell/Topbar";
import { screens } from "../src/data";
import { MobileAccountsScreen } from "../src/features/mobileAccounts/MobileAccountsScreen";
import type { SessionUserDto } from "../src/api/contracts";
import type { AccountMode, EmployeeDirectoryItem, MobileAccount, MobileAccountSession, MobileAccountSecurityEvent } from "../src/types";
import "../src/styles.css";
import "../src/shared/styles/tokens.css";
import "../src/styles/interface-polish.css";
import "../src/shared/styles/foundation.css";
import "../src/styles/non-ppe-ui.css";
import "../src/styles/button-polish.css";
import "../src/styles/sidebar-navigation-polish.css";
import "../src/features/mobileAccounts/mobileAccountsWorkspace.css";

if (!import.meta.env.DEV) throw new Error("The visual fixture is available only in development.");
const names = ["Галактионов Вадим Сергеевич", "Корюков Дмитрий Владимирович", "Костарев Илья Сергеевич", "Хорьков Семен Николаевич"];
const account: MobileAccount = { id: "preview-account", login: "test1", passwordState: "Пароль установлен", employee: names[0], employeeScope: "selected", boundEmployeeIds: names.map((_, i) => `preview-employee-${i}`), boundEmployees: names, role: "Маршрутный обходчик", status: "Активен", session: "Офлайн", lastSeen: "30.09.2026, 16:51", device: "Samsung SM-A576B", version: "0.1.48" };
const employees = names.map((fullName, i) => ({ id: account.boundEmployeeIds[i], fullName, position: i < 2 ? "Слесарь-ремонтник" : "Сотрудник подрядной организации", initials: fullName.split(" ").slice(0, 2).map((word) => word[0]).join(""), personnelNo: `00${i + 1}`, department: "Служба обходов", zone: "Энерго-механический участок", status: "Активен", mobileStatus: "Привязан", routesDone: 1, routesTotal: 2, employeeGroup: "", birthDate: "", lastSeen: "", phone: "", hiredAt: "", brigade: "", shift: "", leader: "", email: "" })) as EmployeeDirectoryItem[];
const sessions: MobileAccountSession[] = Array.from({ length: 7 }, (_, i) => ({ id: `preview-session-${i}`, accountId: account.id, status: "offline", deviceId: i === 1 ? "preview-armor" : "preview-samsung", device: i === 1 ? "Armor C1s" : account.device, platform: "Android", appVersion: i === 1 ? "0.1.32" : "0.1.48", ipAddress: "192.168.2.100", startedAt: `2026-09-${30 - i}T11:42:00Z`, lastSeenAt: i === 0 ? "2026-09-30T11:51:00Z" : i === 1 ? "2026-09-30T11:44:00Z" : `2026-09-${30 - i}T11:50:00Z`, accessExpiresAt: "2026-10-07T11:42:00Z", refreshExpiresAt: "2026-10-29T11:42:00Z" }));
const events: MobileAccountSecurityEvent[] = [
  { id: "preview-login", accountId: account.id, eventType: "mobile_account.login", message: "Вход в приложение с Samsung SM-A576B", createdAt: "2026-09-30T11:42:00Z", actor: "test1" },
  { id: "preview-bind", accountId: account.id, eventType: "mobile_account.employee_attached", message: "Изменены привязки сотрудников", createdAt: "2026-09-28T03:10:00Z", actor: "Администратор" },
  { id: "preview-password", accountId: account.id, eventType: "mobile_account.password_reset", message: "Изменён пароль аккаунта", createdAt: "2026-09-28T03:10:00Z", actor: "Администратор" },
];
const administrator: SessionUserDto = { id: "preview-admin", login: "admin", displayName: "Администратор", roles: ["admin"], permissions: ["mobile_accounts.write", "emu.view", "integrations.perco.view"] };
const preventMutation = async () => { throw new Error("В предпросмотре изменения отключены. Данные сервера не затрагиваются."); };
function Preview() {
  const [mode, setMode] = useState<AccountMode>("accounts");
  const [selected, setSelected] = useState(account.id);
  const [collapsed, setCollapsed] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  return <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""} ${navigationOpen ? "mobile-navigation-open" : ""}`}>
    <Sidebar currentUser={administrator} screens={screens} screen="accounts" sidebarCollapsed={collapsed} mobileOpen={navigationOpen} onCloseMobile={() => setNavigationOpen(false)} onNavigate={() => setNavigationOpen(false)} onToggleCollapsed={() => setCollapsed(!collapsed)} />
    <main className="workspace"><Topbar currentUser={administrator} searchQuery={query} onSearchQueryChange={setQuery} onRunSearch={() => undefined} onNotify={setNotice} onLogout={() => undefined} onOpenNavigation={() => setNavigationOpen(true)} />
      <div className="screen-area"><MobileAccountsScreen accountCreateIntent={0} accountListStatus="ready" accounts={[account]} canManage dataSourceMode="mock" employeeDirectory={employees} mobileAccountSecurityEvents={events} mobileAccountSecurityStatus="ready" mobileAccountSessions={sessions} selectedAccountId={selected} mode={mode} onModeChange={setMode} onSelectAccount={setSelected} onAttachEmployee={preventMutation} onBindEmployees={preventMutation} onCreateAccount={preventMutation} onDeleteAccount={preventMutation} onDetachEmployee={preventMutation} onNotify={setNotice} onRefreshAccountSecurity={() => undefined} onResetPassword={preventMutation} onRetryAccounts={() => undefined} onToggleBlockAccount={preventMutation} onUpdateAccount={preventMutation} /></div>
    </main>
    <small style={{ position: "fixed", bottom: 5, right: 12, color: "#637797", fontSize: 10, pointerEvents: "none" }}>Локальный предпросмотр · тестовые данные</small>
    {notice ? <div className="toast" role="status">{notice}</div> : null}
  </div>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
