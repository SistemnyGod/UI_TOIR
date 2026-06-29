import { Eye } from "lucide-react";
import type { EmuWorkSessionDto } from "../../../api/contracts";
import { normalizeEmuText } from "../../../domain/emuWorkBoard";
import { EmuHistoryStatusPill } from "./EmuHistoryStatusPill";
import { formatDate, formatMinutes, formatScopedEmployees, formatTime, operationalStatus } from "./emuHistoryUtils";

export function EmuHistoryWorkTable({
  employeeId = "",
  rows,
  selectedId,
  setSelectedId,
}: {
  employeeId?: string;
  rows: EmuWorkSessionDto[];
  selectedId: string;
  setSelectedId: (id: string) => void;
}) {
  return (
    <div className="emu-history-table-wrap">
      <table className="emu-history-data-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Сотрудник</th>
            <th>Участок</th>
            <th>Описание работы</th>
            <th>Начало</th>
            <th>Окончание</th>
            <th>Активное время</th>
            <th>Паузы</th>
            <th>Статус</th>
            <th>Результат</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((work) => (
            <tr className={selectedId === work.id ? "selected" : ""} key={work.id} onClick={() => setSelectedId(work.id)}>
              <td>{formatDate(work.workDate)}</td>
              <td>{formatScopedEmployees(work, employeeId)}</td>
              <td>{normalizeEmuText(work.sectionName)}</td>
              <td><strong>{work.taskDescription}</strong><span>{work.workNumber}</span></td>
              <td>{formatTime(work.arrivedAt)}</td>
              <td>{work.completedAt ? formatTime(work.completedAt) : "-"}</td>
              <td>{formatMinutes(work.workMinutes)}</td>
              <td>{formatMinutes(work.waitingMinutes + work.otherWorkMinutes)}</td>
              <td><EmuHistoryStatusPill value={operationalStatus(work)} /></td>
              <td><EmuHistoryStatusPill value={normalizeEmuText(work.resultStatus || "В работе")} /></td>
              <td><button aria-label="Открыть карточку" type="button"><Eye size={16} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <div className="emu-empty-state">Работы по текущим фильтрам не найдены</div> : null}
    </div>
  );
}
