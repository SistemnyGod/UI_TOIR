import { Eye } from "lucide-react";
import type { EmuWorkSessionDto } from "../../../api/contracts";
import { normalizeEmuText } from "../../../domain/emuWorkBoard";
import { CompactTable, type CompactTableColumn } from "../../../shared/ui";
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
  const columns: CompactTableColumn<EmuWorkSessionDto>[] = [
    { key: "date", header: "Дата", render: (work) => formatDate(work.workDate), width: "96px" },
    { key: "employee", header: "Сотрудник", render: (work) => formatScopedEmployees(work, employeeId), width: "180px" },
    { key: "section", header: "Участок", render: (work) => normalizeEmuText(work.sectionName), width: "140px" },
    {
      key: "description",
      header: "Описание работы",
      render: (work) => <span className="emu-history-work-description"><strong>{work.taskDescription}</strong><span>{work.workNumber}</span></span>,
      width: "240px",
    },
    { key: "started", header: "Начало", render: (work) => formatTime(work.arrivedAt), width: "88px" },
    { key: "completed", header: "Окончание", render: (work) => work.completedAt ? formatTime(work.completedAt) : "-", width: "104px" },
    { key: "work-time", header: "Активное время", render: (work) => formatMinutes(work.workMinutes), align: "right", width: "112px" },
    { key: "pauses", header: "Паузы", render: (work) => formatMinutes(work.waitingMinutes + work.otherWorkMinutes), align: "right", width: "92px" },
    { key: "status", header: "Статус", render: (work) => <EmuHistoryStatusPill value={operationalStatus(work)} /> },
    { key: "result", header: "Результат", render: (work) => <EmuHistoryStatusPill value={normalizeEmuText(work.resultStatus || "В работе")} /> },
    {
      key: "actions",
      header: "Действия",
      render: () => <button aria-label="Открыть карточку" onClick={(event) => event.stopPropagation()} type="button"><Eye size={16} /></button>,
      align: "center",
      width: "72px",
    },
  ];

  return (
    <CompactTable
      className="emu-history-table-wrap emu-history-compact-table"
      columns={columns}
      emptyText="Работы по текущим фильтрам не найдены"
      getRowClassName={(work) => selectedId === work.id ? "selected" : ""}
      getRowKey={(work) => work.id}
      onRowClick={(work) => setSelectedId(work.id)}
      rows={rows}
    />
  );
}
