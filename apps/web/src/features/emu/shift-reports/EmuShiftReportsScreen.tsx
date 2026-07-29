import type { SessionUserDto } from "../../../api/contracts";
import { useEmuShiftReportsWorkspace } from "../../../hooks/useEmuShiftReportsWorkspace";
import { hasPermission } from "../../../security/permissions";
import type { EmuScreenId } from "../../../types";
import { ShiftReportEntryScreen } from "./components/ShiftReportEntryScreen";
import { ShiftReportHistoryScreen } from "./components/ShiftReportHistoryScreen";
import "./shift-reports.css";

export function EmuShiftReportsScreen({ currentUser, onNotify, screen }: { currentUser: SessionUserDto | null; onNotify: (message: string) => void; screen: Extract<EmuScreenId, "emu-shift-report-entry" | "emu-shift-report-history"> }) {
  const isHistory = screen === "emu-shift-report-history";
  const permission = isHistory ? "emu.shift-reports.view" : "emu.shift-reports.create";
  const workspace = useEmuShiftReportsWorkspace({ historyEnabled: isHistory, optionsEnabled: !isHistory });

  if (!currentUser || !hasPermission(currentUser, permission)) return <main className="emu-shift-report-page"><section className="emu-shift-card emu-shift-empty" role="alert"><h2>Недостаточно прав</h2><p>Для этого раздела требуется право <code>{permission}</code>.</p></section></main>;
  if (workspace.loading) return <main className="emu-shift-report-page"><section className="emu-shift-card emu-shift-empty emu-shift-loading" aria-live="polite"><span className="emu-loading-mark" aria-hidden="true" /><h2>Загружаем данные ЭМУ</h2><p>Получаем сотрудников, участки и параметры смен.</p></section></main>;
  if (!isHistory && workspace.error) return <main className="emu-shift-report-page"><section className="emu-shift-card emu-shift-empty" role="alert"><h2>Не удалось открыть форму</h2><p>{workspace.error}</p><button type="button" className="emu-refresh-button" onClick={() => window.location.reload()}>Повторить загрузку</button></section></main>;

  return isHistory ? <ShiftReportHistoryScreen workspace={workspace} /> : <ShiftReportEntryScreen workspace={workspace} onNotify={onNotify} />;
}
