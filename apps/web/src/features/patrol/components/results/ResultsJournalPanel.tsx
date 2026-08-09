import { useEffect, useMemo, useState } from "react";
import type { ApiFileResponse } from "../../../../api/client";
import type { ResultFilterOptions } from "../../../../repositories/resultsRepository";
import type { PatrolResult, ResultMode, ScreenId } from "../../../../types";
import { Button, Chip, CompactTable, EmptyState, FilterBar, IconButton, Panel, SectionTabs, type CompactTableColumn } from "../../../../shared/ui";

export function ResultsJournalPanel({
  mode,
  onModeChange,
  onNavigate,
  onNotify,
  onSelectResult,
  results,
  selectedResultId,
  totalResults,
  onExportResults,
  onFiltersChange,
}: {
  mode: ResultMode;
  onModeChange: (mode: ResultMode) => void;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onSelectResult: (id: string) => void;
  results: PatrolResult[];
  selectedResultId: string;
  totalResults: PatrolResult[];
  onExportResults?: () => Promise<ApiFileResponse | undefined>;
  onFiltersChange?: (filters: ResultFilterOptions) => void;
}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [periodDraftFrom, setPeriodDraftFrom] = useState("");
  const [periodDraftTo, setPeriodDraftTo] = useState("");
  const [periodMonth, setPeriodMonth] = useState(() => startOfMonth(new Date()));
  const [territory, setTerritory] = useState("all");
  const [route, setRoute] = useState("all");
  const [shift, setShift] = useState("all");
  const [search, setSearch] = useState("");

  const territories = useMemo(() => uniqueOptions(totalResults.map((result) => result.territory)), [totalResults]);
  const routes = useMemo(() => uniqueRouteOptions(totalResults), [totalResults]);
  const shifts = useMemo(() => uniqueOptions(totalResults.map((result) => result.shift)), [totalResults]);
  const periodCalendarDays = useMemo(() => buildCalendarDays(periodMonth), [periodMonth]);
  const filteredResults = useMemo(
    () =>
      results.filter((result) => {
        const resultDate = toDateKey(result.actualAt);
        const matchesDateFrom = !dateFrom || !resultDate || resultDate >= dateFrom;
        const matchesDateTo = !dateTo || !resultDate || resultDate <= dateTo;
        const matchesTerritory = territory === "all" || result.territory === territory;
        const matchesRoute = route === "all" || result.routeId === route;
        const matchesShift = shift === "all" || result.shift === shift;
        const searchText = [
          result.status,
          result.point,
          result.employee,
          result.route,
          result.territory,
          result.shift,
          result.comment,
          result.issueType,
          result.severity,
          result.assignmentId ?? "",
        ]
          .join(" ")
          .toLowerCase();
        const matchesSearch = !search.trim() || searchText.includes(search.trim().toLowerCase());

        return matchesDateFrom && matchesDateTo && matchesTerritory && matchesRoute && matchesShift && matchesSearch;
      }),
    [dateFrom, dateTo, results, route, search, shift, territory],
  );
  const resultGroups = useMemo(() => buildResultGroups(filteredResults), [filteredResults]);
  const journalRows = useMemo<JournalRow[]>(
    () => resultGroups.flatMap((group) => [
      { group, id: `group:${group.id}` },
      ...group.results.map((result) => ({ group, id: result.id, result })),
    ]),
    [resultGroups],
  );

  const journalColumns: CompactTableColumn<JournalRow>[] = [
    { key: "status", header: "Статус", render: (row) => <Chip>{row.result?.status ?? row.group.status}</Chip>, width: "150px" },
    {
      key: "point",
      header: "Точка",
      render: (row) => row.result ? <span><strong>{row.result.point}</strong><span className="muted-line">ID: {row.result.pointId}</span></span> : <span><strong>{row.group.route}</strong><span className="muted-line">Обход: {formatShortId(row.group.assignmentId)}</span></span>,
      width: "210px",
    },
    { key: "employee", header: "Сотрудник", render: (row) => row.result ? <span><strong>{row.result.employee}</strong><span className="muted-line">ID: {row.result.employeeId}</span></span> : `${row.group.points} точек · ${row.group.issues} замечаний`, width: "210px" },
    { key: "route", header: "Маршрут", render: (row) => row.result?.route ?? row.group.route, width: "180px" },
    { key: "shift", header: "Смена", render: (row) => <Chip>{row.result?.shift ?? row.group.shift}</Chip>, width: "110px" },
    {
      key: "planned",
      header: "План / факт",
      render: (row) => <span>{row.result?.plannedAt ?? row.group.plannedAt}<span className="muted-line">{row.result?.actualAt ?? row.group.actualAt}</span></span>,
      width: "150px",
    },
    { key: "deviation", header: "Отклонение", render: (row) => row.result?.deviation ?? row.group.deviation, width: "120px" },
    { key: "photos", header: "Фото", render: (row) => row.result?.photos ?? row.group.photos, align: "right", width: "75px" },
    { key: "issue", header: "Тип замечания", render: (row) => row.result?.issueType ?? row.group.issueType, width: "150px" },
    { key: "severity", header: "Серьезность", render: (row) => row.result?.severity === "-" || row.group.severity === "-" ? "-" : <Chip>{row.result?.severity ?? row.group.severity}</Chip>, width: "130px" },
    { key: "comment", header: "Комментарий", render: (row) => row.result?.comment ?? row.group.comment, width: "220px" },
  ];

  useEffect(() => {
    onFiltersChange?.({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      routeId: route === "all" ? undefined : route,
    });
  }, [dateFrom, dateTo, onFiltersChange, route]);

  function resetFilters() {
    setDateFrom("");
    setDateTo("");
    setPeriodDraftFrom("");
    setPeriodDraftTo("");
    setPeriodOpen(false);
    setTerritory("all");
    setRoute("all");
    setShift("all");
    setSearch("");
  }

  function openPeriodPicker() {
    setPeriodDraftFrom(dateFrom);
    setPeriodDraftTo(dateTo);
    setPeriodMonth(startOfMonth(parseDateKey(dateFrom || dateTo) ?? new Date()));
    setPeriodOpen(true);
  }

  function applyPeriod() {
    const range = normalizeDateRange(periodDraftFrom, periodDraftTo);
    setDateFrom(range.from);
    setDateTo(range.to);
    setPeriodDraftFrom(range.from);
    setPeriodDraftTo(range.to);
    setPeriodOpen(false);
  }

  function clearPeriod() {
    setPeriodDraftFrom("");
    setPeriodDraftTo("");
    setDateFrom("");
    setDateTo("");
    setPeriodOpen(false);
  }

  function selectPeriodDate(value: string) {
    if (!periodDraftFrom || periodDraftTo) {
      setPeriodDraftFrom(value);
      setPeriodDraftTo("");
      return;
    }

    const range = normalizeDateRange(periodDraftFrom, value);
    setPeriodDraftFrom(range.from);
    setPeriodDraftTo(range.to);
  }

  async function exportCsv() {
    if (filteredResults.length === 0) {
      onNotify("Нет строк для экспорта.");
      return;
    }

    if (onExportResults) {
      const file = await onExportResults();
      if (file) {
        saveApiFile(file);
        notifyApiExport(onNotify, file, filteredResults.length);
        return;
      }
    }

    const csv = toCsv(filteredResults);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `patrol-results-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    onNotify(`Экспортировано строк: ${filteredResults.length}`);
  }

  return (
    <Panel
      title="Журнал результатов"
      note="Фильтры и таблица результатов обходов"
      actions={
        <Button onClick={exportCsv} variant="primary">
          Экспорт
        </Button>
      }
    >
      <SectionTabs
        value={mode}
        onChange={onModeChange}
        tabs={[
          { id: "all", label: "Все", count: totalResults.length },
          { id: "issues", label: "Замечания", count: totalResults.filter((item) => item.status === "Замечание").length },
          { id: "late", label: "Просрочено", count: totalResults.filter((item) => item.status === "Просрочено").length },
          { id: "photos", label: "С фото", count: totalResults.filter((item) => item.photos > 0).length },
        ]}
      />
      <FilterBar ariaLabel="Фильтры журнала результатов" className="filters">
        <div className="date-range-filter">
          <span>Период</span>
          <Button className="date-range-button" onClick={openPeriodPicker} variant="ghost">
            <strong>{formatPeriodLabel(dateFrom, dateTo)}</strong>
            <small>Выбрать</small>
          </Button>
          {periodOpen ? (
            <div className="date-range-popover calendar-popover">
              <div className="date-range-calendar-head">
                <IconButton
                  label="Предыдущий месяц"
                  className="icon-button"
                  onClick={() => setPeriodMonth((current) => addMonths(current, -1))}
                >
                  ‹
                </IconButton>
                <strong>{formatMonthLabel(periodMonth)}</strong>
                <IconButton
                  label="Следующий месяц"
                  className="icon-button"
                  onClick={() => setPeriodMonth((current) => addMonths(current, 1))}
                >
                  ›
                </IconButton>
              </div>
              <div className="date-range-calendar-weekdays" aria-hidden="true">
                {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="date-range-calendar-grid">
                {periodCalendarDays.map((day) => (
                  <button
                    aria-label={formatDateLabel(day.value)}
                    className={getCalendarDayClass(day.value, day.inCurrentMonth, periodDraftFrom, periodDraftTo)}
                    key={day.value}
                    onClick={() => selectPeriodDate(day.value)}
                    type="button"
                  >
                    {day.date.getDate()}
                  </button>
                ))}
              </div>
              <div className="date-range-summary">
                <span>{formatPeriodLabel(periodDraftFrom, periodDraftTo)}</span>
              </div>
              <div className="date-range-actions">
                <Button onClick={clearPeriod} variant="ghost">Очистить</Button>
                <Button onClick={applyPeriod} variant="primary">Применить</Button>
              </div>
            </div>
          ) : null}
        </div>
        <label>
          Территория
          <select onChange={(event) => setTerritory(event.currentTarget.value)} value={territory}>
            <option value="all">Все территории</option>
            {territories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Маршрут
          <select onChange={(event) => setRoute(event.currentTarget.value)} value={route}>
            <option value="all">Все маршруты</option>
            {routes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Смена
          <select onChange={(event) => setShift(event.currentTarget.value)} value={shift}>
            <option value="all">Все смены</option>
            {shifts.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="wide-filter">
          Поиск
          <input
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Точка, сотрудник, маршрут, комментарий"
            value={search}
          />
        </label>
        <Button onClick={resetFilters} variant="ghost">
          Сбросить
        </Button>
      </FilterBar>
      {filteredResults.length > 0 ? (
        <CompactTable
          className="results-journal-compact-table"
          columns={journalColumns}
          emptyText="Результаты по текущим фильтрам не найдены"
          getRowClassName={(row) => row.result && selectedResultId === row.result.id ? "selected" : row.result ? "" : "result-group-row"}
          getRowKey={(row) => row.id}
          onRowClick={(row) => onSelectResult(row.result?.id ?? row.group.firstResultId)}
          rows={journalRows}
        />
      ) : (
        <EmptyState
          title={results.length === 0 ? "Результатов нет" : "По фильтрам ничего не найдено"}
          description={
            results.length === 0
              ? "Таблица заполнится после получения результатов обходов."
              : "Измените фильтры или сбросьте условия поиска."
          }
          action={
            results.length === 0 ? (
              <Button onClick={() => onNavigate("assign")} variant="ghost">Перейти к назначениям</Button>
            ) : (
              <Button onClick={resetFilters} variant="ghost">Сбросить фильтры</Button>
            )
          }
        />
      )}
      <div className="table-footer">
        <span>Показано {filteredResults.length} из {results.length}</span>
        <div className="pagination">
          <button disabled={filteredResults.length === 0} type="button">{"<"}</button>
          <button className="active" type="button">1</button>
          <button disabled type="button">2</button>
          <button disabled type="button">3</button>
          <button disabled={filteredResults.length === 0} type="button">{">"}</button>
        </div>
      </div>
    </Panel>
  );
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) =>
    left.localeCompare(right, "ru"),
  );
}

function uniqueRouteOptions(results: PatrolResult[]) {
  const routes = new Map<string, string>();
  results.forEach((result) => {
    if (result.routeId && result.route.trim()) {
      routes.set(result.routeId, result.route);
    }
  });

  return Array.from(routes.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

function saveApiFile(file: ApiFileResponse) {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function notifyApiExport(onNotify: (message: string) => void, file: ApiFileResponse, fallbackRowCount: number) {
  const metadata = readExportMetadata(file);
  onNotify(
    metadata.truncated
      ? `Экспорт усечен: выгружены первые ${metadata.rowCount ?? metadata.maxRows ?? "доступные"} строк по лимиту ${metadata.maxRows ?? "сервера"}`
      : `Экспорт подготовлен на сервере: ${metadata.rowCount ?? fallbackRowCount}`,
  );
}

function readExportMetadata(file: ApiFileResponse) {
  return {
    maxRows: readIntegerHeader(file, "x-patrol360-export-max-rows"),
    rowCount: readIntegerHeader(file, "x-patrol360-export-row-count"),
    truncated: file.headers["x-patrol360-export-truncated"]?.toLowerCase() === "true",
  };
}

function readIntegerHeader(file: ApiFileResponse, name: string) {
  const value = Number.parseInt(file.headers[name] ?? "", 10);
  return Number.isFinite(value) ? value : undefined;
}

function toDateKey(value: string) {
  const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return "";

  return `${match[3]}-${match[2]}-${match[1]}`;
}

function formatPeriodLabel(dateFrom: string, dateTo: string) {
  if (dateFrom && dateTo) return `${formatDateLabel(dateFrom)} - ${formatDateLabel(dateTo)}`;
  if (dateFrom) return `с ${formatDateLabel(dateFrom)}`;
  if (dateTo) return `по ${formatDateLabel(dateTo)}`;
  return "Все даты";
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function formatMonthLabel(value: Date) {
  const label = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(value);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function parseDateKey(value: string) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, offset: number) {
  return new Date(value.getFullYear(), value.getMonth() + offset, 1);
}

function toDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface CalendarDay {
  date: Date;
  inCurrentMonth: boolean;
  value: string;
}

function buildCalendarDays(month: Date): CalendarDay[] {
  const start = startOfMonth(month);
  const mondayOffset = (start.getDay() + 6) % 7;
  const firstVisibleDate = new Date(start);
  firstVisibleDate.setDate(start.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstVisibleDate);
    date.setDate(firstVisibleDate.getDate() + index);

    return {
      date,
      inCurrentMonth: date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear(),
      value: toDateInputValue(date),
    };
  });
}

function normalizeDateRange(from: string, to: string) {
  if (!from || !to) return { from, to };
  return from <= to ? { from, to } : { from: to, to: from };
}

function getCalendarDayClass(value: string, inCurrentMonth: boolean, from: string, to: string) {
  const range = normalizeDateRange(from, to);
  const classes = ["date-range-calendar-day"];

  if (!inCurrentMonth) classes.push("outside");
  if (value === toDateInputValue(new Date())) classes.push("today");
  if (value === range.from) classes.push("selected", "range-start");
  if (range.to && value === range.to) classes.push("selected", "range-end");
  if (range.from && range.to && value > range.from && value < range.to) classes.push("in-range");

  return classes.join(" ");
}

interface ResultGroup {
  id: string;
  assignmentId?: string;
  actualAt: string;
  deviation: string;
  firstResultId: string;
  issueType: string;
  issues: number;
  comment: string;
  photos: number;
  plannedAt: string;
  points: number;
  results: PatrolResult[];
  route: string;
  severity: PatrolResult["severity"];
  shift: PatrolResult["shift"];
  status: PatrolResult["status"];
}

type JournalRow = {
  group: ResultGroup;
  id: string;
  result?: PatrolResult;
};

function buildResultGroups(results: PatrolResult[]): ResultGroup[] {
  const groups = new Map<string, PatrolResult[]>();

  results.forEach((result) => {
    const key = result.assignmentId ?? result.id;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  });

  return Array.from(groups.entries()).map(([key, groupResults]) => {
    const first = groupResults[0];
    const issueResults = groupResults.filter((result) => result.status === "Замечание" || result.issueType !== "-");

    return {
      id: key,
      assignmentId: first.assignmentId,
      actualAt: first.actualAt,
      deviation: maxDeviation(groupResults),
      firstResultId: first.id,
      issueType: issueResults.length > 0 ? `${issueResults.length} замеч.` : "-",
      issues: issueResults.length,
      comment: firstNonEmpty(groupResults.map((result) => result.comment)),
      photos: groupResults.reduce((total, result) => total + result.photos, 0),
      plannedAt: first.plannedAt,
      points: groupResults.length,
      results: groupResults,
      route: first.route,
      severity: getGroupSeverity(groupResults),
      shift: first.shift,
      status: getGroupStatus(groupResults),
    };
  });
}

function firstNonEmpty(values: string[]) {
  return values.find((value) => value.trim().length > 0) ?? "-";
}

function getGroupStatus(results: PatrolResult[]): PatrolResult["status"] {
  if (results.some((result) => result.status === "Замечание")) return "Замечание";
  if (results.some((result) => result.status === "Просрочено")) return "Просрочено";
  if (results.some((result) => result.status === "Не подтверждено")) return "Не подтверждено";
  return "Подтверждено";
}

function getGroupSeverity(results: PatrolResult[]): PatrolResult["severity"] {
  if (results.some((result) => result.severity === "Высокая")) return "Высокая";
  if (results.some((result) => result.severity === "Средняя")) return "Средняя";
  if (results.some((result) => result.severity === "Низкая")) return "Низкая";
  return "-";
}

function maxDeviation(results: PatrolResult[]) {
  const values = results.map((result) => Number.parseInt(result.deviation, 10)).filter((value) => Number.isFinite(value));
  if (values.length === 0) return "-";

  const max = Math.max(...values);
  return `${max >= 0 ? "+" : ""}${max} мин`;
}

function formatShortId(value?: string) {
  return value ? value.slice(0, 8) : "-";
}

function toCsv(results: PatrolResult[]) {
  const headers = [
    "ID назначения",
    "Статус",
    "Точка",
    "Сотрудник",
    "Маршрут",
    "Территория",
    "Смена",
    "План",
    "Факт",
    "Отклонение",
    "Фото",
    "Тип замечания",
    "Серьезность",
    "Комментарий",
  ];
  const rows = results.map((result) => [
    result.assignmentId ?? "",
    result.status,
    result.point,
    result.employee,
    result.route,
    result.territory,
    result.shift,
    result.plannedAt,
    result.actualAt,
    result.deviation,
    String(result.photos),
    result.issueType,
    result.severity,
    result.comment,
  ]);

  return [headers, ...rows].map((row) => row.map(escapeCsv).join(";")).join("\r\n");
}

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
