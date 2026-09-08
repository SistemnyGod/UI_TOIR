import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ApiError } from "../../api/client";
import type {
  ClosePercoPresenceIntervalDto,
  PercoAccessEventDiagnosticsDto,
  PercoConnectionTestResultDto,
  PercoDiagnosticsDto,
  PercoIntegrationLogDto,
  PercoIntegrationSettingsDto,
  PercoPresenceIntervalDiagnosticsDto,
  PercoSecretStatusDto,
  PercoSyncResultDto,
  PercoUnmatchedEmployeeDto,
  SessionUserDto,
  UpdatePercoIntegrationSettingsDto,
} from "../../api/contracts";
import { createPercoRepository } from "../../repositories/percoRepository";
import { hasPermission } from "../../security/permissions";
import type { EmployeeDirectoryItem } from "../../types";
import "./perco.css";

import { PercoTab, LoadStatus, PercoIntegrationScreenProps, SettingsForm, PresenceEmployeeSummary, PercoHourlyFlowPoint, PercoDurationBucket, defaultSettings, percoTabs, percoTabOrder, pageSizeOptions, PercoPageSize, defaultListPageSize, diagnosticsListPageSize, getPercoTabLabel, SettingsStatus, ConnectionResult, SyncSummary, ConfirmIgnoreEmployeeModal, ClosePresenceModal, PercoFlowChart, PresenceRatio, DurationBars, getChartBarHeight, PresenceTimeline, MetricCard, Field, SecretField, StatusPill, usePercoPagination, ListPagination, EmptyBlock, buildHourlyFlow, buildDurationBuckets, buildPercoQuality, buildPresenceAnalytics, toForm, buildSuggestedMatches, getMatchSuggestionReason, isStaleInterval, isOldOpenInterval, isLunchBreakInterval, isClosedShiftInterval, normalizeSearch, normalizeStatusTone, formatStatus, formatSecretStatus, formatOperation, formatLogStatus, formatLogSource, formatLogDetails, formatLogDetailKey, formatLogDetailValue, formatDateTime, formatDuration, toDateTimeLocalValue, minIso, maxIso, isBusyStatus, getErrorMessage } from "./percoScreenSupport";
const repository = createPercoRepository();

export function PercoIntegrationScreen({ currentUser, employeeDirectory, onNotify }: PercoIntegrationScreenProps) {
  const canView = hasPermission(currentUser, "integrations.perco.view");
  const canManage = hasPermission(currentUser, "integrations.perco.manage");
  const canSync = hasPermission(currentUser, "integrations.perco.sync");
  const canMatch = hasPermission(currentUser, "integrations.perco.match");
  const canViewLogs = hasPermission(currentUser, "integrations.perco.logs.view");

  const [activeTab, setActiveTab] = useState<PercoTab>("dashboard");
  const [settings, setSettings] = useState<PercoIntegrationSettingsDto | null>(null);
  const [form, setForm] = useState<SettingsForm>(defaultSettings);
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
    const suggested = employeeDirectory.filter((employee) => suggestedIds.has(employee.id));
    return Array.from(new Map([...filtered, ...suggested].map((employee) => [employee.id, employee])).values());
  }, [employeeDirectory, matchSearch, unmatchedEmployees]);

  const load = useCallback(async () => {
    if (!canView) return;
    setStatus("loading");
    setErrorMessage(null);
    try {
      const requests: Array<Promise<unknown>> = [
        repository.getSettings().then((nextSettings) => {
          setSettings(nextSettings);
          setForm(toForm(nextSettings));
        }),
        repository.getDiagnostics(120).then(setDiagnostics),
        repository.getUnmatchedEmployees().then((items) => {
          setUnmatchedEmployees([...items]);
          setSelectedMatch(buildSuggestedMatches(items));
        }),
      ];
      if (canViewLogs) {
        requests.push(repository.getLogs(80).then((items) => setLogs([...items])));
      }

      const results = await Promise.allSettled(requests);
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

      setStatus("ready");
    } catch (error) {
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
        shiftEndToleranceMinutes: Number(form.shiftEndToleranceMinutes) || defaultSettings.shiftEndToleranceMinutes,
        shiftStartToleranceMinutes: Number(form.shiftStartToleranceMinutes) || defaultSettings.shiftStartToleranceMinutes,
        timezone: form.timezone.trim() || defaultSettings.timezone,
        token: form.token.trim() ? form.token : undefined,
        username: form.username.trim() || null,
      };

      const next = await repository.updateSettings(payload);
      setSettings(next);
      setForm(toForm(next));
      setStatus("ready");
      onNotify("Настройки PERCo-Web сохранены.");
    } catch (error) {
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
      setConnectionResult(result);
      setStatus("ready");
      onNotify(result.message);
      await refreshDiagnostics();
    } catch (error) {
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
      setSettings((current) => (current ? { ...current, secretStatus: result } : current));
      setStatus("ready");
      onNotify(formatSecretStatus(result));
    } catch (error) {
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
      setSyncResult(result);
      setStatus("ready");
      onNotify(result.message);
      await Promise.all([refreshDiagnostics(), refreshLogs(), refreshUnmatched()]);
    } catch (error) {
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
      setSyncResult(events);
      setSyncSequence({ employees, events });
      setStatus(events.success ? "ready" : "error");
      onNotify(events.success ? "Полный цикл PERCo-Web завершён." : "Сотрудники синхронизированы, но проходы требуют проверки.");
      await Promise.all([refreshDiagnostics(), refreshLogs(), refreshUnmatched()]);
    } catch (error) {
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function refreshDiagnostics() {
    if (!canView) return;
    const next = await repository.getDiagnostics(120);
    setDiagnostics(next);
  }

  async function refreshLogs() {
    if (!canViewLogs) return;
    const next = await repository.getLogs(80);
    setLogs([...next]);
  }

  async function refreshUnmatched() {
    if (!canView) return;
    const next = await repository.getUnmatchedEmployees();
    setUnmatchedEmployees([...next]);
    setSelectedMatch(buildSuggestedMatches(next));
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
    if (!canMatch) {
      onNotify("Недостаточно прав для сопоставления сотрудников PERCo-Web.");
      return;
    }

    const employeeId = selectedMatch[percoEmployeeId] ?? null;
    if (action === "match" && !employeeId) {
      onNotify("Выберите сотрудника проекта для сопоставления.");
      return;
    }

    setStatus("saving");
    setErrorMessage(null);
    try {
      const result = await repository.matchEmployee({ action, employeeId, percoEmployeeId });
      setSyncResult(result);
      onNotify(result.message);
      await Promise.all([refreshUnmatched(), refreshDiagnostics()]);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
    }
  }

  function startClosePresenceInterval(interval: PercoPresenceIntervalDiagnosticsDto) {
    const startedAt = new Date(interval.startedAt);
    const now = new Date();
    const defaultEndedAt = isOldOpenInterval(interval)
      ? new Date(Math.min(startedAt.getTime() + 12 * 60 * 60 * 1000, now.getTime()))
      : now;
    setCloseInterval(interval);
    setCloseForm({ comment: "", endedAt: toDateTimeLocalValue(defaultEndedAt) });
  }

  async function submitClosePresenceInterval() {
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

    setStatus("saving");
    setErrorMessage(null);
    try {
      const result = await repository.closePresenceInterval(closeInterval.id, {
        comment: closeForm.comment.trim(),
        endedAt: endedAt.toISOString(),
      });
      setCloseInterval(null);
      onNotify(result.message);
      await Promise.all([refreshDiagnostics(), refreshLogs()]);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
    }
  }

  function updateForm<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
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
    <div className="perco-shell" aria-busy={status === "loading" || status === "saving"}>
      <section className="perco-toolbar" aria-labelledby="perco-screen-title">
        <div className="perco-toolbar-main">
          <span className="perco-eyebrow">PERCo-Web</span>
          <strong id="perco-screen-title">Проходы по заводу и смены сотрудников</strong>
          <span>Контроль входов/выходов, присутствия, сопоставления сотрудников и простоев.</span>
        </div>
        <div className="perco-toolbar-routes" aria-label="Правила проходов">
          <span>
            <b>Вход на завод</b>
            Неконтролируемая зона -&gt; завод
          </span>
          <span>
            <b>Выход с завода</b>
            Завод -&gt; неконтролируемая зона
          </span>
        </div>
        <div className="perco-hero-actions">
          <StatusPill status={settings?.lastConnectionStatus ?? "idle"} />
          <button className="perco-button perco-button-secondary" disabled={isBusyStatus(status)} onClick={() => void refreshAll()} type="button">
            {isBusyStatus(status) ? "Обновляем…" : "Обновить данные"}
          </button>
        </div>
      </section>

      <nav className="perco-tabs" aria-label="Разделы PERCo-Web" role="tablist">
        {percoTabs.map((tab) => (
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
            {getPercoTabLabel(tab.id)}
          </button>
        ))}
      </nav>

      {status === "loading" || status === "saving" ? (
        <div className="perco-progress" role="status">
          {status === "saving" ? "Сохраняем изменения PERCO-Web…" : "Обновляем данные PERCO-Web…"}
        </div>
      ) : null}

      {errorMessage ? <div className="perco-alert perco-alert-error" role="alert">{errorMessage}</div> : null}

      <div
        aria-labelledby={`perco-tab-${activeTab}`}
        className="perco-tab-panel"
        id={`perco-panel-${activeTab}`}
        role="tabpanel"
        tabIndex={0}
      >

      {activeTab === "dashboard" ? (
        <PercoDashboardTab
          canSync={canSync}
          diagnostics={diagnostics}
          logs={logs}
          settings={settings}
          status={status}
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
          settings={settings}
          status={status}
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
          status={status}
          onRunFullSync={runFullSync}
          onRunSync={runSync}
        />
      ) : null}

      {activeTab === "matching" ? (
        <MatchingTab
          canMatch={canMatch}
          employeeOptions={matchEmployeeOptions}
          search={matchSearch}
          selectedMatch={selectedMatch}
          status={status}
          unmatchedEmployees={unmatchedEmployees}
          onSearch={setMatchSearch}
          onSelect={(percoEmployeeId, employeeId) =>
            setSelectedMatch((current) => ({ ...current, [percoEmployeeId]: employeeId || null }))
          }
          onSubmit={submitMatch}
        />
      ) : null}

      {activeTab === "diagnostics" ? (
        <DiagnosticsTab
          canManage={canManage}
          diagnostics={diagnostics}
          canSync={canSync}
          settings={settings}
          status={status}
          onCloseInterval={startClosePresenceInterval}
          onRefresh={async () => {
            await refreshLiveData();
          }}
        />
      ) : null}

      {activeTab === "logs" ? (
        <LogsTab canView={canViewLogs} logs={logs} status={status} onRefresh={refreshLogs} />
      ) : null}
      </div>

      {closeInterval ? (
        <ClosePresenceModal
          form={closeForm}
          interval={closeInterval}
          onCancel={() => setCloseInterval(null)}
          onChange={setCloseForm}
          onSubmit={submitClosePresenceInterval}
        />
      ) : null}
    </div>
  );
}
function ConnectionTab({
  canManage,
  connectionResult,
  form,
  settings,
  status,
  onCheckSecret,
  onSave,
  onTest,
  onUpdate,
}: {
  canManage: boolean;
  connectionResult: PercoConnectionTestResultDto | null;
  form: SettingsForm;
  settings: PercoIntegrationSettingsDto | null;
  status: LoadStatus;
  onCheckSecret: () => void;
  onSave: () => void;
  onTest: () => void;
  onUpdate: <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => void;
}) {
  const [visibleSecret, setVisibleSecret] = useState<"password" | "token" | null>(null);

  return (
    <section className="perco-grid">
      <form
        className="perco-card perco-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave();
        }}
      >
        <header className="perco-form-heading">
          <div>
            <h2>Подключение</h2>
            <span>Секреты не возвращаются в интерфейс. Введите новое значение для замены, а пустое поле оставит текущее.</span>
            <div className="perco-secret-policy" role="note">
              <b>Секреты защищены</b>
              <span>Хранятся зашифрованно и доступны только API/worker.</span>
            </div>
          </div>
          <label className="perco-switch">
            <input
              checked={form.isEnabled}
              disabled={!canManage || isBusyStatus(status)}
              onChange={(event) => onUpdate("isEnabled", event.target.checked)}
              type="checkbox"
            />
            <span>Интеграция включена</span>
          </label>
        </header>

        <div className="perco-form-grid">
          <Field label="Адрес сервера PERCo">
            <input disabled={!canManage || isBusyStatus(status)} onChange={(event) => onUpdate("baseUrl", event.target.value)} value={form.baseUrl} />
          </Field>
          <Field label="Проверочный путь">
            <input disabled={!canManage || isBusyStatus(status)} onChange={(event) => onUpdate("devPath", event.target.value)} value={form.devPath} />
          </Field>
          <Field label="Endpoint сотрудников">
            <input
              disabled={!canManage || isBusyStatus(status)}
              onChange={(event) => onUpdate("employeesEndpoint", event.target.value)}
              value={form.employeesEndpoint}
            />
          </Field>
          <Field label="Endpoint проходов по заводу">
            <input
              disabled={!canManage || isBusyStatus(status)}
              onChange={(event) => onUpdate("eventsEndpoint", event.target.value)}
              value={form.eventsEndpoint}
            />
          </Field>
          <Field label="Режим авторизации">
            <select
              disabled={!canManage || isBusyStatus(status)}
              onChange={(event) => {
                const nextMode = event.target.value as SettingsForm["authMode"];
                onUpdate("authMode", nextMode);
                onUpdate(nextMode === "Token" ? "password" : "token", "");
                setVisibleSecret(null);
              }}
              value={form.authMode}
            >
              <option value="LoginPassword">Логин и пароль</option>
              <option value="Token">Bearer token</option>
            </select>
          </Field>
          {form.authMode === "Token" ? (
            <SecretField
              disabled={!canManage || isBusyStatus(status)}
              hasSaved={settings?.hasToken ?? false}
              id="perco-token-secret"
              label="Bearer token"
              onChange={(value) => onUpdate("token", value)}
              onToggleVisibility={() => setVisibleSecret((current) => current === "token" ? null : "token")}
              placeholder={settings?.hasToken ? "Введите новый token для замены" : "Вставьте Bearer token"}
              showValue={visibleSecret === "token"}
              value={form.token}
            />
          ) : (
            <>
              <Field label="Логин">
                <input disabled={!canManage || isBusyStatus(status)} onChange={(event) => onUpdate("username", event.target.value)} value={form.username} />
              </Field>
              <SecretField
                disabled={!canManage || isBusyStatus(status)}
                hasSaved={settings?.hasPassword ?? false}
                id="perco-password-secret"
                label="Пароль PERCo"
                onChange={(value) => onUpdate("password", value)}
                onToggleVisibility={() => setVisibleSecret((current) => current === "password" ? null : "password")}
                placeholder={settings?.hasPassword ? "Введите новый пароль для замены" : "Введите пароль"}
                showValue={visibleSecret === "password"}
                value={form.password}
              />
            </>
          )}
        </div>

        <div className="perco-form-grid compact">
          <Field label="Часовой пояс">
            <input disabled={!canManage || isBusyStatus(status)} onChange={(event) => onUpdate("timezone", event.target.value)} value={form.timezone} />
          </Field>
          <Field label="Сотрудники, мин">
            <input
              disabled={!canManage || isBusyStatus(status)}
              min={1}
              onChange={(event) => onUpdate("employeesSyncMinutes", Number(event.target.value))}
              type="number"
              value={form.employeesSyncMinutes}
            />
          </Field>
          <Field label="Проходы, мин">
            <input
              disabled={!canManage || isBusyStatus(status)}
              min={1}
              onChange={(event) => onUpdate("eventsSyncMinutes", Number(event.target.value))}
              type="number"
              value={form.eventsSyncMinutes}
            />
          </Field>
          <Field label="Допуск смены, мин">
            <input
              disabled={!canManage || isBusyStatus(status)}
              min={0}
              onChange={(event) => onUpdate("shiftStartToleranceMinutes", Number(event.target.value))}
              type="number"
              value={form.shiftStartToleranceMinutes}
            />
          </Field>
        </div>

        <div className="perco-actions">
          <button className="perco-button perco-button-primary" disabled={!canManage || isBusyStatus(status)} type="submit">
            {status === "saving" ? "Сохраняем…" : "Сохранить настройки"}
          </button>
          <button className="perco-button perco-button-secondary" disabled={!canManage || isBusyStatus(status)} onClick={onTest} type="button">
            Проверить подключение
          </button>
          <button
            className="perco-button perco-button-secondary"
            disabled={!canManage || isBusyStatus(status)}
            onClick={onCheckSecret}
            type="button"
          >
            Проверить секрет API/worker
          </button>
        </div>

        {connectionResult ? <ConnectionResult result={connectionResult} /> : null}
      </form>

      <SettingsStatus settings={settings} />
    </section>
  );
}

function SyncTab({
  canSync,
  logs,
  result,
  sequence,
  settings,
  status,
  onRunFullSync,
  onRunSync,
}: {
  canSync: boolean;
  logs: PercoIntegrationLogDto[];
  result: PercoSyncResultDto | null;
  sequence: { employees: PercoSyncResultDto; events: PercoSyncResultDto | null } | null;
  settings: PercoIntegrationSettingsDto | null;
  status: LoadStatus;
  onRunFullSync: () => void;
  onRunSync: (kind: "employees" | "events") => void;
}) {
  return (
    <section className="perco-grid">
      <div className="perco-card">
        <header>
          <div>
            <h2>Синхронизация</h2>
            <span>Сначала подтягиваем действующих сотрудников, затем проходы по заводу.</span>
          </div>
        </header>
        <div className="perco-action-grid">
          <button className="perco-button perco-button-primary" disabled={!canSync || isBusyStatus(status)} onClick={() => onRunSync("employees")} type="button">
            {isBusyStatus(status) ? "Выполняется…" : "Синхронизировать сотрудников"}
          </button>
          <button className="perco-button perco-button-primary" disabled={!canSync || isBusyStatus(status)} onClick={() => onRunSync("events")} type="button">
            {isBusyStatus(status) ? "Выполняется…" : "Синхронизировать проходы"}
          </button>
        </div>
        <div className="perco-full-sync-action">
          <button className="perco-button perco-button-secondary" disabled={!canSync || isBusyStatus(status)} onClick={onRunFullSync} type="button">
            {isBusyStatus(status) ? "Выполняется полный цикл…" : "Запустить полный цикл"}
          </button>
          <span>Сначала сотрудники, затем проходы. При ошибке первого шага второй не запускается.</span>
        </div>
        {sequence ? <SyncSequenceSummary sequence={sequence} /> : result ? <SyncSummary result={result} /> : <EmptyBlock title="Синхронизация еще не запускалась" text="Результат появится после автоматического worker-цикла или ручного запуска." />}
      </div>
      <div className="perco-card">
        <AutoSyncStatus logs={logs} settings={settings} />
        <h2>Порядок обработки</h2>
        <div className="perco-endpoint-list">
          <article>
            <div>
              <strong>1. Сотрудники</strong>
              <span>Загружаются активные сотрудники PERCo и сопоставляются с бухгалтерским справочником.</span>
            </div>
          </article>
          <article>
            <div>
              <strong>2. Проходы по заводу</strong>
              <span>Берутся входы и выходы между заводом и неконтролируемой зоной.</span>
            </div>
          </article>
          <article>
            <div>
              <strong>3. Смена и простои</strong>
              <span>Интервалы показывают, кто сейчас на территории, кто вышел и где нужна ручная проверка.</span>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function AutoSyncStatus({ settings, logs }: { settings: PercoIntegrationSettingsDto | null; logs: PercoIntegrationLogDto[] }) {
  const latestSyncLog = logs.find((log) =>
    (log.operation === "SYNC_EMPLOYEES" || log.operation === "SYNC_EVENTS") && log.createdByUserId === null,
  );
  const isEnabled = settings?.isEnabled ?? false;
  const workerStatus = settings?.secretStatus.workerStatus || "не проверен";

  return (
    <div className="perco-auto-sync-card">
      <header>
        <div>
          <h2>Автоматический цикл</h2>
          <span>Worker проверяет расписание каждую минуту.</span>
        </div>
        <span className={`perco-auto-sync-state ${isEnabled ? "is-active" : "is-paused"}`}>
          {isEnabled ? "Включён" : "Пауза"}
        </span>
      </header>
      <div className="perco-auto-sync-flow">
        <article>
          <strong>1. Сотрудники</strong>
          <span>каждые {settings?.employeesSyncMinutes ?? "—"} мин</span>
        </article>
        <article>
          <strong>2. Проходы</strong>
          <span>каждые {settings?.eventsSyncMinutes ?? "—"} мин</span>
        </article>
      </div>
      <p>
        {isEnabled
          ? "Цикл запускается автоматически после сохранения настроек и не создаёт дубли при повторной проверке."
          : "Включите интеграцию на вкладке «Подключение», чтобы worker начал автоматическую синхронизацию."}
      </p>
      <small>Секрет worker: {workerStatus}{settings?.secretStatus.workerCheckedAt ? ` · ${formatDateTime(settings.secretStatus.workerCheckedAt)}` : ""}</small>
      {latestSyncLog ? <small>Последняя запись: {formatOperation(latestSyncLog.operation)} · {formatDateTime(latestSyncLog.startedAt)}</small> : null}
    </div>
  );
}

function SyncSequenceSummary({ sequence }: { sequence: { employees: PercoSyncResultDto; events: PercoSyncResultDto | null } }) {
  const completed = sequence.events;
  const success = completed ? completed.success : sequence.employees.success;
  return (
    <div className={`perco-sync-sequence ${success ? "success" : "error"}`}>
      <strong>{completed ? (completed.success ? "Полный цикл завершён" : "Цикл завершён с ошибкой") : "Цикл остановлен после ошибки сотрудников"}</strong>
      <div>
        <article>
          <b>1. Сотрудники</b>
          <span>{sequence.employees.success ? "Готово" : "Ошибка"}</span>
          <small>{sequence.employees.message}</small>
        </article>
        <article className={completed ? "" : "pending"}>
          <b>2. Проходы</b>
          <span>{completed ? (completed.success ? "Готово" : "Ошибка") : "Не запускались"}</span>
          <small>{completed ? completed.message : "Шаг пропущен, чтобы не обработать проходы без актуального справочника сотрудников."}</small>
        </article>
      </div>
    </div>
  );
}

function MatchingTab({
  canMatch,
  employeeOptions,
  search,
  selectedMatch,
  status,
  unmatchedEmployees,
  onSearch,
  onSelect,
  onSubmit,
}: {
  canMatch: boolean;
  employeeOptions: EmployeeDirectoryItem[];
  search: string;
  selectedMatch: Record<string, string | null>;
  status: LoadStatus;
  unmatchedEmployees: PercoUnmatchedEmployeeDto[];
  onSearch: (value: string) => void;
  onSelect: (percoEmployeeId: string, employeeId: string) => void;
  onSubmit: (percoEmployeeId: string, action: "match" | "ignore") => void;
}) {
  const [ignoreCandidate, setIgnoreCandidate] = useState<PercoUnmatchedEmployeeDto | null>(null);
  const [percoQuery, setPercoQuery] = useState("");
  const normalizedPercoQuery = useMemo(() => normalizeSearch(percoQuery), [percoQuery]);
  const filteredUnmatchedEmployees = useMemo(
    () =>
      unmatchedEmployees.filter((item) =>
        !normalizedPercoQuery ||
        normalizeSearch(`${item.fullName} ${item.personnelNo} ${item.cardNumber} ${item.department}`).includes(normalizedPercoQuery),
      ),
    [normalizedPercoQuery, unmatchedEmployees],
  );
  const suggestedCount = filteredUnmatchedEmployees.filter((item) => item.suggestedEmployeeId).length;
  const pagination = usePercoPagination(filteredUnmatchedEmployees, defaultListPageSize);

  return (
    <section className="perco-card">
      <header>
        <div>
          <h2>Сопоставление сотрудников</h2>
          <span>Свяжите сотрудников PERCo с действующим справочником проекта по ФИО, табельному номеру или карте.</span>
        </div>
      </header>
      <div className="perco-match-toolbar">
        <input
          aria-label="Поиск сотрудника PERCO"
          onChange={(event) => setPercoQuery(event.target.value)}
          placeholder="Найти сотрудника PERCO"
          type="search"
          value={percoQuery}
        />
        <input
          aria-label="Фильтр кандидатов проекта"
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Фильтр кандидатов проекта"
          type="search"
          value={search}
        />
        <span>PERCO: {filteredUnmatchedEmployees.length} · готовых рекомендаций: {suggestedCount} · кандидатов: {employeeOptions.length}</span>
      </div>
      {filteredUnmatchedEmployees.length === 0 ? (
        <EmptyBlock title="Несопоставленных сотрудников нет" text="Новые записи появятся после синхронизации сотрудников PERCo." />
      ) : (
        <>
          <div className="perco-table">
            {pagination.pageItems.map((item) => (
              <article key={item.percoEmployeeId}>
              <div>
                <strong>{item.fullName || "Без ФИО"}</strong>
                <span>
                  Табельный: {item.personnelNo || "-"} · карта: {item.cardNumber || "-"} · {item.department || "подразделение не указано"}
                </span>
                {item.suggestedEmployeeName ? (
                  <small className="perco-match-suggestion">
                    Рекомендация: <b>{item.suggestedEmployeeName}</b> · {getMatchSuggestionReason(item, employeeOptions)} · подставлено автоматически, проверьте перед подтверждением.
                  </small>
                ) : (
                  <small className="perco-match-empty-hint">Совпадение не найдено автоматически. Используйте поиск кандидатов проекта.</small>
                )}
              </div>
              <div className="perco-match-actions">
                <select
                  disabled={!canMatch || isBusyStatus(status)}
                  onChange={(event) => onSelect(item.percoEmployeeId, event.target.value)}
                  value={selectedMatch[item.percoEmployeeId] ?? ""}
                >
                  <option value="">Выберите сотрудника</option>
                  {item.suggestedEmployeeId && !employeeOptions.some((employee) => employee.id === item.suggestedEmployeeId) ? (
                    <option value={item.suggestedEmployeeId}>{item.suggestedEmployeeName} · рекомендация</option>
                  ) : null}
                  {employeeOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.fullName} · {employee.personnelNo || "без таб."}
                    </option>
                  ))}
                </select>
                <button className="perco-button perco-button-primary" disabled={!canMatch || isBusyStatus(status)} onClick={() => onSubmit(item.percoEmployeeId, "match")} type="button">
                  {status === "saving" ? "Сохраняем…" : item.suggestedEmployeeId && selectedMatch[item.percoEmployeeId] === item.suggestedEmployeeId ? "Подтвердить предложение" : "Связать"}
                </button>
                <button className="perco-button perco-button-secondary" disabled={!canMatch || isBusyStatus(status)} onClick={() => setIgnoreCandidate(item)} type="button">
                  Игнорировать
                </button>
              </div>
              </article>
            ))}
          </div>
          <ListPagination
            page={pagination.page}
            pageCount={pagination.pageCount}
            pageSize={pagination.pageSize}
            total={filteredUnmatchedEmployees.length}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </>
      )}
      {ignoreCandidate ? (
        <ConfirmIgnoreEmployeeModal
          employee={ignoreCandidate}
          onCancel={() => setIgnoreCandidate(null)}
          onConfirm={() => {
            const employeeId = ignoreCandidate.percoEmployeeId;
            setIgnoreCandidate(null);
            onSubmit(employeeId, "ignore");
          }}
        />
      ) : null}
    </section>
  );
}

type PresenceFilter = "all" | PresenceEmployeeSummary["state"] | "unmatched";

function PercoDashboardTab({
  canSync,
  diagnostics,
  logs,
  settings,
  status,
  onCloseInterval,
  onNavigate,
  onRefresh,
  onSyncEvents,
}: {
  canSync: boolean;
  diagnostics: PercoDiagnosticsDto | null;
  logs: PercoIntegrationLogDto[];
  settings: PercoIntegrationSettingsDto | null;
  status: LoadStatus;
  onCloseInterval: (interval: PercoPresenceIntervalDiagnosticsDto) => void;
  onNavigate: (tab: PercoTab) => void;
  onRefresh: () => Promise<void>;
  onSyncEvents: () => void;
}) {
  const analytics = useMemo(() => buildPresenceAnalytics(diagnostics), [diagnostics]);
  const hourlyFlow = useMemo(() => buildHourlyFlow(diagnostics?.recentEvents ?? []), [diagnostics?.recentEvents]);
  const durationBuckets = useMemo(() => buildDurationBuckets(diagnostics?.presenceIntervals ?? []), [diagnostics?.presenceIntervals]);
  const dataQuality = useMemo(() => buildPercoQuality(diagnostics, analytics), [analytics, diagnostics]);
  const staleIntervals = [...analytics.staleIntervals, ...analytics.archiveOpenIntervals].slice(0, 5);
  const recentEvents = (diagnostics?.recentEvents ?? []).slice(0, 8);
  const topEmployees = analytics.employees.filter((employee) => employee.state === "inside").slice(0, 6);
  const lastLog = logs[0];

  if (!diagnostics) {
    return (
      <section className="perco-dashboard-empty perco-card">
        <div>
          <h2>Дашборд PERCo еще не загружен</h2>
          <span>Запустите обновление, чтобы увидеть входы, выходы, присутствие и спорные интервалы.</span>
        </div>
        <button className="perco-button perco-button-primary" disabled={isBusyStatus(status)} onClick={() => void onRefresh()} type="button">
          Обновить данные
        </button>
      </section>
    );
  }

  const refreshSeconds = 15;

  return (
    <section className="perco-dashboard">
      <div className="perco-dashboard-head perco-card">
        <div>
          <span className="perco-eyebrow">Оперативный контроль</span>
          <h2>Входы, выходы и присутствие на территории</h2>
          <p>
            Обновлено: {formatDateTime(diagnostics.generatedAt)} · окно расчета: {formatDateTime(diagnostics.windowStart)} - {formatDateTime(diagnostics.windowEnd)} · автообновление каждые {refreshSeconds} сек.
          </p>
        </div>
        <div className="perco-dashboard-actions">
          {canSync ? (
            <button className="perco-button perco-button-primary" disabled={isBusyStatus(status)} onClick={onSyncEvents} type="button">
              {isBusyStatus(status) ? "Выполняется…" : "Синхронизировать проходы"}
            </button>
          ) : null}
          <button className="perco-button perco-button-secondary" disabled={isBusyStatus(status)} onClick={() => void onRefresh()} type="button">
            {isBusyStatus(status) ? "Обновляем…" : "Обновить дашборд"}
          </button>
        </div>
      </div>

      <div className="perco-dashboard-kpis">
        <MetricCard label="Сейчас на территории" value={analytics.insideCount} note="актуальные входы" tone={analytics.insideCount > 0 ? "success" : "default"} />
        <MetricCard label="Вышли с территории" value={analytics.outsideCount} note="по последнему выходу" />
        <MetricCard label="Спорные смены" value={analytics.staleCount} note="требуют проверки" tone={analytics.staleCount > 0 ? "danger" : "success"} />
        <MetricCard label="Старые зависшие" value={diagnostics.oldOpenPresenceCount ?? 0} note="не входят в текущую смену" tone={(diagnostics.oldOpenPresenceCount ?? 0) > 0 ? "warning" : "success"} />
        <MetricCard label="Без сотрудника" value={diagnostics.unmatchedEventsCount} note="нужно сопоставить" tone={diagnostics.unmatchedEventsCount > 0 ? "warning" : "success"} />
      </div>

      <div className="perco-scenario-grid">
        <button className="perco-scenario-card" onClick={() => onNavigate("diagnostics")} type="button">
          <b>Проверить смены</b>
          <span>{analytics.staleCount + (diagnostics.oldOpenPresenceCount ?? 0) > 0 ? `${analytics.staleCount + (diagnostics.oldOpenPresenceCount ?? 0)} требуют проверки` : "критичных зависаний нет"}</span>
        </button>
        <button className="perco-scenario-card" onClick={() => onNavigate("matching")} type="button">
          <b>Сопоставить сотрудников</b>
          <span>{diagnostics.unmatchedEventsCount > 0 ? `${diagnostics.unmatchedEventsCount} проходов без сотрудника` : "все проходы сопоставлены"}</span>
        </button>
        <button className="perco-scenario-card" onClick={() => onNavigate("logs")} type="button">
          <b>Журнал синхронизации</b>
          <span>{lastLog ? `${formatOperation(lastLog.operation)} · ${formatDateTime(lastLog.startedAt)}` : "записей журнала нет"}</span>
        </button>
        <button className="perco-scenario-card" onClick={() => onNavigate("connection")} type="button">
          <b>Проверить подключение</b>
          <span>{formatStatus(settings?.lastConnectionStatus ?? "idle")}</span>
        </button>
      </div>

      <div className="perco-live-analytics-grid">
        <section className="perco-analytics-panel perco-flow-panel">
          <div className="perco-analytics-head">
            <div>
              <h3>Динамика входов и выходов</h3>
              <span>Пиковые часы и перекос вход/выход</span>
            </div>
            <b>{recentEvents.length} последних</b>
          </div>
          <PercoFlowChart points={hourlyFlow} />
        </section>

        <section className="perco-analytics-panel">
          <div className="perco-analytics-head">
            <div>
              <h3>Присутствие</h3>
              <span>Кто на территории прямо сейчас</span>
            </div>
          </div>
          <PresenceRatio inside={analytics.insideCount} outside={analytics.outsideCount} stale={analytics.staleCount} />
        </section>

        <section className="perco-analytics-panel">
          <div className="perco-analytics-head">
            <div>
              <h3>Длительность</h3>
              <span>Распределение смен</span>
            </div>
          </div>
          <DurationBars buckets={durationBuckets} />
        </section>

        <section className="perco-analytics-panel">
          <div className="perco-analytics-head">
            <div>
              <h3>Качество данных</h3>
              <span>Что мешает автоматическому расчету</span>
            </div>
          </div>
          <div className="perco-quality-list">
            {dataQuality.map((item) => (
              <article className={`tone-${item.tone}`} key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="perco-dashboard-main-grid">
        <section className="perco-card perco-card-flat">
          <header>
            <div>
              <h2>Кто сейчас на территории</h2>
              <span>Сотрудники с максимальным временем присутствия</span>
            </div>
            <button className="perco-link-button" onClick={() => onNavigate("diagnostics")} type="button">Все смены</button>
          </header>
          <div className="perco-dashboard-employee-list">
            {topEmployees.length === 0 ? (
              <EmptyBlock title="Смен пока нет" text="После синхронизации проходов здесь появятся интервалы присутствия." />
            ) : (
              topEmployees.map((employee) => (
                <article key={`${employee.employeeId}-${employee.employeeName}`}>
                  <span className={`perco-presence-dot ${employee.state}`} />
                  <div>
                    <strong>{employee.employeeName}</strong>
                    <small>{employee.personnelNo || "без табельного"} · {employee.openIntervals > 0 ? "на территории" : "вышел"}</small>
                  </div>
                  <b>{formatDuration(employee.totalMinutes)}</b>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="perco-card perco-card-flat">
          <header>
            <div>
              <h2>Требует внимания</h2>
              <span>Зависшие смены и интервалы без выхода</span>
            </div>
          </header>
          <div className="perco-dashboard-attention-list">
            {staleIntervals.length === 0 ? (
              <EmptyBlock title="Критичных зависаний нет" text="Открытые интервалы не превышают порог проверки." />
            ) : (
              staleIntervals.map((interval) => (
                <article className={isOldOpenInterval(interval) ? "is-archive" : ""} key={interval.id}>
                  <div>
                    <strong>{interval.employeeName}</strong>
                    <span>{isOldOpenInterval(interval) ? "Старый открытый вход" : "Вход"}: {formatDateTime(interval.startedAt)} · {formatDuration(interval.durationMinutes)}</span>
                  </div>
                  {!interval.endedAt ? (
                    <button className="perco-link-button" onClick={() => onCloseInterval(interval)} type="button">Закрыть вручную</button>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>

        <section className="perco-card perco-card-flat">
          <header>
            <div>
              <h2>Последние проходы</h2>
              <span>Контроль свежих событий входа и выхода</span>
            </div>
          </header>
          <div className="perco-dashboard-event-list">
            {recentEvents.length === 0 ? (
              <EmptyBlock title="Проходов нет" text="Запустите синхронизацию проходов PERCo." />
            ) : (
              recentEvents.map((event) => (
                <article key={event.id}>
                  <b className={event.direction === "IN" ? "in" : event.direction === "OUT" ? "out" : ""}>{event.directionLabel || event.direction}</b>
                  <div>
                    <strong>{event.employeeName || "Сотрудник не сопоставлен"}</strong>
                    <span>{event.zoneTransition || "зона не определена"} · {formatDateTime(event.eventAt)}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
function DiagnosticsTab({
  canSync,
  canManage,
  diagnostics,
  settings,
  status,
  onCloseInterval,
  onRefresh,
}: {
  canSync: boolean;
  canManage: boolean;
  diagnostics: PercoDiagnosticsDto | null;
  settings: PercoIntegrationSettingsDto | null;
  status: LoadStatus;
  onCloseInterval: (interval: PercoPresenceIntervalDiagnosticsDto) => void;
  onRefresh: () => Promise<void>;
}) {
  const [presenceQuery, setPresenceQuery] = useState("");
  const [presenceState, setPresenceState] = useState<PresenceFilter>("all");
  const analytics = useMemo(() => buildPresenceAnalytics(diagnostics), [diagnostics]);
  const normalizedPresenceQuery = useMemo(() => normalizeSearch(presenceQuery), [presenceQuery]);
  const filteredEmployees = useMemo(
    () =>
      analytics.employees.filter((employee) => {
        if (presenceState === "unmatched") return false;
        const matchesState = presenceState === "all" || employee.state === presenceState;
        const matchesQuery =
          !normalizedPresenceQuery ||
          normalizeSearch(`${employee.employeeName} ${employee.personnelNo}`).includes(normalizedPresenceQuery);
        return matchesState && matchesQuery;
      }),
    [analytics.employees, normalizedPresenceQuery, presenceState],
  );
  const activeShiftEmployees = useMemo(
    () => filteredEmployees.filter((employee) => employee.state === "inside"),
    [filteredEmployees],
  );
  const completedShiftEmployees = useMemo(
    () => filteredEmployees.filter((employee) => employee.state === "outside"),
    [filteredEmployees],
  );
  const filteredProblemIntervals = useMemo(() => {
    const source =
      presenceState === "stale"
        ? [...analytics.staleIntervals, ...analytics.archiveOpenIntervals]
        : presenceState === "all"
          ? [...analytics.staleIntervals, ...analytics.archiveOpenIntervals, ...analytics.openIntervals]
          : analytics.openIntervals;
    return source.filter((interval) => {
      if (presenceState === "unmatched" || presenceState === "outside") return false;
      const matchesState =
        presenceState === "all" ||
        (presenceState === "stale" ? isStaleInterval(interval) || isOldOpenInterval(interval) : presenceState === "inside" && !isStaleInterval(interval) && !isOldOpenInterval(interval));
      const matchesQuery =
        !normalizedPresenceQuery ||
        normalizeSearch(`${interval.employeeName} ${interval.personnelNo}`).includes(normalizedPresenceQuery);
      return matchesState && matchesQuery;
    });
  }, [analytics.archiveOpenIntervals, analytics.openIntervals, analytics.staleIntervals, normalizedPresenceQuery, presenceState]);
  const filteredRecentEvents = useMemo(
    () =>
      diagnostics?.recentEvents.filter((event) => {
        const matchesQuery =
          !normalizedPresenceQuery ||
          normalizeSearch(`${event.employeeName} ${event.personnelNo} ${event.zoneTransition} ${event.deviceName}`).includes(normalizedPresenceQuery);
        const matchesState =
          presenceState === "all" ||
          (presenceState === "inside" && event.direction === "IN") ||
          (presenceState === "outside" && event.direction === "OUT") ||
          (presenceState === "unmatched" && !event.employeeId) ||
          (presenceState === "stale" && (!event.employeeId || event.shiftMarker?.toLowerCase().includes("спор")));
        return matchesQuery && matchesState;
      }) ?? [],
    [diagnostics?.recentEvents, normalizedPresenceQuery, presenceState],
  );
  const hourlyFlow = useMemo(() => buildHourlyFlow(diagnostics?.recentEvents ?? []), [diagnostics?.recentEvents]);
  const durationBuckets = useMemo(() => buildDurationBuckets(diagnostics?.presenceIntervals ?? []), [diagnostics?.presenceIntervals]);
  const dataQuality = useMemo(() => buildPercoQuality(diagnostics, analytics), [analytics, diagnostics]);
  const activePagination = usePercoPagination(activeShiftEmployees, diagnosticsListPageSize);
  const completedPagination = usePercoPagination(completedShiftEmployees, diagnosticsListPageSize);
  const problemPagination = usePercoPagination(filteredProblemIntervals, diagnosticsListPageSize);
  const eventPagination = usePercoPagination(filteredRecentEvents, defaultListPageSize);

  if (!diagnostics) {
    return <EmptyBlock title="Диагностика еще не загружена" text="Нажмите обновить или проверьте подключение PERCo-Web." />;
  }

  return (
    <section className="perco-card">
      <header>
        <div>
          <h2>Проверка проходов, смен и простоев</h2>
          <span>
            Последнее обновление: {formatDateTime(diagnostics.generatedAt)} · период: {formatDateTime(diagnostics.windowStart)} - {formatDateTime(diagnostics.windowEnd)} · endpoint: {settings?.eventsEndpoint || "-"}
          </span>
        </div>
        <button className="perco-button perco-button-secondary" disabled={isBusyStatus(status)} onClick={() => void onRefresh()} type="button">
          {isBusyStatus(status) ? "Выполняется…" : canSync ? "Синхронизировать проходы" : "Обновить диагностику"}
        </button>
      </header>

      <div className="perco-diagnostics-summary perco-diagnostics-summary-wide">
        <MetricCard label="Проходов загружено" value={diagnostics.recentEventsCount} note="последняя выборка" />
        <MetricCard label="Сейчас на территории" value={analytics.insideCount} note="актуальные входы" />
        <MetricCard label="Вышли" value={analytics.outsideCount || (diagnostics.closedPresenceCount ?? 0)} note="по последнему выходу" tone="success" />
        <MetricCard label="Не сопоставлено" value={diagnostics.unmatchedEventsCount} note="проходы без сотрудника" tone={diagnostics.unmatchedEventsCount > 0 ? "warning" : "success"} />
        <MetricCard label="Часов на территории" value={formatDuration(analytics.totalMinutes)} note="без спорных интервалов" />
        <MetricCard label="Спорные интервалы" value={analytics.staleCount} note="текущая смена" tone={analytics.staleCount > 0 ? "danger" : "success"} />
        <MetricCard label="Старые зависшие" value={diagnostics.oldOpenPresenceCount ?? 0} note="архивная проверка" tone={(diagnostics.oldOpenPresenceCount ?? 0) > 0 ? "warning" : "success"} />
      </div>

      <div className="perco-diagnostics-controls">
        <label>
          <span>Поиск сотрудника</span>
          <input
            placeholder="ФИО или табельный"
            type="search"
            value={presenceQuery}
            onChange={(event) => setPresenceQuery(event.target.value)}
          />
        </label>
        <label>
          <span>Состояние</span>
          <select value={presenceState} onChange={(event) => setPresenceState(event.target.value as typeof presenceState)}>
            <option value="all">Все</option>
            <option value="inside">На заводе</option>
            <option value="outside">Вышли</option>
            <option value="stale">Спорные / зависшие</option>
            <option value="unmatched">Без сотрудника</option>
          </select>
        </label>
      </div>

      <div className="perco-live-analytics-grid">
        <section className="perco-analytics-panel perco-flow-panel">
          <div className="perco-analytics-head">
            <div>
              <h3>Динамика входов и выходов</h3>
              <span>Автоматически по последним проходам PERCo</span>
            </div>
            <b>{diagnostics.recentEventsCount} событий</b>
          </div>
          <PercoFlowChart points={hourlyFlow} />
        </section>

        <section className="perco-analytics-panel">
          <div className="perco-analytics-head">
            <div>
              <h3>Присутствие сейчас</h3>
              <span>Сводка по открытым и закрытым интервалам</span>
            </div>
          </div>
          <PresenceRatio inside={analytics.insideCount} outside={analytics.outsideCount} stale={analytics.staleCount} />
        </section>

        <section className="perco-analytics-panel">
          <div className="perco-analytics-head">
            <div>
              <h3>Длительность смен</h3>
              <span>Распределение по времени на территории</span>
            </div>
          </div>
          <DurationBars buckets={durationBuckets} />
        </section>

        <section className="perco-analytics-panel">
          <div className="perco-analytics-head">
            <div>
              <h3>Качество данных</h3>
              <span>Что требует внимания оператора</span>
            </div>
          </div>
          <div className="perco-quality-list">
            {dataQuality.map((item) => (
              <article className={`tone-${item.tone}`} key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="perco-presence-analytics">
        <div className="perco-presence-split">
          <section className="perco-card perco-card-flat">
            <header>
              <div>
                <h2>Сейчас на заводе</h2>
                <span>Открытые входы: кто находится на смене и сколько времени уже работает.</span>
              </div>
              <b className="perco-section-counter">{activeShiftEmployees.length}</b>
            </header>
            {activeShiftEmployees.length === 0 ? (
              <EmptyBlock title="На заводе сейчас никого нет" text="Открытые входы появятся после синхронизации проходов PERCo." />
            ) : (
              <div className="perco-presence-list">
                {activePagination.pageItems.map((employee) => (
                  <article className="is-active-shift" key={`${employee.employeeId}-${employee.employeeName}`}>
                    <div className="perco-presence-person">
                      <span className="perco-presence-dot inside" />
                      <div>
                        <strong>{employee.employeeName}</strong>
                        <small>
                          {employee.personnelNo || "без табельного"} · вход: {employee.currentStartedAt ? formatDateTime(employee.currentStartedAt) : employee.firstIn ? formatDateTime(employee.firstIn) : "-"}
                        </small>
                      </div>
                    </div>
                    <div className="perco-presence-metrics">
                      <span>{formatDuration(employee.currentMinutes)}</span>
                      <b>На заводе</b>
                    </div>
                    <PresenceTimeline intervals={employee.intervals} />
                  </article>
                ))}
              </div>
            )}
            <ListPagination
              page={activePagination.page}
              pageCount={activePagination.pageCount}
              pageSize={activePagination.pageSize}
              total={activeShiftEmployees.length}
              onPageChange={activePagination.setPage}
              onPageSizeChange={activePagination.setPageSize}
            />
          </section>

          <section className="perco-card perco-card-flat">
            <header>
              <div>
                <h2>Смену завершили</h2>
                <span>Закрытые интервалы: кто вышел с завода и сколько пробыл на территории.</span>
              </div>
              <b className="perco-section-counter">{completedShiftEmployees.length}</b>
            </header>
            {completedShiftEmployees.length === 0 ? (
              <EmptyBlock title="Завершенных смен пока нет" text="Здесь появятся сотрудники, по которым PERCo уже прислал вход и выход." />
            ) : (
              <div className="perco-presence-list">
                {completedPagination.pageItems.map((employee) => (
                  <article className="is-completed-shift" key={`${employee.employeeId}-${employee.employeeName}`}>
                    <div className="perco-presence-person">
                      <span className="perco-presence-dot outside" />
                      <div>
                        <strong>{employee.employeeName}</strong>
                        <small>
                          {employee.personnelNo || "без табельного"} · вход: {employee.firstIn ? formatDateTime(employee.firstIn) : "-"} · выход: {employee.lastOut ? formatDateTime(employee.lastOut) : "-"}
                        </small>
                        {employee.intervals.some((interval) => interval.stateCode === "outside_review") ? (
                          <small className="perco-auto-resolution-note">Выход подтверждён PERCO; аномальная длительность сохранена в аудите.</small>
                        ) : null}
                      </div>
                    </div>
                    <div className="perco-presence-metrics">
                      <span>{formatDuration(employee.totalMinutes)}</span>
                      <b>Вышел</b>
                    </div>
                    <PresenceTimeline intervals={employee.intervals} />
                  </article>
                ))}
              </div>
            )}
            <ListPagination
              page={completedPagination.page}
              pageCount={completedPagination.pageCount}
              pageSize={completedPagination.pageSize}
              total={completedShiftEmployees.length}
              onPageChange={completedPagination.setPage}
              onPageSizeChange={completedPagination.setPageSize}
            />
          </section>
        </div>

        <section className="perco-card perco-card-flat">
          <header>
            <div>
              <h2>Зависшие и спорные интервалы</h2>
              <span>Ручное закрытие нужно только когда PERCo не прислал корректный выход с завода.</span>
            </div>
          </header>
          <div className="perco-diagnostics-list">
            {filteredProblemIntervals.length === 0 ? (
              <EmptyBlock title="Спорных интервалов нет" text="Все найденные проходы имеют корректные входы и выходы." />
            ) : (
                problemPagination.pageItems.map((interval) => (
                <article className={isOldOpenInterval(interval) ? "is-archive" : ""} key={interval.id}>
                  <div>
                    <strong>{interval.employeeName}</strong>
                    <span>
                      {isOldOpenInterval(interval) ? "Старый открытый вход" : "Вход"}: {formatDateTime(interval.startedAt)} · {interval.endedAt ? `выход: ${formatDateTime(interval.endedAt)}` : "выход не найден"} · {formatDuration(interval.durationMinutes)}
                    </span>
                    <small>
                      {interval.personnelNo || "без табельного"} · источник: {interval.source || "-"} · состояние: {interval.state || "-"}
                    </small>
                    {interval.analysisReason ? (
                      <small className="perco-analysis-note">
                        Анализ: {interval.analysisReason}
                      </small>
                    ) : null}
                    {interval.suggestedAction ? (
                      <small className="perco-analysis-action">
                        Действие: {interval.suggestedAction}
                        {typeof interval.analysisConfidence === "number" ? ` · уверенность ${interval.analysisConfidence}%` : ""}
                      </small>
                    ) : null}
                  </div>
                  <aside>
                    <b className={isStaleInterval(interval) || isOldOpenInterval(interval) ? "stale" : "in"}>{isOldOpenInterval(interval) ? "Старый" : isStaleInterval(interval) ? "Проверить" : "Открыт"}</b>
                    {canManage && !interval.endedAt ? (
                      <button className="perco-link-button" disabled={isBusyStatus(status)} onClick={() => onCloseInterval(interval)} type="button">
                        Закрыть вручную
                      </button>
                    ) : null}
                  </aside>
                </article>
              ))
            )}
          </div>
          <ListPagination
            page={problemPagination.page}
            pageCount={problemPagination.pageCount}
            pageSize={problemPagination.pageSize}
            total={filteredProblemIntervals.length}
            onPageChange={problemPagination.setPage}
            onPageSizeChange={problemPagination.setPageSize}
          />
        </section>
      </div>

      <div className="perco-diagnostics-grid">
        <section className="perco-diagnostics-panel">
          <h3>Последние проходы</h3>
          <div className="perco-diagnostics-list">
            {filteredRecentEvents.length === 0 ? (
              <EmptyBlock title="Проходов по фильтру нет" text="Измените фильтр или обновите диагностику проходов." />
            ) : (
              eventPagination.pageItems.map((event) => (
                <article key={event.id}>
                  <div>
                    <strong>{event.employeeName || "Сотрудник не сопоставлен"}</strong>
                    <span>
                      {event.zoneTransition || "зона не определена"} · {event.deviceName || "устройство не указано"}
                    </span>
                    <small>
                      {event.personnelNo || "без табельного"} · {event.shiftMarker || "смена не определена"}
                    </small>
                  </div>
                  <aside>
                    <b className={event.direction === "IN" ? "in" : event.direction === "OUT" ? "out" : ""}>{event.directionLabel || event.direction}</b>
                    <time>{formatDateTime(event.eventAt)}</time>
                  </aside>
                </article>
              ))
            )}
          </div>
          <ListPagination
            page={eventPagination.page}
            pageCount={eventPagination.pageCount}
            pageSize={eventPagination.pageSize}
            total={filteredRecentEvents.length}
            onPageChange={eventPagination.setPage}
            onPageSizeChange={eventPagination.setPageSize}
          />
        </section>

        <section className="perco-diagnostics-panel">
          <h3>Правила учета смен</h3>
          <div className="perco-shift-rules">
            <article>
              <strong>Опоздание</strong>
              <span>Если первый вход позже начала смены, смена считается с фактического входа.</span>
            </article>
            <article>
              <strong>Выход на обед</strong>
              <span>Выход и повторный вход днем не закрывают смену, а дают отдельный интервал отсутствия.</span>
            </article>
            <article>
              <strong>Ложное закрытие</strong>
              <span>Открытый вход без выхода попадает в спорные интервалы. Оператор закрывает его вручную с причиной.</span>
            </article>
          </div>
        </section>
      </div>
    </section>
  );
}
function LogsTab({ canView, logs, status, onRefresh }: { canView: boolean; logs: PercoIntegrationLogDto[]; status: LoadStatus; onRefresh: () => void }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = useMemo(() => normalizeSearch(query), [query]);
  const filteredLogs = useMemo(
    () =>
      logs.filter((log) =>
        !normalizedQuery ||
        normalizeSearch(`${formatOperation(log.operation)} ${formatLogStatus(log.status)} ${formatLogSource(log.createdByUserId)} ${log.message} ${formatLogDetails(log.details)}`).includes(normalizedQuery),
      ),
    [logs, normalizedQuery],
  );
  const pagination = usePercoPagination(filteredLogs, defaultListPageSize);

  if (!canView) {
    return <EmptyBlock title="Нет доступа к журналу" text="Для просмотра журнала требуется integrations.perco.logs.view." />;
  }

  return (
    <section className="perco-card">
      <header>
        <div>
          <h2>Журнал синхронизации</h2>
          <span>Последние операции API и worker.</span>
        </div>
        <button className="perco-button perco-button-secondary" disabled={isBusyStatus(status)} onClick={onRefresh} type="button">
          {isBusyStatus(status) ? "Обновляем…" : "Обновить журнал"}
        </button>
      </header>
      <div className="perco-list-toolbar">
        <input
          aria-label="Поиск по журналу PERCO"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Операция, статус или текст сообщения"
          type="search"
          value={query}
        />
        <span>Найдено: {filteredLogs.length}</span>
      </div>
      {filteredLogs.length === 0 ? (
        <EmptyBlock title="Записей журнала нет" text="Журнал появится после проверки подключения или синхронизации." />
      ) : (
        <>
          <div className="perco-log-list">
            {pagination.pageItems.map((log) => (
              <article key={log.id}>
                <div>
                  <strong>{formatOperation(log.operation)}</strong>
                  <small className="perco-log-meta">{formatLogSource(log.createdByUserId)} · код: {log.operation || "-"}</small>
                  <span>{log.message || "Операция без сообщения"}</span>
                  {log.details ? <small className="perco-log-details">{formatLogDetails(log.details)}</small> : null}
                </div>
                <aside>
                  <b className={normalizeStatusTone(log.status)}>{formatLogStatus(log.status)}</b>
                  <time>{formatDateTime(log.startedAt)}</time>
                </aside>
              </article>
            ))}
          </div>
          <ListPagination
            page={pagination.page}
            pageCount={pagination.pageCount}
            pageSize={pagination.pageSize}
            total={filteredLogs.length}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </>
      )}
    </section>
  );
}
