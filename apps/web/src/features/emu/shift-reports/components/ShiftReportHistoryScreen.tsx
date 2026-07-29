import { AlertCircle, ChevronRight, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  EmuShiftReportCategory,
  EmuShiftReportDetailDto,
  EmuShiftReportSummaryDto,
  EmuShiftType,
} from "../../../../api/emuShiftReportContracts";
import type { useEmuShiftReportsWorkspace } from "../../../../hooks/useEmuShiftReportsWorkspace";
import { categoryLabels, formatDuration, localDate, shiftLabels } from "../shiftReportUi";

type Workspace = ReturnType<typeof useEmuShiftReportsWorkspace>;
type Group = { category: EmuShiftReportCategory; shift: EmuShiftType };

const groups: Group[] = [
  { category: "mechanic", shift: "day" },
  { category: "mechanic", shift: "night" },
  { category: "electrician", shift: "day" },
  { category: "electrician", shift: "night" },
];

function ReportDetail({ detail, error }: { detail?: EmuShiftReportDetailDto; error?: string }) {
  if (error) {
    return <div className="emu-detail-state error" role="alert"><AlertCircle aria-hidden="true" size={17} />{error}</div>;
  }
  if (!detail) return <div className="emu-detail-state" aria-live="polite">Загружаем список работ…</div>;
  return (
    <div className="emu-history-detail">
      <div className="emu-detail-meta">
        <span>Отчёт составил: <strong>{detail.createdByName}</strong></span>
        <span>Работ: <strong>{detail.workCount}</strong></span>
        <span>Итого: <strong>{formatDuration(detail.totalDurationMinutes)}</strong></span>
      </div>
      <table>
        <thead><tr><th>№</th><th>Выполненная работа</th><th>Время</th><th>Участок</th><th>Примечание</th></tr></thead>
        <tbody>
          {detail.lines.map((line) => (
            <tr key={line.id}>
              <td data-label="№">{line.sequenceNo}</td>
              <td data-label="Работа">{line.workDescription}</td>
              <td data-label="Время">{formatDuration(line.durationMinutes)}</td>
              <td data-label="Участок">{line.sectionName || "—"}</td>
              <td data-label="Примечание">{line.note || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryGroup({
  group,
  rows,
  expanded,
  details,
  detailErrors,
  onToggle,
}: {
  group: Group;
  rows: EmuShiftReportSummaryDto[];
  expanded: Set<string>;
  details: Record<string, EmuShiftReportDetailDto>;
  detailErrors: Record<string, string>;
  onToggle: (item: EmuShiftReportSummaryDto) => void;
}) {
  return (
    <section className="emu-shift-card emu-history-group">
      <header>
        <div><span>{categoryLabels[group.category]}</span><h2>{shiftLabels[group.shift]} смена</h2></div>
        <b aria-label={`${rows.length} отчётов`}>{rows.length}</b>
      </header>
      {rows.length === 0 ? (
        <div className="emu-history-empty"><span>Отчётов нет</span><small>В этой группе пока нет отправленных отчётов.</small></div>
      ) : rows.map((item) => {
        const isExpanded = expanded.has(item.id);
        const panelId = `shift-report-detail-${item.id}`;
        return (
          <article className="emu-history-row" key={item.id}>
            <button
              type="button"
              className="emu-history-summary"
              aria-expanded={isExpanded}
              aria-controls={panelId}
              onClick={() => onToggle(item)}
            >
              <ChevronRight className="chevron" aria-hidden="true" size={20} />
              <span className="employee"><strong>{item.employeeName}</strong><small>{item.position} · {item.department || "Подразделение не указано"}</small></span>
              <span><strong>{item.workCount}</strong><small>работ</small></span>
              <span><strong>{formatDuration(item.totalDurationMinutes)}</strong><small>общее время</small></span>
              <span><strong>{new Date(item.submittedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</strong><small>отправлен</small></span>
            </button>
            {isExpanded ? (
              <div id={panelId} className="emu-history-detail-panel">
                <ReportDetail detail={details[item.id]} error={detailErrors[item.id]} />
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

export function ShiftReportHistoryScreen({ workspace }: { workspace: Workspace }) {
  const [date, setDate] = useState(localDate());
  const [shiftType, setShiftType] = useState<EmuShiftType | "">("");
  const [category, setCategory] = useState<EmuShiftReportCategory | "">("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});

  async function refresh() {
    await workspace.loadHistory({ date, shiftType, workerCategory: category, search: search.trim() });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 250);
    return () => window.clearTimeout(timer);
    // Each filter intentionally starts the same debounced request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, date, search, shiftType, workspace.loadHistory]);

  async function toggle(item: EmuShiftReportSummaryDto) {
    if (expanded.has(item.id)) {
      setExpanded((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      return;
    }
    setExpanded((current) => new Set(current).add(item.id));
    setDetailErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    try {
      await workspace.loadDetail(item.id);
    } catch (reason) {
      setDetailErrors((current) => ({
        ...current,
        [item.id]: reason instanceof Error ? reason.message : "Не удалось загрузить отчёт.",
      }));
    }
  }

  const visibleGroups = groups.filter((group) => (
    (!category || group.category === category) && (!shiftType || group.shift === shiftType)
  ));

  return (
    <main className="emu-shift-report-page">
      <header className="emu-shift-header">
        <div>
          <span>ЭМУ · сменный журнал</span>
          <h1>История сменных отчётов</h1>
          <p>Дневные и ночные отчёты слесарей и электриков за выбранную дату.</p>
        </div>
        <button type="button" className="emu-refresh-button" disabled={workspace.historyLoading} onClick={() => void refresh()}>
          <RefreshCw aria-hidden="true" size={17} />Обновить
        </button>
      </header>

      <section className="emu-shift-card emu-history-filters" aria-label="Фильтры истории">
        <label>Дата<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Смена<select value={shiftType} onChange={(event) => setShiftType(event.target.value as EmuShiftType | "")}><option value="">Все смены</option><option value="day">Дневная</option><option value="night">Ночная</option></select></label>
        <label>Профессия<select value={category} onChange={(event) => setCategory(event.target.value as EmuShiftReportCategory | "")}><option value="">Все профессии</option><option value="mechanic">Слесари</option><option value="electrician">Электрики</option></select></label>
        <label className="search">Поиск<span className="emu-search-control"><Search aria-hidden="true" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Сотрудник, работа, участок" /></span></label>
      </section>

      <div className="emu-history-status" aria-live="polite">
        {workspace.historyLoading ? <span><RefreshCw className="spin" aria-hidden="true" size={16} />Обновляем историю…</span> : null}
        {workspace.error ? <p className="emu-form-error"><AlertCircle aria-hidden="true" size={17} />{workspace.error}<button type="button" onClick={() => void refresh()}>Повторить</button></p> : null}
      </div>

      <div className="emu-history-grid">
        {visibleGroups.map((group) => (
          <HistoryGroup
            key={`${group.category}-${group.shift}`}
            group={group}
            rows={workspace.rows.filter((item) => item.workerCategory === group.category && item.shiftType === group.shift)}
            expanded={expanded}
            details={workspace.details}
            detailErrors={detailErrors}
            onToggle={(item) => void toggle(item)}
          />
        ))}
      </div>
    </main>
  );
}
