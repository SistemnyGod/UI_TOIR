import type { SessionUserDto } from "../api/contracts";
import { useEmuWorkspace } from "../hooks/useEmuWorkspace";
import type { DataSourceMode, EmployeeDirectoryItem, EmuScreenId, ScreenId } from "../types";
import { EmuCompletedWorkHistoryScreen } from "./emu/EmuCompletedWorkHistoryScreen";
import { EmuDashboardScreen } from "./emu/EmuDashboardScreen";
import { EmuWorkAccountingScreen } from "./emu/EmuWorkAccountingScreen";
import "./emu/emu.css";

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
  const workspace = useEmuWorkspace({ dataSourceMode, employeeDirectory });

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
    <div className="emu-shell">
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
