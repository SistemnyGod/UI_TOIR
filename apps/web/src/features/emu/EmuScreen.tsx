import type { SessionUserDto } from "../../api/contracts";
import { useEmuWorkspace } from "../../hooks/useEmuWorkspace";
import { hasPermission } from "../../security/permissions";
import type { DataSourceMode, EmployeeDirectoryItem, EmuScreenId, ScreenId } from "../../types";
import { EmuCompletedWorkHistoryScreen } from "./EmuCompletedWorkHistoryScreen";
import { EmuDashboardScreen } from "./EmuDashboardScreen";
import { EmuWorkAccountingScreen } from "./EmuWorkAccountingScreen";
import "./emu.css";

const emuScreenIds = new Set<ScreenId>(["emu-dashboard", "emu-work-accounting", "emu-completed-work-history"]);

export function EmuScreen({
  currentUser,
  dataSourceMode,
  employeeDirectory,
  onNotify,
  screen,
}: {
  currentUser: SessionUserDto | null;
  dataSourceMode: DataSourceMode;
  employeeDirectory: EmployeeDirectoryItem[];
  onNotify: (message: string) => void;
  screen: EmuScreenId;
}) {
  const workspace = useEmuWorkspace({ currentUser, dataSourceMode, employeeDirectory });
  const requiredPermissionByScreen = {
    "emu-dashboard": "emu.dashboard.view",
    "emu-work-accounting": "emu.work-accounting.view",
    "emu-completed-work-history": "emu.history.view",
  } as const;
  const requiredPermission = requiredPermissionByScreen[screen];

  if (dataSourceMode === "api" && !currentUser) {
    return (
      <div className="emu-shell">
        <section className="emu-page">
          <div className="emu-panel emu-empty-state">
            <strong>Требуется вход в API</strong>
            <span>Экраны ЭМУ работают с backend-данными. Войдите в систему, чтобы загрузить дашборд, карточки работ и историю.</span>
          </div>
        </section>
      </div>
    );
  }

  if (dataSourceMode === "api" && !hasPermission(currentUser, requiredPermission)) {
    return (
      <div className="emu-shell">
        <section className="emu-page">
          <div className="emu-panel emu-empty-state">
            <strong>Недостаточно прав для раздела ЭМУ</strong>
            <span>Для открытия этой вкладки требуется право {requiredPermission}.</span>
          </div>
        </section>
      </div>
    );
  }

  if (workspace.loading && workspace.sourceMode === "api") {
    return (
      <div className="emu-shell">
        <section className="emu-page">
          <div className="emu-panel emu-empty-state">
            <strong>Загружаем данные ЭМУ из backend</strong>
            <span>Получаем настройки, активные работы, недельный план и историю изменений.</span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      className={`emu-shell ${
        screen === "emu-dashboard" ? "emu-shell-dashboard" : ""
      } ${screen === "emu-work-accounting" ? "emu-shell-work-accounting" : ""}`}
    >
      {screen === "emu-dashboard" ? (
        <EmuDashboardScreen employeeDirectory={employeeDirectory} onNotify={onNotify} workspace={workspace} />
      ) : null}
      {screen === "emu-work-accounting" ? (
        <EmuWorkAccountingScreen
          currentUser={currentUser}
          employeeDirectory={employeeDirectory}
          onNotify={onNotify}
          workspace={workspace}
        />
      ) : null}
      {screen === "emu-completed-work-history" ? (
        <EmuCompletedWorkHistoryScreen
          currentUser={currentUser}
          employeeDirectory={employeeDirectory}
          onNotify={onNotify}
          workspace={workspace}
        />
      ) : null}
    </div>
  );
}

export function isEmuScreen(screen: ScreenId): screen is EmuScreenId {
  return emuScreenIds.has(screen);
}
