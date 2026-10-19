import "./perco.css";
import "./percoWorkspace.css";
import "./percoDialogs.css";
import { LayoutDashboard, PlugZap, RefreshCw, ScrollText, UserRoundPlus, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ClosePercoPresenceIntervalDto, PercoConnectionTestResultDto, PercoDiagnosticsDto, PercoIntegrationLogDto, PercoIntegrationSettingsDto, PercoPresenceIntervalDiagnosticsDto, PercoSyncResultDto, PercoUnmatchedEmployeeDto, UpdatePercoIntegrationSettingsDto } from "../../api/contracts";
import { createPercoRepository } from "../../repositories/percoRepository";
import { hasPermission } from "../../security/permissions";
import { PercoOverview } from "./PercoOverview";
import { usePageLeaveGuard } from "../../shared/navigation/usePageLeaveGuard";

import {
  ClosePresenceModal,
  EmptyBlock,
  LoadStatus,
  PercoIntegrationScreenProps,
  PercoTab,
  SettingsForm,
  defaultSettings,
  formatDateTime,
  formatSecretStatus,
  formatStatus,
  getErrorMessage,
  getPercoTabLabel,
  isBusyStatus,
  isOldOpenInterval,
  normalizeSearch,
  normalizeStatusTone,
  percoTabOrder,
  percoTabs,
  preserveMatchSelection,
  toDateTimeLocalValue,
  toForm
} from "./percoScreenSupport";
import { ConnectionTab, DiagnosticsTab, LogsTab, MatchingTab, SyncTab } from "./PercoTabs";

const repository = createPercoRepository();
const tabIcons = { dashboard: LayoutDashboard, connection: PlugZap, sync: RefreshCw, matching: UserRoundPlus, diagnostics: UsersRound, logs: ScrollText };

export function PercoIntegrationScreen({ currentUser, employeeDirectory, onNotify }: PercoIntegrationScreenProps) {
  const owner = JSON.stringify([currentUser?.id, currentUser?.roles, currentUser?.permissions]);
  return <PercoWorkspace key={owner} currentUser={currentUser} employeeDirectory={employeeDirectory} onNotify={onNotify} />;
}

function PercoWorkspace({ currentUser, employeeDirectory, onNotify }: PercoIntegrationScreenProps) {
  const canView = hasPermission(currentUser, "integrations.perco.view");
  const canManage = hasPermission(currentUser, "integrations.perco.manage");
  const canSync = hasPermission(currentUser, "integrations.perco.sync");
  const canMatch = hasPermission(currentUser, "integrations.perco.match");
  const canViewLogs = hasPermission(currentUser, "integrations.perco.logs.view");

  const [activeTab, setActiveTab] = useState<PercoTab>("dashboard");
  const [settings, setSettings] = useState<PercoIntegrationSettingsDto | null>(null);
  const [form, setForm] = useState<SettingsForm>(defaultSettings);
  const formRevision = useRef(0);
  const formDirty = useRef(false);
  const [hasUnsavedSettings, setHasUnsavedSettings] = useState(false);
  const alive = useRef(true);
  const loadRevision = useRef(0);
  const unmatchedRevision = useRef(0), matchPending = useRef(false), closePending = useRef(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [mutationSaving, setMutationSaving] = useState(false);
  const matchBaselines = useRef(new Map<string, string | null>());
  const [matchDirtyIds, setMatchDirtyIds] = useState<string[]>([]);
  const closeInitial = useRef("");
  const diagnosticsFlight = useRef<Promise<void> | null>(null);
  const [connectionResult, setConnectionResult] = useState<PercoConnectionTestResultDto | null>(null);
  const [diagnostics, setDiagnostics] = useState<PercoDiagnosticsDto | null>(null);
  const [logs, setLogs] = useState<PercoIntegrationLogDto[]>([]);
  const [matchSearch, setMatchSearch] = useState("");
  const [selectedMatch, setSelectedMatch] = useState<Record<string, string | null>>({});
  const [syncResult, setSyncResult] = useState<PercoSyncResultDto | null>(null);
  const [syncSequence, setSyncSequence] = useState<{ employees: PercoSyncResultDto; events: PercoSyncResultDto | null } | null>(null);
  const [unmatchedEmployees, setUnmatchedEmployees] = useState<PercoUnmatchedEmployeeDto[]>([]);
  const [closeInterval, setCloseInterval] = useState<PercoPresenceIntervalDiagnosticsDto | null>(null);
  const [closeForm, setCloseForm] = useState<ClosePercoPresenceIntervalDto>(() => ({
    comment: "",
    endedAt: toDateTimeLocalValue(new Date()),
  }));
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const displayStatus = mutationSaving ? "saving" : status;
  const leaveGuard = usePageLeaveGuard({ dirty: hasUnsavedSettings || matchDirtyIds.length > 0 || Boolean(closeInterval && JSON.stringify(closeForm) !== closeInitial.current), pending: displayStatus === "saving", message: "Изменения настроек, сопоставлений или открытой формы ещё не сохранены. При выходе они будут потеряны." });

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; loadRevision.current++; };
  }, []);

  const matchEmployeeOptions = useMemo(() => {
    const query = normalizeSearch(matchSearch);
    const filtered = employeeDirectory
      .filter((employee) => {
        if (!query) return true;
        return normalizeSearch(
          `${employee.fullName} ${employee.personnelNo} ${employee.position} ${employee.department} ${employee.employeeGroup}`,
        ).includes(query);
      })
      .slice(0, 80);
    const suggestedIds = new Set(
      unmatchedEmployees
        .map((item) => item.suggestedEmployeeId)
        .filter((employeeId): employeeId is string => Boolean(employeeId)),
    );
    Object.values(selectedMatch).forEach(id => { if (id) suggestedIds.add(id); });
    const suggested = employeeDirectory.filter((employee) => suggestedIds.has(employee.id));
    return Array.from(new Map([...filtered, ...suggested].map((employee) => [employee.id, employee])).values());
  }, [employeeDirectory, matchSearch, unmatchedEmployees, selectedMatch]);

  const load = useCallback(async () => {
    if (!canView) return;
    const revision = ++loadRevision.current;
    const unmatchedRequest = ++unmatchedRevision.current;
    setStatus("loading");
    setErrorMessage(null);
    try {
      const requests: Array<Promise<unknown>> = [
        repository.getSettings().then((nextSettings) => {
          if (!alive.current || revision !== loadRevision.current) return;
          setSettings(nextSettings);
          if (!formDirty.current) setForm(toForm(nextSettings));
        }),
        refreshDiagnostics(),
        repository.getUnmatchedEmployees().then((items) => {
          if (!alive.current || revision !== loadRevision.current || unmatchedRequest !== unmatchedRevision.current) return;
          pruneMatchChoices(items);
          setUnmatchedEmployees([...items]);
          setSelectedMatch(current => preserveMatchSelection(items, current));
        }),
      ];
      if (canViewLogs) {
        requests.push(repository.getLogs(80).then((items) => { if (alive.current && revision === loadRevision.current) setLogs([...items]); }));
      }

      const results = await Promise.allSettled(requests);
      if (!alive.current || revision !== loadRevision.current) return;
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failures.length > 0) {
        setStatus("error");
        setErrorMessage(
          failures.length === results.length
            ? getErrorMessage(failures[0].reason)
            : `Часть данных PERCO-Web временно недоступна. ${getErrorMessage(failures[0].reason)}`,
        );
        return;
      }

      setNeedsRefresh(false); setStatus("ready");
    } catch (error) {
      if (!alive.current) return;
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
    }
  }, [canView, canViewLogs]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canView || (activeTab !== "dashboard" && activeTab !== "diagnostics")) return undefined;

    const refreshMs = 15 * 1000;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (status === "loading" || status === "saving") return;
      void refreshDiagnostics().catch(() => undefined);
    }, refreshMs);

    return () => window.clearInterval(intervalId);
  }, [activeTab, canView, status]);

  async function saveSettings() {
    if (!canManage) {
      onNotify("Недостаточно прав для изменения настроек PERCo-Web.");
      return;
    }

    setStatus("saving");
    setErrorMessage(null);
    const savedRevision = formRevision.current;
    try {
      const payload: UpdatePercoIntegrationSettingsDto = {
        authMode: form.authMode,
        baseUrl: form.baseUrl.trim(),
        devPath: form.devPath.trim() || "/dev",
        employeesEndpoint: form.employeesEndpoint.trim() || "/api/users/staff/fullList",
        employeesSyncMinutes: Number(form.employeesSyncMinutes) || defaultSettings.employeesSyncMinutes,
        eventsEndpoint: form.eventsEndpoint.trim() || "/api/accessReports/events",
        eventsSyncMinutes: Number(form.eventsSyncMinutes) || defaultSettings.eventsSyncMinutes,
        isEnabled: form.isEnabled,
        password: form.password.trim() ? form.password : undefined,
        shiftEndToleranceMinutes: form.shiftEndToleranceMinutes,
        shiftStartToleranceMinutes: form.shiftStartToleranceMinutes,
        timezone: form.timezone.trim() || defaultSettings.timezone,
        token: form.token.trim() ? form.token : undefined,
        username: form.username.trim() || null,
      };

      const next = await repository.updateSettings(payload);
      if (!alive.current) return;
      setSettings(next);
      if (savedRevision === formRevision.current) {
        setForm(toForm(next));
        formDirty.current = false;
        setHasUnsavedSettings(false);
      }
      setStatus("ready");
      onNotify("Настройки PERCo-Web сохранены.");
    } catch (error) {
      if (!alive.current) return;
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function testConnection() {
    if (!canManage) {
      onNotify("Недостаточно прав для проверки подключения PERCo-Web.");
      return;
    }

    setStatus("loading");
    setErrorMessage(null);
    try {
      const result = await repository.testConnection();
      if (!alive.current) return;
      setConnectionResult(result);
      setSettings(current => current ? { ...current, lastConnectionCheckAt: result.checkedAt, lastConnectionStatus: result.success ? "success" : "error", lastConnectionError: result.success ? null : result.message } : current);
      setStatus("ready");
      onNotify(result.message);
      await refreshDiagnostics();
    } catch (error) {
      if (!alive.current) return;
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function checkSecret() {
    if (!canManage) {
      onNotify("Недостаточно прав для проверки секрета PERCo-Web.");
      return;
    }

    setStatus("loading");
    setErrorMessage(null);
    try {
      const result = await repository.checkSecret();
      if (!alive.current) return;
      setSettings((current) => (current ? { ...current, secretStatus: result } : current));
      setStatus("ready");
      onNotify(formatSecretStatus(result));
    } catch (error) {
      if (!alive.current) return;
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function runSync(kind: "employees" | "events") {
    if (!canSync) {
      onNotify("Недостаточно прав для синхронизации PERCo-Web.");
      return;
    }

    setStatus("loading");
    setErrorMessage(null);
    setSyncSequence(null);
    try {
      const result = kind === "employees" ? await repository.syncEmployees() : await repository.syncEvents();
      if (!alive.current) return;
      setSyncResult(result);
      setStatus("ready");
      onNotify(result.message);
      await Promise.all([refreshDiagnostics(), refreshLogs(), refreshUnmatched()]);
    } catch (error) {
      if (!alive.current) return;
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function runFullSync() {
    if (!canSync) {
      onNotify("Недостаточно прав для синхронизации PERCo-Web.");
      return;
    }

    setStatus("loading");
    setErrorMessage(null);
    setSyncSequence(null);
    try {
      const employees = await repository.syncEmployees();
      if (!alive.current) return;
      setSyncResult(employees);
      if (!employees.success) {
        setSyncSequence({ employees, events: null });
        setStatus("error");
        onNotify("Цикл остановлен: сотрудники не синхронизированы.");
        await Promise.all([refreshDiagnostics(), refreshLogs(), refreshUnmatched()]);
        return;
      }

      setSyncSequence({ employees, events: null });
      const events = await repository.syncEvents();
      if (!alive.current) return;
      setSyncResult(events);
      setSyncSequence({ employees, events });
      setStatus(events.success ? "ready" : "error");
      onNotify(events.success ? "Полный цикл PERCo-Web завершён." : "Сотрудники синхронизированы, но проходы требуют проверки.");
      await Promise.all([refreshDiagnostics(), refreshLogs(), refreshUnmatched()]);
    } catch (error) {
      if (!alive.current) return;
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function refreshDiagnostics() {
    if (!canView) return;
    if (diagnosticsFlight.current) return diagnosticsFlight.current;
    const promise = repository.getDiagnostics(120).then(next => {
      if (alive.current) setDiagnostics(next);
    }).finally(() => { if (diagnosticsFlight.current === promise) diagnosticsFlight.current = null; });
    diagnosticsFlight.current = promise;
    return promise;
  }

  async function refreshLogs() {
    if (!canViewLogs) return;
    const next = await repository.getLogs(80);
    if (alive.current) setLogs([...next]);
  }

  async function refreshUnmatched() {
    if (!canView) return;
    const request = ++unmatchedRevision.current;
    const next = await repository.getUnmatchedEmployees();
    if (!alive.current || request !== unmatchedRevision.current) return;
    pruneMatchChoices(next);
    setUnmatchedEmployees([...next]);
    setSelectedMatch(current => preserveMatchSelection(next, current));
  }

  async function refreshAll() {
    await load();
  }

  async function refreshLiveData() {
    if (canSync && activeTab === "diagnostics") {
      await runSync("events");
      return;
    }

    await refreshAll();
  }

  async function submitMatch(percoEmployeeId: string, action: "match" | "ignore") {
    if (matchPending.current || needsRefresh) return false;
    if (!canMatch) {
      onNotify("Недостаточно прав для сопоставления сотрудников PERCo-Web.");
      return false;
    }

    const employeeId = selectedMatch[percoEmployeeId] ?? null;
    if (action === "match" && !employeeId) {
      onNotify("Выберите сотрудника проекта для сопоставления.");
      return false;
    }

    matchPending.current = true; setMutationSaving(true); loadRevision.current++; unmatchedRevision.current++;
    setStatus("saving");
    setErrorMessage(null);
    try {
      const result = await repository.matchEmployee({ action, employeeId, percoEmployeeId });
      if (!alive.current) return false;
      setSyncResult(result);
      if (!result.success) {
        setStatus("error");
        setErrorMessage(result.message);
        return false;
      }
      setUnmatchedEmployees(current => current.filter(item => item.percoEmployeeId !== percoEmployeeId));
      matchBaselines.current.delete(percoEmployeeId); setMatchDirtyIds(current => current.filter(id => id !== percoEmployeeId));
      await refreshAfterWrite(result.message, [refreshUnmatched(), refreshDiagnostics()]);
      return true;
    } catch (error) {
      if (!alive.current) return false;
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
      return false;
    } finally { matchPending.current = false; if (alive.current) setMutationSaving(false); }
  }

  function pruneMatchChoices(items: readonly PercoUnmatchedEmployeeDto[]) {
    const ids = new Set(items.map(item => item.percoEmployeeId));
    for (const id of matchBaselines.current.keys()) if (!ids.has(id)) matchBaselines.current.delete(id);
    setMatchDirtyIds(current => current.filter(id => ids.has(id)));
  }

  async function refreshAfterWrite(message: string, requests: Promise<unknown>[]) {
    setNeedsRefresh(true); onNotify(message);
    const results = await Promise.allSettled(requests);
    if (!alive.current) return;
    const failed = results.some(result => result.status === "rejected");
    setNeedsRefresh(failed); setStatus(failed ? "error" : "ready");
    if (failed) setErrorMessage("Изменения сохранены. Не удалось обновить данные PERCo. Повторите обновление перед следующим действием; отправка не повторяется.");
  }

  function startClosePresenceInterval(interval: PercoPresenceIntervalDiagnosticsDto) {
    if (needsRefresh || closePending.current) return;
    setErrorMessage(null);
    const startedAt = new Date(interval.startedAt);
    const now = new Date();
    const defaultEndedAt = isOldOpenInterval(interval)
      ? new Date(Math.min(startedAt.getTime() + 12 * 60 * 60 * 1000, now.getTime()))
      : now;
    setCloseInterval(interval);
    const initial = { comment: "", endedAt: toDateTimeLocalValue(defaultEndedAt) };
    closeInitial.current = JSON.stringify(initial); setCloseForm(initial);
  }

  async function submitClosePresenceInterval() {
    if (closePending.current || needsRefresh) return;
    if (!canManage) {
      onNotify("Недостаточно прав для ручного закрытия прохода PERCo.");
      return;
    }
    if (!closeInterval) return;

    const endedAt = new Date(closeForm.endedAt);
    if (Number.isNaN(endedAt.getTime())) {
      onNotify("Укажите корректное время выхода.");
      return;
    }
    if (!closeForm.comment.trim()) {
      onNotify("Укажите причину ручного закрытия прохода.");
      return;
    }

    closePending.current = true; setMutationSaving(true); loadRevision.current++;
    setStatus("saving");
    setErrorMessage(null);
    try {
      const result = await repository.closePresenceInterval(closeInterval.id, {
        comment: closeForm.comment.trim(),
        endedAt: endedAt.toISOString(),
      });
      if (!alive.current) return;
      if (!result.success) {
        setStatus("error");
        setErrorMessage(result.message);
        return;
      }
      setCloseInterval(null);
      await refreshAfterWrite(result.message, [refreshDiagnostics(), refreshLogs()]);
    } catch (error) {
      if (!alive.current) return;
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
    } finally { closePending.current = false; if (alive.current) setMutationSaving(false); }
  }

  function updateForm<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    formRevision.current++;
    formDirty.current = true;
    setHasUnsavedSettings(true);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectTabFromKeyboard(event: React.KeyboardEvent<HTMLButtonElement>, tab: PercoTab) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    event.preventDefault();
    const currentIndex = percoTabOrder.indexOf(tab);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? percoTabOrder.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + percoTabOrder.length) % percoTabOrder.length;
    const nextTab = percoTabOrder[nextIndex];
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`perco-tab-${nextTab}`)?.focus());
  }

  if (!canView) {
    return (
      <div className="perco-shell">
        <EmptyBlock
          title="Нет доступа к PERCo-Web"
          text="Для просмотра интеграции требуется право integrations.perco.view."
        />
      </div>
    );
  }

  return (
    <div className="perco-shell" aria-busy={displayStatus === "loading" || displayStatus === "saving"}>
      <header className="perco-page-head"><div><h1>PERCo-Web</h1><p>Проходы, присутствие сотрудников и состояние обмена</p></div><button className="perco-button perco-button-secondary" type="button" onClick={() => setActiveTab("connection")}><PlugZap size={17} aria-hidden="true" />Настройки подключения</button></header>
      <section className="perco-toolbar" aria-labelledby="perco-screen-title">
        <div className="perco-toolbar-main">
          <strong id="perco-screen-title">{settings ? settings.isEnabled ? "Интеграция включена" : "Интеграция выключена" : "Состояние интеграции"}</strong>
          <span>{settings?.lastConnectionCheckAt ? `Последняя проверка подключения: ${formatDateTime(settings.lastConnectionCheckAt)}` : "Подключение ещё не проверено"}</span>
        </div>
        <div className="perco-hero-actions">
          <span className={`perco-status ${normalizeStatusTone(settings?.lastConnectionStatus ?? "idle")}`}>{settings?.lastConnectionStatus === "success" ? "Проверка успешна" : formatStatus(settings?.lastConnectionStatus ?? "idle")}</span>
          <button className="perco-button perco-button-secondary" disabled={isBusyStatus(displayStatus)} onClick={() => void refreshAll()} type="button">
            {isBusyStatus(status) ? "Обновляем…" : "Обновить данные"}
          </button>
        </div>
      </section>

      <nav className="perco-tabs" aria-label="Разделы PERCo-Web" role="tablist">
        {percoTabs.map((tab) => {
          const Icon = tabIcons[tab.id];
          return (
          <button
            aria-controls={`perco-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "active" : ""}
            id={`perco-tab-${tab.id}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => selectTabFromKeyboard(event, tab.id)}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
          >
            <Icon size={17} aria-hidden="true" />{getPercoTabLabel(tab.id)}
          </button>
        ); })}
      </nav>

      <div className="perco-progress-slot" role="status" aria-live="polite">{status === "saving" ? "Сохраняем изменения…" : status === "loading" ? "Обновляем данные…" : ""}</div>

      {errorMessage ? <div className="perco-alert perco-alert-error" role="alert">{errorMessage}</div> : null}

      <div
        aria-labelledby={`perco-tab-${activeTab}`}
        className="perco-tab-panel"
        id={`perco-panel-${activeTab}`}
        role="tabpanel"
        tabIndex={0}
      >

      {activeTab === "dashboard" ? (
        <PercoOverview
          canSync={canSync}
          diagnostics={diagnostics}
          logs={logs}
          canManage={canManage && !needsRefresh}
          canViewLogs={canViewLogs}
          status={displayStatus}
          onCloseInterval={startClosePresenceInterval}
          onNavigate={setActiveTab}
          onRefresh={refreshAll}
          onSyncEvents={() => runSync("events")}
        />
      ) : null}

      {activeTab === "connection" ? (
        <ConnectionTab
          canManage={canManage}
          connectionResult={connectionResult}
          form={form}
          hasUnsavedSettings={hasUnsavedSettings}
          settings={settings}
          status={displayStatus}
          onCheckSecret={checkSecret}
          onSave={saveSettings}
          onTest={testConnection}
          onUpdate={updateForm}
        />
      ) : null}

      {activeTab === "sync" ? (
        <SyncTab
          canSync={canSync}
          logs={logs}
          result={syncResult}
          sequence={syncSequence}
          settings={settings}
          status={displayStatus}
          onRunFullSync={runFullSync}
          onRunSync={runSync}
        />
      ) : null}

      {activeTab === "matching" ? (
        <MatchingTab
          canMatch={canMatch && !needsRefresh}
          errorMessage={errorMessage}
          employeeOptions={matchEmployeeOptions}
          search={matchSearch}
          selectedMatch={selectedMatch}
          status={displayStatus}
          unmatchedEmployees={unmatchedEmployees}
          onSearch={setMatchSearch}
          onSelect={(percoEmployeeId, employeeId) => {
            if (!matchBaselines.current.has(percoEmployeeId)) matchBaselines.current.set(percoEmployeeId, selectedMatch[percoEmployeeId] ?? null);
            setMatchDirtyIds(current => (employeeId || null) !== matchBaselines.current.get(percoEmployeeId) ? [...new Set([...current, percoEmployeeId])] : current.filter(id => id !== percoEmployeeId));
            setSelectedMatch((current) => ({ ...current, [percoEmployeeId]: employeeId || null }));
          }}
          onSubmit={submitMatch}
        />
      ) : null}

      {activeTab === "diagnostics" ? (
        <DiagnosticsTab
          canManage={canManage && !needsRefresh}
          diagnostics={diagnostics}
          canSync={canSync}
          settings={settings}
          status={displayStatus}
          onCloseInterval={startClosePresenceInterval}
          onRefresh={async () => {
            await refreshLiveData();
          }}
        />
      ) : null}

      {activeTab === "logs" ? (
        <LogsTab canView={canViewLogs} logs={logs} status={displayStatus} onRefresh={refreshLogs} />
      ) : null}
      </div>

      {closeInterval ? (
        <ClosePresenceModal
          form={closeForm}
          interval={closeInterval}
          busy={displayStatus === "saving"}
          errorMessage={errorMessage}
          onCancel={() => { if (!closePending.current) setCloseInterval(null); }}
          onChange={setCloseForm}
          onSubmit={submitClosePresenceInterval}
        />
      ) : null}
      {leaveGuard.leaveDialog}
    </div>
  );
}
