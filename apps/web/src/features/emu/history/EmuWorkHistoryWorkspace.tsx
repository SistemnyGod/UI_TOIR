import { useEffect, useMemo, useState } from "react";
import {
  Clock3,
  Grid3X3,
  LayoutList,
  UserRound,
  UsersRound,
} from "lucide-react";
import type {
  EmuAuditEventDto,
  EmuEmployeeShiftIntervalDto,
  EmuEmployeeShiftSummaryDto,
  EmuEmployeeWorkHistoryReportDto,
  EmuEmployeeWorkReportDto,
  EmuListResponseDto,
  EmuSectionWorkReportDto,
  EmuWorkHistoryReportDto,
  EmuWorkHistoryExceptionDto,
  EmuWorkSessionDto,
  EmuWorkSessionEmployeeDto,
  SessionUserDto,
} from "../../../api/contracts";
import { buildEmuHistoryCsv, normalizeEmuText, sortEmuHistoryRows } from "../../../domain/emuWorkBoard";
import type { EmuWorkspace } from "../../../hooks/useEmuWorkspace";
import { useStoredState } from "../../../hooks/useStoredState";
import { hasPermission } from "../../../security/permissions";
import type { EmployeeDirectoryItem } from "../../../types";
import { EmuHistoryFilters } from "./EmuHistoryFilters";
import { EmuHistoryKpiStrip } from "./EmuHistoryKpiStrip";
import { EmuHistoryRightPanel } from "./EmuHistoryRightPanel";
import { EmuHistoryStatusPill } from "./EmuHistoryStatusPill";
import { EmuHistoryTabs } from "./EmuHistoryTabs";
import { EmuHistoryWorkTable } from "./EmuHistoryWorkTable";
import { statusFilterOptions, type DisplayMode, type EmuHistoryPreferences, type HistoryView } from "./emuHistoryTypes";
import { formatDate, formatDateTime, formatMinutes, formatScopedEmployees, formatTime, initials, operationalStatus } from "./emuHistoryUtils";

const emuHistoryPreferencesKey = "patrol360.emu.history.preferences.v1";

export function EmuWorkHistoryWorkspace({
  currentUser,
  employeeDirectory,
  onNotify,
  workspace,
}: {
  currentUser: SessionUserDto | null;
  employeeDirectory: EmployeeDirectoryItem[];
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [preferences, setPreferences] = useStoredState<EmuHistoryPreferences>(
    emuHistoryPreferencesKey,
    createDefaultEmuHistoryPreferences(today),
    { validate: isEmuHistoryPreferences, version: 1 },
  );
  const [dateFrom, setDateFrom] = useState(preferences.dateFrom || today);
  const [dateTo, setDateTo] = useState(preferences.dateTo || today);
  const [employeeId, setEmployeeId] = useState(preferences.employeeId);
  const [employeeSearch, setEmployeeSearch] = useState(preferences.employeeSearch || "");
  const [sectionId, setSectionId] = useState(preferences.sectionId);
  const [shiftType, setShiftType] = useState<"" | "day" | "night">(preferences.shiftType || "");
  const [waitReasonId, setWaitReasonId] = useState(preferences.waitReasonId);
  const [notCompletedReasonId, setNotCompletedReasonId] = useState(preferences.notCompletedReasonId);
  const [status, setStatus] = useState(preferences.status);
  const [sortBy, setSortBy] = useState(preferences.sortBy || "date");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(preferences.pageSize || 25);
  const [problemOnly, setProblemOnly] = useState(preferences.problemOnly);
  const [manualCorrectionsOnly, setManualCorrectionsOnly] = useState(preferences.manualCorrectionsOnly);
  const [includeDeleted, setIncludeDeleted] = useState(preferences.includeDeleted);
  const [selectedId, setSelectedId] = useState("");
  const [activeView, setActiveView] = useState<HistoryView>(preferences.activeView);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(preferences.displayMode);
  const [reportRows, setReportRows] = useState<EmuWorkSessionDto[]>(workspace.workSessions.rows);
  const [reportSnapshot, setReportSnapshot] = useState<EmuWorkHistoryReportDto | null>(null);
  const [appliedQuery, setAppliedQuery] = useState<ReturnType<typeof buildHistoryQuery> | null>(null);
  const [pagedResult, setPagedResult] = useState<EmuListResponseDto<EmuWorkSessionDto>>(workspace.workSessions);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedSectionId, setExpandedSectionId] = useState("");
  const [sectionWorkResults, setSectionWorkResults] = useState<Record<string, EmuListResponseDto<EmuWorkSessionDto>>>({});
  const [sectionWorkLoadingId, setSectionWorkLoadingId] = useState("");
  const [employeeReportId, setEmployeeReportId] = useState("");
  const [employeeReport, setEmployeeReport] = useState<EmuEmployeeWorkHistoryReportDto | null>(null);
  const [employeeReportLoading, setEmployeeReportLoading] = useState(false);
  const [auditRows, setAuditRows] = useState<EmuAuditEventDto[]>([]);
  const [employeeMonth, setEmployeeMonth] = useState(preferences.employeeMonth || today.slice(0, 7));
  const [monthEmployeeId, setMonthEmployeeId] = useState("");
  const [monthSummaries, setMonthSummaries] = useState<EmuEmployeeShiftSummaryDto[]>([]);
  const [monthLoading, setMonthLoading] = useState(false);
  const [selectedMonthDate, setSelectedMonthDate] = useState("");

  const canSeeDeleted = hasPermission(currentUser, "emu.completed.delete") || hasPermission(currentUser, "emu.audit.view");
  const canExportReports = hasPermission(currentUser, "emu.reports.export");
  const canViewAudit = hasPermission(currentUser, "emu.audit.view");
  const employeeOptions = useMemo(
    () =>
      employeeDirectory.length > 0
        ? employeeDirectory
        : workspace.settings.favoriteEmployees.map((employee) => ({
            department: employee.department,
            fullName: employee.fullName,
            id: employee.employeeId,
            personnelNo: employee.personnelNo,
            position: employee.position,
          })),
    [employeeDirectory, workspace.settings.favoriteEmployees],
  );
  const filteredEmployeeOptions = useMemo(
    () => filterHistoryEmployeeOptions(employeeOptions, employeeSearch, employeeId),
    [employeeId, employeeOptions, employeeSearch],
  );

  useEffect(() => {
    setPreferences({
      activeView,
      dateFrom,
      dateTo,
      displayMode,
      employeeId,
      employeeMonth,
      employeeSearch,
      includeDeleted,
      manualCorrectionsOnly,
      notCompletedReasonId,
      pageSize,
      problemOnly,
      sectionId,
      shiftType,
      sortBy,
      status,
      waitReasonId,
    });
  }, [
    activeView,
    dateFrom,
    dateTo,
    displayMode,
    employeeId,
    employeeMonth,
    employeeSearch,
    includeDeleted,
    manualCorrectionsOnly,
    notCompletedReasonId,
    pageSize,
    problemOnly,
    sectionId,
    setPreferences,
    shiftType,
    sortBy,
    status,
    waitReasonId,
  ]);

  useEffect(() => {
    if (!reportSnapshot) {
      setReportRows(workspace.workSessions.rows);
      setPagedResult(workspace.workSessions);
    }
  }, [reportSnapshot, workspace.workSessions]);

  useEffect(() => {
    if (employeeId) {
      setMonthEmployeeId(employeeId);
      setSelectedMonthDate("");
    } else {
      setMonthEmployeeId("");
      setMonthSummaries([]);
      setSelectedMonthDate("");
    }
  }, [employeeId]);

  const rows = useMemo(
    () =>
      sortEmuHistoryRows(
        reportRows
          .filter((work) => isHistoryVisible(work, includeDeleted && canSeeDeleted))
          .filter((work) => (dateFrom ? work.workDate >= dateFrom : true))
          .filter((work) => (dateTo ? work.workDate <= dateTo : true))
          .filter((work) => (employeeId ? work.employees.some((employee) => employee.employeeId === employeeId) : true))
          .filter((work) => (sectionId ? work.sectionId === sectionId : true))
          .filter((work) => (status ? matchesHistoryStatus(work, status) : true))
          .filter((work) => (problemOnly ? isProblemWork(work) : true)),
        sortBy,
      ),
    [canSeeDeleted, dateFrom, dateTo, employeeId, includeDeleted, problemOnly, reportRows, sectionId, sortBy, status],
  );
  const pageRows = pagedResult.rows;
  const selected = pageRows.find((work) => work.id === selectedId) ?? rows.find((work) => work.id === selectedId) ?? pageRows[0] ?? rows[0];
  const reportTotals = reportSnapshot?.totals;
  const timeTotals = useMemo(
    () =>
      reportTotals
        ? {
            otherWorkMinutes: reportTotals.otherWorkMinutes,
            totalMinutes: reportTotals.totalMinutes,
            waitingMinutes: reportTotals.waitingMinutes,
            workMinutes: reportTotals.workMinutes,
          }
        : calculateHistoryTimeTotals(rows, employeeId),
    [employeeId, reportTotals, rows],
  );
  const employeeBreakdown = useMemo(
    () => (reportSnapshot ? reportSnapshot.employees.map(mapEmployeeReportToBreakdown) : buildEmployeeTimeBreakdown(rows, employeeId)),
    [employeeId, reportSnapshot, rows],
  );
  const sectionBreakdown = useMemo(
    () => (reportSnapshot ? reportSnapshot.sections.map(mapSectionReportToBreakdown) : buildSectionBreakdown(rows)),
    [reportSnapshot, rows],
  );
  const problemRows = useMemo(() => rows.filter(isProblemWork), [rows]);
  const selectedEmployee = employeeOptions.find((employee) => employee.id === employeeId);
  const monthEmployee = useMemo(
    () => resolveHistoryEmployee(monthEmployeeId, employeeOptions, employeeBreakdown),
    [employeeBreakdown, employeeOptions, monthEmployeeId],
  );
  const employeeReportEmployee = useMemo(
    () => employeeReport ? mapEmployeeReportToOption(employeeReport.employee) : resolveHistoryEmployee(employeeReportId, employeeOptions, employeeBreakdown),
    [employeeBreakdown, employeeOptions, employeeReport, employeeReportId],
  );
  const employeeReportRows = useMemo(
    () => employeeReport?.works.rows ?? (employeeReportId ? rows.filter((work) => work.employees.some((employee) => employee.employeeId === employeeReportId)) : []),
    [employeeReport, employeeReportId, rows],
  );
  const selectedSection = workspace.settings.sections.find((section) => section.id === sectionId);
  const serverTotalWorks = reportTotals?.totalWorks ?? rows.length;
  const serverCompleted = reportTotals?.completedWorks ?? rows.filter((work) => isOperationalStatus(work, "Завершено") && !work.deletedAt).length;
  const serverProblemCount = reportTotals?.problemWorks ?? problemRows.length;
  const serverAverageWorkMinutes = reportTotals?.averageWorkMinutes ?? (rows.length ? Math.round(timeTotals.workMinutes / rows.length) : 0);
  const completed = rows.filter((work) => isOperationalStatus(work, "Завершено") && !work.deletedAt).length;
  const averageWorkMinutes = rows.length ? Math.round(timeTotals.workMinutes / rows.length) : 0;

  useEffect(() => {
    if (!monthEmployeeId) return;

    let mounted = true;
    setMonthLoading(true);
    workspace.actions
      .getEmployeeMonthSummary(monthEmployeeId, employeeMonth)
      .then((summary) => {
        if (!mounted) return;
        const summaries = summary.shifts.filter(isMeaningfulShiftSummary);
        setMonthSummaries(summaries);
        setSelectedMonthDate((current) => (current && summaries.some((summary) => summary.shift.shiftDate === current) ? current : summaries[0]?.shift.shiftDate ?? ""));
      })
      .catch(() => {
        if (!mounted) return;
        setMonthSummaries([]);
        setSelectedMonthDate("");
      })
      .finally(() => {
        if (mounted) setMonthLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [employeeMonth, monthEmployeeId, workspace.actions]);

  useEffect(() => {
    if (!selected || !canViewAudit) {
      setAuditRows([]);
      return;
    }

    let mounted = true;
    workspace.actions
      .getWorkSessionAudit(selected.id)
      .then((result) => {
        if (mounted) setAuditRows(result.rows);
      })
      .catch(() => {
        if (mounted) setAuditRows(workspace.auditEvents.filter((event) => event.workSessionId === selected.id));
      });

    return () => {
      mounted = false;
    };
  }, [canViewAudit, selected, workspace.actions, workspace.auditEvents]);

  function buildHistoryQuery() {
    const statusQuery = buildHistoryStatusQuery(status);
    const defaultCompletedStatus = statusFilterOptions[0].value.slice(3);
    const trimmedEmployeeSearch = employeeId ? "" : employeeSearch.trim();
    return {
      dateFrom,
      dateTo,
      employeeId,
      employeeSearch: trimmedEmployeeSearch || undefined,
      includeDeleted: includeDeleted && canSeeDeleted,
      manualCorrectionsOnly,
      notCompletedReasonId,
      operationalStatus: statusQuery.operationalStatus ?? (includeDeleted && canSeeDeleted ? undefined : defaultCompletedStatus),
      problemOnly,
      resultStatus: statusQuery.resultStatus,
      sectionId,
      shiftType,
      sortBy,
      waitReasonId,
    };
  }

  async function buildReport(nextPage = 1, nextPageSize = pageSize, notify = true) {
    try {
      setHistoryLoading(true);
      const query = buildHistoryQuery();
      const [pageResult, snapshot] = await Promise.all([
        workspace.actions.queryWorkSessions({ ...query, page: nextPage, pageSize: nextPageSize }),
        workspace.actions.queryWorkHistoryReport(query),
      ]);
      setAppliedQuery(query);
      setPage(pageResult.page);
      setPageSize(pageResult.pageSize);
      setPagedResult(pageResult);
      setReportRows(pageResult.rows);
      setReportSnapshot(snapshot);
      setSectionWorkResults({});
      setSelectedId(pageResult.rows[0]?.id ?? "");
      setHistoryLoading(false);
      if (notify) onNotify("Отчет сформирован");
    } catch (error) {
      setHistoryLoading(false);
      onNotify(error instanceof Error ? error.message : "Не удалось сформировать отчет");
    }
  }

  async function loadPage(nextPage = page, nextPageSize = pageSize) {
    try {
      setHistoryLoading(true);
      const query = appliedQuery ?? buildHistoryQuery();
      const pageResult = await workspace.actions.queryWorkSessions({ ...query, page: nextPage, pageSize: nextPageSize });
      setPage(pageResult.page);
      setPageSize(pageResult.pageSize);
      setPagedResult(pageResult);
      setReportRows(pageResult.rows);
      setSelectedId(pageResult.rows[0]?.id ?? "");
      setHistoryLoading(false);
    } catch (error) {
      setHistoryLoading(false);
      onNotify(error instanceof Error ? error.message : "Не удалось загрузить страницу истории");
    }
  }

  async function loadSectionWorks(sectionIdToLoad: string, nextPage = 1, nextPageSize = 25) {
    try {
      setSectionWorkLoadingId(sectionIdToLoad);
      const query = appliedQuery ?? buildHistoryQuery();
      const result = await workspace.actions.queryWorkSessions({ ...query, sectionId: sectionIdToLoad, page: nextPage, pageSize: nextPageSize });
      setSectionWorkResults((current) => ({ ...current, [sectionIdToLoad]: result }));
      setSectionWorkLoadingId("");
    } catch (error) {
      setSectionWorkLoadingId("");
      onNotify(error instanceof Error ? error.message : "Не удалось загрузить работы участка");
    }
  }

  async function exportRows() {
    if (!canExportReports) {
      onNotify("Нет права на экспорт отчетов ЭМУ");
      return;
    }

    try {
      if (workspace.sourceMode === "api") {
        const exportedFile = await workspace.actions.exportWorkSessions(appliedQuery ?? buildHistoryQuery());
        saveExportFile(exportedFile.blob, exportedFile.fileName || `emu-history-${new Date().toISOString().slice(0, 10)}.csv`);
        onNotify("Экспорт истории ЭМУ сформирован сервером");
        return;
      }

      const localRows = await workspace.actions.queryWorkSessions(appliedQuery ?? buildHistoryQuery());
      const csv = buildEmuHistoryCsv(localRows.rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      saveExportFile(blob, `emu-history-${new Date().toISOString().slice(0, 10)}.csv`);
      onNotify(`Экспортировано строк: ${localRows.rows.length}`);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось экспортировать историю ЭМУ");
    }
  }

  async function openEmployeeReport(id: string) {
    setEmployeeReportId(id);
    setMonthEmployeeId(id);
    setSelectedMonthDate("");
    setEmployeeReport(null);
    setEmployeeReportLoading(true);
    try {
      const query = appliedQuery ?? buildHistoryQuery();
      const result = await workspace.actions.queryEmployeeWorkHistoryReport(id, { ...query, page: 1, pageSize: 25 });
      setEmployeeReport(result);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Не удалось загрузить отчет сотрудника");
    } finally {
      setEmployeeReportLoading(false);
    }
  }

  function resetFilters() {
    setDateFrom(today);
    setDateTo(today);
    setEmployeeId("");
    setEmployeeSearch("");
    setPage(1);
    setSectionId("");
    setShiftType("");
    setWaitReasonId("");
    setNotCompletedReasonId("");
    setStatus("");
    setSortBy("date");
    setProblemOnly(false);
    setManualCorrectionsOnly(false);
    setIncludeDeleted(false);
  }

  useEffect(() => {
    void buildReport(1, pageSize, false);
  }, []);

  return (
    <section className="emu-page emu-history-v2">
      <div className="emu-history-v2-header">
        <div>
          <h2>История выполненных работ</h2>
          <p>Отчеты, анализ времени и результатов по сотрудникам, участкам и карточкам.</p>
        </div>
        <div className="emu-history-view-actions">
          <span>Обновлено {new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
          <button className="emu-secondary-button" onClick={() => void workspace.reload()} type="button">Обновить</button>
          <button className={displayMode === "detailed" ? "emu-primary-button" : "emu-secondary-button"} onClick={() => setDisplayMode("detailed")} type="button">
            <LayoutList size={16} /> Подробный вид
          </button>
          <button className={displayMode === "compact" ? "emu-primary-button" : "emu-secondary-button"} onClick={() => setDisplayMode("compact")} type="button">
            <Grid3X3 size={16} /> Компактный вид
          </button>
        </div>
      </div>

      <EmuHistoryTabs
        activeView={activeView}
        counts={{
          details: pagedResult.total,
          employees: employeeBreakdown.length,
          sections: sectionBreakdown.length,
          summary: serverTotalWorks,
        }}
        onChange={setActiveView}
      />

      <EmuHistoryFilters
        canExportReports={canExportReports}
        canSeeDeleted={canSeeDeleted}
        dateFrom={dateFrom}
        dateTo={dateTo}
        employeeId={employeeId}
        employeeSearch={employeeSearch}
        filteredEmployeeOptions={filteredEmployeeOptions}
        includeDeleted={includeDeleted}
        manualCorrectionsOnly={manualCorrectionsOnly}
        notCompletedReasonId={notCompletedReasonId}
        notCompletedReasons={workspace.settings.notCompletedReasons}
        onApply={() => void buildReport()}
        onExport={() => void exportRows()}
        onReset={resetFilters}
        problemOnly={problemOnly}
        sectionId={sectionId}
        sections={workspace.settings.sections}
        selectedEmployee={selectedEmployee}
        setDateFrom={setDateFrom}
        setDateTo={setDateTo}
        setEmployeeId={setEmployeeId}
        setEmployeeSearch={setEmployeeSearch}
        setIncludeDeleted={setIncludeDeleted}
        setManualCorrectionsOnly={setManualCorrectionsOnly}
        setNotCompletedReasonId={setNotCompletedReasonId}
        setProblemOnly={setProblemOnly}
        setSectionId={setSectionId}
        setShiftType={setShiftType}
        setSortBy={setSortBy}
        setStatus={setStatus}
        setWaitReasonId={setWaitReasonId}
        shiftType={shiftType}
        sortBy={sortBy}
        status={status}
        waitReasonId={waitReasonId}
        waitReasons={workspace.settings.waitReasons}
      />

      <EmuHistoryKpiStrip
        averageWork={formatMinutes(serverAverageWorkMinutes)}
        completedPercent={serverTotalWorks ? Math.round((serverCompleted / serverTotalWorks) * 100) : 0}
        completedWorks={serverCompleted}
        pauseTime={formatMinutes(timeTotals.waitingMinutes + timeTotals.otherWorkMinutes)}
        problemWorks={serverProblemCount}
        totalTime={formatMinutes(timeTotals.totalMinutes)}
        totalWorks={serverTotalWorks}
      />

      {employeeReportEmployee ? (
        <EmployeeReportModal
          employee={employeeReportEmployee}
          loading={monthLoading}
          month={employeeMonth}
          onClose={() => {
            setEmployeeReportId("");
            setEmployeeReport(null);
            setMonthEmployeeId("");
            setSelectedMonthDate("");
          }}
          onMonthChange={(value) => {
            setEmployeeMonth(value || today.slice(0, 7));
            setSelectedMonthDate("");
          }}
          onSelectDate={setSelectedMonthDate}
          report={employeeReport}
          reportLoading={employeeReportLoading}
          rows={employeeReportRows}
          selectedDate={selectedMonthDate}
          summaries={monthSummaries}
        />
      ) : null}

      <div className={`emu-history-main-grid mode-${displayMode}`}>
        <main className="emu-history-content-card">
          {activeView === "summary" ? (
            <SummaryView
              employeeBreakdown={employeeBreakdown}
              loading={historyLoading}
              onPageChange={(value) => void loadPage(value, pageSize)}
              onPageSizeChange={(value) => void loadPage(1, value)}
              pageResult={pagedResult}
              rows={pageRows}
              selectedId={selected?.id ?? ""}
              sectionBreakdown={sectionBreakdown}
              setSelectedId={setSelectedId}
            />
          ) : null}
          {activeView === "employees" ? <EmployeesView rows={employeeBreakdown} selectedEmployeeId={employeeReportId} onPickEmployee={openEmployeeReport} /> : null}
          {activeView === "sections" ? (
            <SectionsView
              expandedSectionId={expandedSectionId}
              loadingSectionId={sectionWorkLoadingId}
              onSectionPageChange={(id, nextPage, nextPageSize) => void loadSectionWorks(id, nextPage, nextPageSize)}
              onToggleSection={(id) => {
                setExpandedSectionId((current) => (current === id ? "" : id));
                if (expandedSectionId !== id && !sectionWorkResults[id]) void loadSectionWorks(id);
              }}
              rows={sectionBreakdown}
              workResults={sectionWorkResults}
            />
          ) : null}
          {activeView === "details" ? (
            <>
              <EmuHistoryWorkTable rows={pageRows} selectedId={selected?.id ?? ""} setSelectedId={setSelectedId} />
              <HistoryPagination loading={historyLoading} onPageChange={(value) => void loadPage(value, pageSize)} onPageSizeChange={(value) => void loadPage(1, value)} result={pagedResult} />
            </>
          ) : null}
        </main>
        <aside className="emu-history-right-card">
          {selected ? (
            <EmuHistoryRightPanel
              events={auditRows}
              selectedEmployee={selectedEmployee}
              selectedSection={selectedSection}
              work={selected}
            />
          ) : (
            <div className="emu-empty-state">Выберите работу в таблице</div>
          )}
        </aside>
      </div>
    </section>
  );
}

function SummaryView({
  employeeBreakdown,
  loading,
  onPageChange,
  onPageSizeChange,
  pageResult,
  rows,
  sectionBreakdown,
  selectedId,
  setSelectedId,
}: {
  employeeBreakdown: EmployeeTimeBreakdown[];
  loading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageResult: EmuListResponseDto<EmuWorkSessionDto>;
  rows: EmuWorkSessionDto[];
  sectionBreakdown: SectionBreakdown[];
  selectedId: string;
  setSelectedId: (id: string) => void;
}) {
  const topEmployees = employeeBreakdown.slice(0, 5);
  const topSections = sectionBreakdown.slice(0, 5);
  return (
    <>
      <div className="emu-history-top-strip">
        <TopStrip title="Топ сотрудников по трудозатратам" rows={topEmployees.map((item) => ({ id: item.employeeId, label: item.employeeName, value: formatMinutes(item.totalMinutes) }))} />
        <TopStrip title="Топ участков по трудозатратам" rows={topSections.map((item) => ({ id: item.sectionId, label: item.sectionName, value: formatMinutes(item.workMinutes + item.waitingMinutes) }))} />
      </div>
      <EmuHistoryWorkTable rows={rows} selectedId={selectedId} setSelectedId={setSelectedId} />
      <HistoryPagination loading={loading} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} result={pageResult} />
    </>
  );
}

function HistoryPagination({
  loading,
  onPageChange,
  onPageSizeChange,
  result,
}: {
  loading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  result: EmuListResponseDto<EmuWorkSessionDto>;
}) {
  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const to = result.total === 0 ? 0 : Math.min(result.total, from + result.rows.length - 1);
  return (
    <div className="emu-history-pagination">
      <span>{loading ? "Загрузка..." : `Показано ${from}-${to} из ${result.total}`}</span>
      <label>
        На странице
        <select value={result.pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} disabled={loading}>
          {[25, 50, 100, 200].map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </label>
      <div>
        <button className="emu-secondary-button" disabled={loading || result.page <= 1} onClick={() => onPageChange(result.page - 1)} type="button">Назад</button>
        <strong>{result.page} / {result.pageCount}</strong>
        <button className="emu-secondary-button" disabled={loading || result.page >= result.pageCount} onClick={() => onPageChange(result.page + 1)} type="button">Вперед</button>
      </div>
    </div>
  );
}

function EmployeesView({ onPickEmployee, rows, selectedEmployeeId }: { onPickEmployee: (id: string) => void; rows: EmployeeTimeBreakdown[]; selectedEmployeeId: string }) {
  return (
    <>
      <div className="emu-history-card-row">
        {rows.slice(0, 6).map((employee) => (
          <button className={employee.employeeId === selectedEmployeeId ? "active" : ""} key={employee.employeeId} onClick={() => onPickEmployee(employee.employeeId)} type="button">
            <span>{initials(employee.employeeName)}</span>
            <strong>{employee.employeeName}</strong>
            <small>Работа {formatMinutes(employee.workMinutes)} · пауза {formatMinutes(employee.waitingMinutes + employee.otherWorkMinutes)}</small>
          </button>
        ))}
      </div>
      <table className="emu-history-data-table">
        <thead>
          <tr>
            <th>Сотрудник</th>
            <th>Работ</th>
            <th>Работа</th>
            <th>Паузы</th>
            <th>Итого</th>
            <th>Среднее</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((employee) => (
            <tr key={employee.employeeId} onClick={() => onPickEmployee(employee.employeeId)}>
              <td><strong>{employee.employeeName}</strong></td>
              <td>{employee.workCount}</td>
              <td>{formatMinutes(employee.workMinutes)}</td>
              <td>{formatMinutes(employee.waitingMinutes + employee.otherWorkMinutes)}</td>
              <td>{formatMinutes(employee.totalMinutes)}</td>
              <td>{formatMinutes(employee.workCount ? Math.round(employee.totalMinutes / employee.workCount) : 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function SectionsView({
  expandedSectionId,
  loadingSectionId = "",
  onPickSection = () => undefined,
  onSectionPageChange,
  onToggleSection,
  rows,
  selectedSectionId = "",
  workResults = {},
}: {
  expandedSectionId?: string;
  loadingSectionId?: string;
  onPickSection?: (id: string) => void;
  onSectionPageChange?: (id: string, page: number, pageSize: number) => void;
  onToggleSection?: (id: string) => void;
  rows: SectionBreakdown[];
  selectedSectionId?: string;
  workResults?: Record<string, EmuListResponseDto<EmuWorkSessionDto>>;
}) {
  if (onToggleSection) {
    return (
      <div className="emu-history-section-accordion">
        {rows.map((section) => {
          const expanded = expandedSectionId === section.sectionId;
          const sectionResult = workResults[section.sectionId];
          const sectionWorks = sectionResult?.rows ?? [];
          return (
            <article className={expanded ? "active" : ""} key={section.sectionId}>
              <button onClick={() => onToggleSection(section.sectionId)} type="button">
                <strong>{section.sectionName}</strong>
                <span>{section.workCount} работ</span>
                <span>{formatMinutes(section.workMinutes)}</span>
                <span>{formatMinutes(section.waitingMinutes)}</span>
                <em>{section.problemCount} проблем</em>
              </button>
              {expanded ? (
                <div className="emu-history-section-work-list">
                  {loadingSectionId === section.sectionId ? <p className="emu-empty-state">Загрузка работ участка...</p> : null}
                  {sectionWorks.map((work) => (
                    <button key={work.id} type="button">
                      <strong>{work.taskDescription}</strong>
                      <span>{work.workNumber} · {formatScopedEmployees(work, "")}</span>
                      <span>{formatTime(work.arrivedAt)} - {work.completedAt ? formatTime(work.completedAt) : "-"}</span>
                      <span>{formatMinutes(work.workMinutes)} работа · {formatMinutes(work.waitingMinutes + work.otherWorkMinutes)} паузы</span>
                      <EmuHistoryStatusPill value={normalizeEmuText(work.resultStatus || operationalStatus(work))} />
                    </button>
                  ))}
                  {sectionWorks.length === 0 && loadingSectionId !== section.sectionId ? <p className="emu-empty-state">За выбранный период работ на участке нет.</p> : null}
                  {sectionResult && sectionResult.pageCount > 1 && onSectionPageChange ? (
                    <HistoryPagination
                      loading={loadingSectionId === section.sectionId}
                      onPageChange={(page) => onSectionPageChange(section.sectionId, page, sectionResult.pageSize)}
                      onPageSizeChange={(pageSize) => onSectionPageChange(section.sectionId, 1, pageSize)}
                      result={sectionResult}
                    />
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className="emu-history-section-strip">
        {rows.slice(0, 6).map((section) => (
          <button className={section.sectionId === selectedSectionId ? "active" : ""} key={section.sectionId} onClick={() => onPickSection(section.sectionId)} type="button">
            <strong>{section.sectionName}</strong>
            <span>{formatMinutes(section.workMinutes + section.waitingMinutes)}</span>
            <i><b style={{ width: `${Math.min(100, section.completedPercent)}%` }} /></i>
          </button>
        ))}
      </div>
      <table className="emu-history-data-table">
        <thead>
          <tr>
            <th>Участок</th>
            <th>Работ</th>
            <th>Сотрудников</th>
            <th>Активное время</th>
            <th>Паузы</th>
            <th>Среднее</th>
            <th>Выполнено</th>
            <th>Проблемы</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((section) => (
            <tr key={section.sectionId} onClick={() => onPickSection(section.sectionId)}>
              <td><strong>{section.sectionName}</strong></td>
              <td>{section.workCount}</td>
              <td>{section.employeeCount}</td>
              <td>{formatMinutes(section.workMinutes)}</td>
              <td>{formatMinutes(section.waitingMinutes)}</td>
              <td>{formatMinutes(section.averageMinutes)}</td>
              <td>{section.completedPercent}%</td>
              <td>{section.problemCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function TimelineView({ rows }: { rows: TimelineRow[] }) {
  return (
    <div className="emu-history-timeline-board">
      <div className="emu-history-timeline-scale">
        {["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"].map((time) => <span key={time}>{time}</span>)}
      </div>
      {rows.map((row) => (
        <div className="emu-history-timeline-row" key={row.id}>
          <div>
            <strong>{row.label}</strong>
            <span>{row.sectionName}</span>
          </div>
          <div className="emu-history-timeline-track">
            <span className={row.kind} style={{ left: `${row.left}%`, width: `${row.width}%` }}>{row.timeLabel}</span>
          </div>
        </div>
      ))}
      {rows.length === 0 ? <div className="emu-empty-state">Нет событий для хронологии</div> : null}
    </div>
  );
}

function ExceptionsView({ exceptions }: { exceptions: EmuWorkHistoryExceptionDto[] }) {
  return exceptions.length ? (
    <div className="emu-history-exception-list">
      {exceptions.map((exception) => (
        <article className={exception.severity === "danger" ? "danger" : ""} key={exception.workSessionId}>
          <div>
            <strong>{exception.workNumber}</strong>
            <span>{formatDate(exception.workDate)} · {exception.sectionName}</span>
          </div>
          <p>{exception.reason}</p>
          <dl>
            <div><dt>работа</dt><dd>{formatMinutes(exception.workMinutes)}</dd></div>
            <div><dt>паузы</dt><dd>{formatMinutes(exception.waitingMinutes + exception.otherWorkMinutes)}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  ) : (
    <div className="emu-empty-state">Исключений по текущим фильтрам нет</div>
  );
}

function TopStrip({ rows, title }: { rows: Array<{ id: string; label: string; value: string }>; title: string }) {
  return (
    <section>
      <h3>{title}</h3>
      <div>
        {rows.map((row) => (
          <article key={row.id}>
            <strong>{row.label}</strong>
            <span>{row.value}</span>
          </article>
        ))}
        {rows.length === 0 ? <p>Нет данных</p> : null}
      </div>
    </section>
  );
}

function EmployeeReportModal({
  employee,
  loading,
  month,
  onClose,
  onMonthChange,
  onSelectDate,
  report,
  reportLoading,
  rows,
  selectedDate,
  summaries,
}: {
  employee: HistoryEmployeeOption;
  loading: boolean;
  month: string;
  onClose: () => void;
  onMonthChange: (value: string) => void;
  onSelectDate: (date: string) => void;
  report: EmuEmployeeWorkHistoryReportDto | null;
  reportLoading: boolean;
  rows: EmuWorkSessionDto[];
  selectedDate: string;
  summaries: EmuEmployeeShiftSummaryDto[];
}) {
  const [tab, setTab] = useState<"summary" | "sections" | "works" | "month">("summary");
  const totals = report
    ? {
        otherWorkMinutes: report.employee.otherWorkMinutes,
        totalMinutes: report.employee.totalMinutes,
        waitingMinutes: report.employee.waitingMinutes,
        workMinutes: report.employee.workMinutes,
      }
    : calculateHistoryTimeTotals(rows, employee.id);
  const sections = report ? report.sections.map(mapSectionReportToBreakdown) : buildEmployeeSectionBreakdown(rows, employee.id);
  const monthTotals = calculateMonthTotals(summaries);

  return (
    <div className="emu-history-modal-backdrop" role="dialog" aria-modal="true">
      <section className="emu-history-employee-modal">
        <header>
          <div>
            <span>Отчет по сотруднику</span>
            <h3>{employee.fullName}</h3>
            <p>{[employee.personnelNo, employee.position, employee.department].filter(Boolean).join(" · ") || "сотрудник"}</p>
          </div>
          <button className="emu-secondary-button" onClick={onClose} type="button">Закрыть</button>
        </header>
        <nav>
          <button className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")} type="button">Сводка</button>
          <button className={tab === "sections" ? "active" : ""} onClick={() => setTab("sections")} type="button">По участкам</button>
          <button className={tab === "works" ? "active" : ""} onClick={() => setTab("works")} type="button">История работ</button>
          <button className={tab === "month" ? "active" : ""} onClick={() => setTab("month")} type="button">Месяц</button>
        </nav>
        {tab === "summary" ? (
          <div className="emu-history-modal-kpis">
            <article><span>Работ</span><strong>{report?.employee.workCount ?? rows.length}</strong></article>
            <article><span>Рабочее время</span><strong>{formatMinutes(totals.workMinutes)}</strong></article>
            <article><span>Паузы / простой</span><strong>{formatMinutes(totals.waitingMinutes + totals.otherWorkMinutes)}</strong></article>
            <article><span>Итого</span><strong>{formatMinutes(totals.totalMinutes)}</strong></article>
            <article><span>Простой за месяц</span><strong>{formatMinutes(monthTotals.freeMinutes)}</strong></article>
            <article><span>Паузы за месяц</span><strong>{formatMinutes(monthTotals.pauseMinutes)}</strong></article>
            <article><span>Спорная сверхурочка</span><strong>{formatMinutes(monthTotals.questionableOvertimeMinutes)}</strong></article>
          </div>
        ) : null}
        {tab === "sections" ? (
          <div className="emu-history-employee-section-report">
            {sections.map((section) => (
              <article key={section.sectionId}>
                <strong>{section.sectionName}</strong>
                <span>{section.workCount} работ</span>
                <span>{formatMinutes(section.workMinutes)} работа</span>
                <span>{formatMinutes(section.waitingMinutes)} паузы</span>
              </article>
            ))}
            {sections.length === 0 ? <p className="emu-empty-state">За выбранный период нет данных по участкам.</p> : null}
          </div>
        ) : null}
        {tab === "works" ? (
          <>
            {reportLoading ? <p className="emu-empty-state">Загрузка истории сотрудника...</p> : null}
            <EmuHistoryWorkTable employeeId={employee.id} rows={rows} selectedId="" setSelectedId={() => undefined} />
            {report?.works.total ? <p className="emu-history-modal-note">Показано {rows.length} из {report.works.total}. Дальнейшие страницы доступны через общий список истории.</p> : null}
          </>
        ) : null}
        {tab === "month" ? (
          <EmployeeMonthAnalytics
            employee={employee}
            loading={loading}
            month={month}
            onClose={onClose}
            onMonthChange={onMonthChange}
            onSelectDate={onSelectDate}
            selectedDate={selectedDate}
            summaries={summaries}
          />
        ) : null}
      </section>
    </div>
  );
}

function EmployeeMonthAnalytics({
  employee,
  loading,
  month,
  onClose,
  onMonthChange,
  onSelectDate,
  selectedDate,
  summaries,
}: {
  employee: HistoryEmployeeOption;
  loading: boolean;
  month: string;
  onClose: () => void;
  onMonthChange: (value: string) => void;
  onSelectDate: (date: string) => void;
  selectedDate: string;
  summaries: EmuEmployeeShiftSummaryDto[];
}) {
  const selectedSummary = summaries.find((summary) => summary.shift.shiftDate === selectedDate) ?? summaries[0] ?? null;
  const totals = calculateMonthTotals(summaries);

  return (
    <section className="emu-employee-month-panel">
      <div className="emu-employee-month-head">
        <div>
          <span>Аналитика сотрудника за месяц</span>
          <h3>{employee.fullName}</h3>
          <p>{[employee.personnelNo, employee.position, employee.department].filter(Boolean).join(" · ") || "данные сотрудника"}</p>
        </div>
        <div className="emu-employee-month-actions">
          <label>
            Месяц
            <input type="month" value={month} onChange={(event) => onMonthChange(event.target.value)} />
          </label>
          <button className="emu-secondary-button" onClick={onClose} type="button">Закрыть</button>
        </div>
      </div>

      <div className="emu-employee-month-kpis">
        <article><span>Смен с данными</span><strong>{summaries.length}</strong><em>{formatMonthLabel(month)}</em></article>
        <article><span>Работа</span><strong>{formatMinutes(totals.workMinutes)}</strong><em>участие в карточках</em></article>
        <article><span>Простой</span><strong>{formatMinutes(totals.freeMinutes)}</strong><em>без работы внутри смен</em></article>
        <article><span>Паузы</span><strong>{formatMinutes(totals.pauseMinutes)}</strong><em>ожидание / другая работа</em></article>
        <article><span>Спорная сверхурочка</span><strong>{formatMinutes(totals.questionableOvertimeMinutes)}</strong><em>требует решения</em></article>
        <article><span>Средний простой</span><strong>{formatMinutes(totals.averageFreeMinutes)}</strong><em>на смену</em></article>
      </div>

      <div className="emu-employee-month-body">
        <div className="emu-employee-shift-list">
          <div className="emu-employee-month-subhead">
            <strong>Смены</strong>
            <span>{loading ? "загрузка..." : `${summaries.length} записей`}</span>
          </div>
          {summaries.map((summary) => (
            <button
              className={summary.shift.shiftDate === selectedSummary?.shift.shiftDate ? "active" : ""}
              key={summary.shift.shiftDate}
              onClick={() => onSelectDate(summary.shift.shiftDate)}
              type="button"
            >
              <div>
                <strong>{formatDate(summary.shift.shiftDate)}</strong>
                <span>{summary.shift.shiftTypeName || "Смена"} · {formatTime(summary.shift.actualStartAt)} - {formatTime(summary.shift.actualEndAt)}</span>
              </div>
              <div className="emu-employee-shift-bars" aria-label="Распределение времени смены">
                <i className="work" style={{ width: `${shiftPercent(summary.workMinutes, summary)}%` }} />
                <i className="pause" style={{ width: `${shiftPercent(summary.pauseMinutes, summary)}%` }} />
                <i className="free" style={{ width: `${shiftPercent(summary.freeMinutes, summary)}%` }} />
              </div>
              <dl>
                <div><dt>работа</dt><dd>{formatMinutes(summary.workMinutes)}</dd></div>
                <div><dt>простой</dt><dd>{formatMinutes(summary.freeMinutes)}</dd></div>
                <div><dt>пауза</dt><dd>{formatMinutes(summary.pauseMinutes)}</dd></div>
                {summary.questionableOvertimeMinutes > 0 ? <div><dt>спорно</dt><dd>{formatMinutes(summary.questionableOvertimeMinutes)}</dd></div> : null}
              </dl>
            </button>
          ))}
          {!loading && summaries.length === 0 ? <p className="emu-empty-state">За выбранный месяц нет смен, работ или данных присутствия.</p> : null}
        </div>

        <div className="emu-employee-period-list">
          <div className="emu-employee-month-subhead">
            <strong>Периоды выбранной смены</strong>
            <span>{selectedSummary ? formatDate(selectedSummary.shift.shiftDate) : "смена не выбрана"}</span>
          </div>
          {selectedSummary ? (
            <>
              <div className="emu-employee-shift-summary-line">
                <span>Работа <b>{formatMinutes(selectedSummary.workMinutes)}</b></span>
                <span>Простой <b>{formatMinutes(selectedSummary.freeMinutes)}</b></span>
                <span>Пауза <b>{formatMinutes(selectedSummary.pauseMinutes)}</b></span>
              </div>
              {selectedSummary.intervals
                .slice()
                .sort((left, right) => new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime())
                .map((interval, index) => (
                  <EmployeePeriodRow interval={interval} key={`${interval.startedAt}-${interval.endedAt}-${index}`} />
                ))}
            </>
          ) : (
            <p className="emu-empty-state">Выберите смену слева, чтобы увидеть периоды работы и простоя.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function EmployeePeriodRow({ interval }: { interval: EmuEmployeeShiftIntervalDto }) {
  const kind = getEmployeeIntervalKind(interval);
  return (
    <article className={`emu-employee-period-row ${kind}`}>
      <span>{employeeIntervalLabel(kind)}</span>
      <strong>{formatTime(interval.startedAt)} - {formatTime(interval.endedAt)}</strong>
      <em>{formatMinutes(interval.minutes)}</em>
      <p>{[interval.workNumber, normalizeEmuText(interval.label), normalizeEmuText(interval.reason)].filter(Boolean).join(" · ") || "без комментария"}</p>
    </article>
  );
}

type EmployeeTimeBreakdown = {
  employeeId: string;
  employeeName: string;
  otherWorkMinutes: number;
  totalMinutes: number;
  waitingMinutes: number;
  workCount: number;
  workMinutes: number;
};

type HistoryTimeTotals = Pick<EmployeeTimeBreakdown, "otherWorkMinutes" | "totalMinutes" | "waitingMinutes" | "workMinutes">;
type HistoryEmployeeOption = Pick<EmployeeDirectoryItem, "department" | "fullName" | "id" | "personnelNo" | "position">;

type SectionBreakdown = {
  averageMinutes: number;
  completedPercent: number;
  employeeCount: number;
  problemCount: number;
  sectionId: string;
  sectionName: string;
  waitingMinutes: number;
  workCount: number;
  workMinutes: number;
};

type TimelineRow = {
  id: string;
  kind: "work" | "pause" | "problem";
  label: string;
  left: number;
  sectionName: string;
  timeLabel: string;
  width: number;
};

function mapEmployeeReportToBreakdown(row: EmuEmployeeWorkReportDto): EmployeeTimeBreakdown {
  return {
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    otherWorkMinutes: row.otherWorkMinutes,
    totalMinutes: row.totalMinutes,
    waitingMinutes: row.waitingMinutes,
    workCount: row.workCount,
    workMinutes: row.workMinutes,
  };
}

function mapEmployeeReportToOption(row: EmuEmployeeWorkReportDto): HistoryEmployeeOption {
  return {
    department: row.department,
    fullName: row.employeeName,
    id: row.employeeId,
    personnelNo: row.personnelNo,
    position: row.position,
  };
}

function mapSectionReportToBreakdown(row: EmuSectionWorkReportDto): SectionBreakdown {
  return {
    averageMinutes: row.workCount ? Math.round(row.totalMinutes / row.workCount) : 0,
    completedPercent: row.workCount ? Math.round(((row.workCount - row.problemWorks) / row.workCount) * 100) : 0,
    employeeCount: row.employeeCount,
    problemCount: row.problemWorks,
    sectionId: row.sectionId,
    sectionName: row.sectionName,
    waitingMinutes: row.waitingMinutes + row.otherWorkMinutes,
    workCount: row.workCount,
    workMinutes: row.workMinutes,
  };
}

function buildHistoryStatusQuery(status: string): { operationalStatus?: string; resultStatus?: string } {
  if (status.startsWith("op:")) return { operationalStatus: status.slice(3) };
  if (status.startsWith("result:")) return { resultStatus: status.slice(7) };
  return {};
}

function filterHistoryEmployeeOptions(options: HistoryEmployeeOption[], query: string, selectedId: string) {
  const normalized = query.trim().toLowerCase();
  if (selectedId) return options.filter((employee) => employee.id === selectedId).slice(0, 1);
  if (normalized.length < 2) return [];
  return options
    .filter((employee) =>
      [employee.fullName, employee.personnelNo, employee.position, employee.department]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalized)),
    )
    .slice(0, 8);
}

function resolveHistoryEmployee(employeeId: string, options: HistoryEmployeeOption[], breakdown: EmployeeTimeBreakdown[]): HistoryEmployeeOption | null {
  if (!employeeId) return null;
  const directoryEmployee = options.find((employee) => employee.id === employeeId);
  if (directoryEmployee) return directoryEmployee;
  const historyEmployee = breakdown.find((employee) => employee.employeeId === employeeId);
  return historyEmployee
    ? { department: "", fullName: historyEmployee.employeeName, id: historyEmployee.employeeId, personnelNo: "", position: "" }
    : null;
}

function getMonthDates(month: string) {
  const [yearRaw, monthRaw] = month.split("-").map(Number);
  const year = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
  const monthIndex = Number.isFinite(monthRaw) ? monthRaw - 1 : new Date().getMonth();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const todayKey = toLocalDateKey(new Date());
  return Array.from({ length: days }, (_, index) => `${year}-${pad2(monthIndex + 1)}-${pad2(index + 1)}`)
    .filter((date) => date <= todayKey);
}

function toLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function isMeaningfulShiftSummary(summary: EmuEmployeeShiftSummaryDto) {
  return (
    summary.workMinutes > 0 ||
    summary.pauseMinutes > 0 ||
    summary.decisions.length > 0 ||
    summary.intervals.some((interval) => interval.type !== "free" && interval.type !== "lunch") ||
    summary.shift.source !== "default"
  );
}

function calculateMonthTotals(summaries: EmuEmployeeShiftSummaryDto[]) {
  const totals = summaries.reduce(
    (result, summary) => {
      result.freeMinutes += summary.freeMinutes;
      result.pauseMinutes += summary.pauseMinutes;
      result.questionableOvertimeMinutes += summary.questionableOvertimeMinutes;
      result.workMinutes += summary.workMinutes;
      return result;
    },
    { averageFreeMinutes: 0, freeMinutes: 0, pauseMinutes: 0, questionableOvertimeMinutes: 0, workMinutes: 0 },
  );
  totals.averageFreeMinutes = summaries.length ? Math.round(totals.freeMinutes / summaries.length) : 0;
  return totals;
}

function shiftPercent(minutes: number, summary: EmuEmployeeShiftSummaryDto) {
  if (minutes <= 0) return 0;
  const total = Math.max(1, summary.workMinutes + summary.pauseMinutes + summary.freeMinutes);
  return Math.max(3, Math.round((Math.max(0, minutes) / total) * 100));
}

function getEmployeeIntervalKind(interval: EmuEmployeeShiftIntervalDto): "free" | "lunch" | "pause" | "work" {
  if (interval.type.includes("free")) return "free";
  if (interval.type.includes("lunch")) return "lunch";
  if (interval.type.includes("pause") || interval.type.includes("other") || interval.type.includes("wait")) return "pause";
  return "work";
}

function createDefaultEmuHistoryPreferences(today: string): EmuHistoryPreferences {
  return {
    activeView: "summary",
    dateFrom: today,
    dateTo: today,
    displayMode: "detailed",
    employeeId: "",
    employeeMonth: today.slice(0, 7),
    employeeSearch: "",
    includeDeleted: false,
    manualCorrectionsOnly: false,
    notCompletedReasonId: "",
    pageSize: 25,
    problemOnly: false,
    sectionId: "",
    shiftType: "",
    sortBy: "date",
    status: "",
    waitReasonId: "",
  };
}

function isEmuHistoryPreferences(value: unknown): value is EmuHistoryPreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EmuHistoryPreferences>;
  return (
    isHistoryView(candidate.activeView) &&
    isDisplayMode(candidate.displayMode) &&
    typeof candidate.dateFrom === "string" &&
    typeof candidate.dateTo === "string" &&
    typeof candidate.employeeId === "string" &&
    typeof candidate.employeeMonth === "string" &&
    typeof candidate.includeDeleted === "boolean" &&
    typeof candidate.manualCorrectionsOnly === "boolean" &&
    typeof candidate.notCompletedReasonId === "string" &&
    typeof candidate.problemOnly === "boolean" &&
    typeof candidate.sectionId === "string" &&
    typeof candidate.sortBy === "string" &&
    typeof candidate.status === "string" &&
    typeof candidate.waitReasonId === "string"
  );
}

function isHistoryView(value: unknown): value is HistoryView {
  return value === "summary" || value === "employees" || value === "sections" || value === "details";
}

function isDisplayMode(value: unknown): value is DisplayMode {
  return value === "detailed" || value === "compact";
}

function employeeIntervalLabel(kind: "free" | "lunch" | "pause" | "work") {
  if (kind === "free") return "Простой";
  if (kind === "lunch") return "Обед";
  if (kind === "pause") return "Пауза";
  return "Работа";
}

function formatMonthLabel(month: string) {
  const [yearRaw, monthRaw] = month.split("-").map(Number);
  if (!Number.isFinite(yearRaw) || !Number.isFinite(monthRaw)) return month;
  return new Date(yearRaw, monthRaw - 1, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

function isHistoryVisible(work: EmuWorkSessionDto, includeDeleted: boolean) {
  if (work.deletedAt || isOperationalStatus(work, "Удалено")) return includeDeleted;
  return Boolean(work.completedAt) || isOperationalStatus(work, "Завершено");
}

function matchesHistoryStatus(work: EmuWorkSessionDto, status: string) {
  const query = buildHistoryStatusQuery(status);
  if (query.operationalStatus) return operationalStatus(work) === query.operationalStatus;
  if (query.resultStatus) return normalizeEmuText(work.resultStatus) === query.resultStatus;
  return true;
}

function isOperationalStatus(work: EmuWorkSessionDto, expected: string) {
  return operationalStatus(work) === expected;
}

function isProblemWork(work: EmuWorkSessionDto) {
  const result = normalizeEmuText(work.resultStatus);
  return Boolean(work.deletedAt) || ["Не выполнено", "Отменено", "Частично выполнено"].includes(result) || work.waitingMinutes + work.otherWorkMinutes >= 60;
}

function getScopedEmployees(work: EmuWorkSessionDto, employeeId: string): EmuWorkSessionEmployeeDto[] {
  return employeeId ? work.employees.filter((employee) => employee.employeeId === employeeId) : work.employees;
}

function calculateHistoryTimeTotals(rows: EmuWorkSessionDto[], employeeId: string): HistoryTimeTotals {
  return rows.reduce<HistoryTimeTotals>(
    (totals, work) => {
      for (const employee of getScopedEmployees(work, employeeId)) {
        totals.workMinutes += employee.workMinutes;
        totals.waitingMinutes += employee.waitingMinutes;
        totals.otherWorkMinutes += employee.otherWorkMinutes;
        totals.totalMinutes += employee.workMinutes + employee.waitingMinutes + employee.otherWorkMinutes;
      }
      return totals;
    },
    { otherWorkMinutes: 0, totalMinutes: 0, waitingMinutes: 0, workMinutes: 0 },
  );
}

function buildEmployeeTimeBreakdown(rows: EmuWorkSessionDto[], employeeId: string): EmployeeTimeBreakdown[] {
  const byEmployee = new Map<string, EmployeeTimeBreakdown & { workIds: Set<string> }>();
  for (const work of rows) {
    for (const employee of getScopedEmployees(work, employeeId)) {
      const row =
        byEmployee.get(employee.employeeId) ??
        {
          employeeId: employee.employeeId,
          employeeName: employee.fullNameSnapshot,
          otherWorkMinutes: 0,
          totalMinutes: 0,
          waitingMinutes: 0,
          workCount: 0,
          workIds: new Set<string>(),
          workMinutes: 0,
        };
      row.workIds.add(work.id);
      row.workCount = row.workIds.size;
      row.workMinutes += employee.workMinutes;
      row.waitingMinutes += employee.waitingMinutes;
      row.otherWorkMinutes += employee.otherWorkMinutes;
      row.totalMinutes += employee.workMinutes + employee.waitingMinutes + employee.otherWorkMinutes;
      byEmployee.set(employee.employeeId, row);
    }
  }
  return [...byEmployee.values()]
    .map(({ workIds: _workIds, ...row }) => row)
    .sort((a, b) => b.totalMinutes - a.totalMinutes || a.employeeName.localeCompare(b.employeeName, "ru"));
}

function buildSectionBreakdown(rows: EmuWorkSessionDto[]): SectionBreakdown[] {
  const bySection = new Map<string, SectionBreakdown & { employees: Set<string> }>();
  for (const work of rows) {
    const sectionId = work.sectionId || "section-other";
    const row =
      bySection.get(sectionId) ??
      {
        averageMinutes: 0,
        completedPercent: 0,
        employeeCount: 0,
        employees: new Set<string>(),
        problemCount: 0,
        sectionId,
        sectionName: normalizeEmuText(work.sectionName) || "Прочее",
        waitingMinutes: 0,
        workCount: 0,
        workMinutes: 0,
      };
    row.workCount += 1;
    row.workMinutes += work.workMinutes;
    row.waitingMinutes += work.waitingMinutes + work.otherWorkMinutes;
    row.problemCount += isProblemWork(work) ? 1 : 0;
    for (const employee of work.employees) row.employees.add(employee.employeeId);
    row.employeeCount = row.employees.size;
    row.averageMinutes = row.workCount ? Math.round((row.workMinutes + row.waitingMinutes) / row.workCount) : 0;
    row.completedPercent = row.workCount ? Math.round(((row.workCount - row.problemCount) / row.workCount) * 100) : 0;
    bySection.set(sectionId, row);
  }
  return [...bySection.values()]
    .map(({ employees: _employees, ...row }) => row)
    .sort((a, b) => b.workMinutes + b.waitingMinutes - (a.workMinutes + a.waitingMinutes) || a.sectionName.localeCompare(b.sectionName, "ru"));
}

function buildEmployeeSectionBreakdown(rows: EmuWorkSessionDto[], employeeId: string): SectionBreakdown[] {
  const bySection = new Map<string, SectionBreakdown>();
  for (const work of rows) {
    const employees = work.employees.filter((employee) => employee.employeeId === employeeId);
    if (employees.length === 0) continue;
    const sectionId = work.sectionId || "section-other";
    const row =
      bySection.get(sectionId) ??
      {
        averageMinutes: 0,
        completedPercent: 0,
        employeeCount: 1,
        problemCount: 0,
        sectionId,
        sectionName: normalizeEmuText(work.sectionName) || "Other",
        waitingMinutes: 0,
        workCount: 0,
        workMinutes: 0,
      };
    row.workCount += 1;
    row.workMinutes += employees.reduce((sum, employee) => sum + employee.workMinutes, 0);
    row.waitingMinutes += employees.reduce((sum, employee) => sum + employee.waitingMinutes + employee.otherWorkMinutes, 0);
    row.problemCount += isProblemWork(work) ? 1 : 0;
    row.averageMinutes = row.workCount ? Math.round((row.workMinutes + row.waitingMinutes) / row.workCount) : 0;
    row.completedPercent = row.workCount ? Math.round(((row.workCount - row.problemCount) / row.workCount) * 100) : 0;
    bySection.set(sectionId, row);
  }
  return [...bySection.values()].sort((a, b) => b.workMinutes + b.waitingMinutes - (a.workMinutes + a.waitingMinutes));
}

function buildTimelineRows(rows: EmuWorkSessionDto[], employeeId: string): TimelineRow[] {
  return rows.flatMap((work) =>
    getScopedEmployees(work, employeeId).map((employee) => {
      const started = new Date(employee.arrivedAt || work.arrivedAt);
      const ended = new Date(employee.finishedAt || work.completedAt || work.updatedAt || work.arrivedAt);
      const left = timeLeftPercent(started);
      const width = Math.max(3, Math.min(100 - left, timeWidthPercent(started, ended)));
      return {
        id: `${work.id}-${employee.employeeId}`,
        kind: isProblemWork(work) ? "problem" : employee.waitingMinutes + employee.otherWorkMinutes > 0 ? "pause" : "work",
        label: employee.fullNameSnapshot,
        left,
        sectionName: normalizeEmuText(work.sectionName) || "Прочее",
        timeLabel: `${formatTime(started.toISOString())} - ${formatTime(ended.toISOString())}`,
        width,
      };
    }),
  );
}

function timeLeftPercent(date: Date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  return Math.max(0, Math.min(96, ((hour - 6) / 16) * 100));
}

function timeWidthPercent(started: Date, ended: Date) {
  const minutes = Math.max(5, Math.round((ended.getTime() - started.getTime()) / 60000));
  return (minutes / (16 * 60)) * 100;
}

function saveExportFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
