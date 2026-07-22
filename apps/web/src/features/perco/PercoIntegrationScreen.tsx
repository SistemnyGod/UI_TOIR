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

type PercoTab = "dashboard" | "connection" | "sync" | "matching" | "diagnostics" | "logs";
type LoadStatus = "idle" | "loading" | "ready" | "saving" | "error";

interface PercoIntegrationScreenProps {
  currentUser: SessionUserDto | null;
  employeeDirectory: EmployeeDirectoryItem[];
  onNotify: (message: string) => void;
}

interface SettingsForm {
  authMode: "LoginPassword" | "Token";
  baseUrl: string;
  devPath: string;
  employeesEndpoint: string;
  employeesSyncMinutes: number;
  eventsEndpoint: string;
  eventsSyncMinutes: number;
  isEnabled: boolean;
  password: string;
  shiftEndToleranceMinutes: number;
  shiftStartToleranceMinutes: number;
  timezone: string;
  token: string;
  username: string;
}

interface PresenceEmployeeSummary {
  closedMinutes: number;
  currentMinutes: number;
  currentStartedAt: string | null;
  employeeId: string;
  employeeName: string;
  firstIn: string | null;
  intervals: PercoPresenceIntervalDiagnosticsDto[];
  latestEventAt: string | null;
  latestEventDirection: "IN" | "OUT" | "UNKNOWN" | null;
  lastOut: string | null;
  openIntervals: number;
  personnelNo: string;
  state: "inside" | "outside" | "stale";
  totalMinutes: number;
}

interface PercoHourlyFlowPoint {
  hour: string;
  inCount: number;
  outCount: number;
}

interface PercoDurationBucket {
  label: string;
  count: number;
}

const defaultSettings: SettingsForm = {
  authMode: "LoginPassword",
  baseUrl: "http://192.168.2.76",
  devPath: "/dev",
  employeesEndpoint: "/api/users/staff/fullList",
  employeesSyncMinutes: 60,
  eventsEndpoint: "/api/accessReports/events",
  eventsSyncMinutes: 5,
  isEnabled: true,
  password: "",
  shiftEndToleranceMinutes: 30,
  shiftStartToleranceMinutes: 30,
  timezone: "Asia/Yekaterinburg",
  token: "",
  username: "patrol",
};

const percoTabs: Array<{ id: PercoTab; label: string }> = [
  { id: "dashboard", label: "Дашборд" },
  { id: "connection", label: "Подключение" },
  { id: "sync", label: "Синхронизация" },
  { id: "matching", label: "Сопоставление" },
  { id: "diagnostics", label: "Проходы и смены" },
  { id: "logs", label: "Журнал" },
];

const repository = createPercoRepository();

const percoTabOrder = percoTabs.map((tab) => tab.id);
const pageSizeOptions = [10, 25, 50, 100] as const;
type PercoPageSize = (typeof pageSizeOptions)[number];
const defaultListPageSize: PercoPageSize = 10;
const diagnosticsListPageSize: PercoPageSize = 10;

function getPercoTabLabel(tab: PercoTab) {
  const labels: Record<PercoTab, string> = {
    connection: "Подключение",
    dashboard: "Дашборд",
    diagnostics: "Проходы и смены",
    logs: "Журнал",
    matching: "Сопоставление",
    sync: "Синхронизация",
  };
  return labels[tab];
}

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

function SettingsStatus({ settings }: { settings: PercoIntegrationSettingsDto | null }) {
  if (!settings) {
    return <EmptyBlock title="Настройки не загружены" text="Проверьте доступность API." />;
  }

  return (
    <aside className="perco-card perco-status-card">
      <h2>Состояние</h2>
      <dl>
        <div>
          <dt>Интеграция</dt>
          <dd>{settings.isEnabled ? "Включена" : "Выключена"}</dd>
        </div>
        <div>
          <dt>Авторизация</dt>
          <dd>{settings.authMode === "Token" ? "Token" : "Логин и пароль"}</dd>
        </div>
        <div>
          <dt>Секрет конфигурации</dt>
          <dd>
            <span className={`perco-secret-state ${settings.authMode === "Token" ? (settings.hasToken ? "is-saved" : "is-empty") : (settings.hasPassword ? "is-saved" : "is-empty")}`}>
              {settings.authMode === "Token" ? (settings.hasToken ? "Сохранён" : "Не задан") : (settings.hasPassword ? "Сохранён" : "Не задан")}
            </span>
          </dd>
        </div>
        <div>
          <dt>Секрет API</dt>
          <dd>{settings.secretStatus?.apiStatus || "не проверен"}</dd>
        </div>
        <div>
          <dt>Секрет worker</dt>
          <dd>{settings.secretStatus?.workerStatus || "не проверен"}</dd>
        </div>
        <div>
          <dt>Последняя проверка</dt>
          <dd>{settings.lastConnectionCheckAt ? formatDateTime(settings.lastConnectionCheckAt) : "нет"}</dd>
        </div>
        <div>
          <dt>Статус</dt>
          <dd>{settings.lastConnectionStatus || "нет данных"}</dd>
        </div>
      </dl>
      {settings.lastConnectionError ? (
        <div className="perco-alert perco-alert-error">
          <strong>Ошибка подключения</strong>
          <span>{settings.lastConnectionError}</span>
        </div>
      ) : null}
    </aside>
  );
}

function ConnectionResult({ result }: { result: PercoConnectionTestResultDto }) {
  return (
    <div className={`perco-sync-result ${result.success ? "success" : "error"}`}>
      <strong>{result.message}</strong>
      <span>Проверено: {formatDateTime(result.checkedAt)}</span>
      <div>
        <span>/dev: {result.devPageAvailable ? "доступен" : "недоступен"}</span>
        <span>auth: {result.authAvailable ? "доступен" : "недоступен"}</span>
        <span>endpoint: {result.discoveredEndpoints.length}</span>
        <span>{result.success ? "готово" : "требует проверки"}</span>
      </div>
      {result.discoveredEndpoints.length > 0 ? (
        <div className="perco-endpoint-list">
          {result.discoveredEndpoints.map((endpoint) => (
            <article key={`${endpoint.kind}-${endpoint.url}`}>
              <div>
                <strong>{endpoint.kind}</strong>
                <span>{endpoint.url}</span>
              </div>
              <StatusPill status={endpoint.status} />
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SyncSummary({ result }: { result: PercoSyncResultDto }) {
  return (
    <div className={`perco-sync-result ${result.success ? "success" : "error"}`}>
      <strong>{result.message}</strong>
      <div>
        <span>Загружено: {result.loaded}</span>
        <span>Создано: {result.created + result.inserted}</span>
        <span>Обновлено: {result.updated}</span>
        <span>Ошибки: {result.errors}</span>
      </div>
      <div>
        <span>Дубли: {result.duplicates}</span>
        <span>Не сопоставлено: {result.unmatched}</span>
        <span>Статус: {result.status}</span>
        <span>Синхронизация: {result.lastSyncAt ? formatDateTime(result.lastSyncAt) : "нет"}</span>
      </div>
    </div>
  );
}

function ConfirmIgnoreEmployeeModal({
  employee,
  onCancel,
  onConfirm,
}: {
  employee: PercoUnmatchedEmployeeDto;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => cancelButtonRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, []);

  return (
    <div className="perco-modal-backdrop" onMouseDown={onCancel}>
      <section
        aria-describedby="perco-ignore-description"
        aria-labelledby="perco-ignore-title"
        aria-modal="true"
        className="perco-modal perco-confirm-modal"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="alertdialog"
      >
        <header>
          <div>
            <h2 id="perco-ignore-title">Игнорировать сотрудника PERCO?</h2>
            <span>{employee.fullName || "Сотрудник без ФИО"} · {employee.personnelNo || "без табельного номера"}</span>
          </div>
        </header>
        <p className="perco-warning-text" id="perco-ignore-description">
          Запись будет исключена из текущей очереди сопоставления. Используйте это действие только если сотрудника действительно не нужно связывать со справочником проекта.
        </p>
        <div className="perco-modal-actions">
          <button className="perco-button perco-button-secondary" onClick={onCancel} ref={cancelButtonRef} type="button">
            Отмена
          </button>
          <button className="perco-button perco-button-danger" onClick={onConfirm} type="button">
            Игнорировать
          </button>
        </div>
      </section>
    </div>
  );
}

function ClosePresenceModal({
  form,
  interval,
  onCancel,
  onChange,
  onSubmit,
}: {
  form: ClosePercoPresenceIntervalDto;
  interval: PercoPresenceIntervalDiagnosticsDto;
  onCancel: () => void;
  onChange: (value: ClosePercoPresenceIntervalDto) => void;
  onSubmit: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const endedAtTimestamp = new Date(form.endedAt).getTime();
  const startedAtTimestamp = new Date(interval.startedAt).getTime();
  const previewDurationMinutes = Math.max(
    0,
    Math.round((endedAtTimestamp - startedAtTimestamp) / 60000),
  );
  const durationIsTooLong = previewDurationMinutes > 18 * 60;
  const endedAtIsInvalid =
    Number.isNaN(endedAtTimestamp) ||
    endedAtTimestamp <= startedAtTimestamp ||
    endedAtTimestamp > Date.now() + 60_000;
  const canSubmit = !durationIsTooLong && !endedAtIsInvalid && Boolean(form.comment.trim());

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>("input, textarea, button")?.focus());
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, []);

  return (
    <div className="perco-modal-backdrop" onMouseDown={onCancel}>
      <section
        aria-describedby="perco-close-description perco-close-duration"
        aria-labelledby="perco-close-title"
        className="perco-modal"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <h2 id="perco-close-title">Закрыть присутствие вручную</h2>
            <span>{interval.employeeName} · вход {formatDateTime(interval.startedAt)}</span>
          </div>
          <button className="perco-icon-button" onClick={onCancel} type="button" aria-label="Закрыть">
            ×
          </button>
        </header>
        <p className="perco-warning-text" id="perco-close-description">
          Используйте только когда PERCo не прислал выход с завода или направление прохода было распознано неверно.
        </p>
        <p className={`perco-warning-text ${durationIsTooLong || endedAtIsInvalid ? "is-danger" : ""}`} id="perco-close-duration">
          Расчетная длительность: {formatDuration(previewDurationMinutes)}. Максимум для ручного закрытия: 18 ч.
          {endedAtIsInvalid ? " Время выхода должно быть позже входа и не может быть в будущем." : ""}
        </p>
        <Field label="Время выхода">
          <input
            aria-invalid={endedAtIsInvalid}
            onChange={(event) => onChange({ ...form, endedAt: event.target.value })}
            type="datetime-local"
            value={form.endedAt}
          />
        </Field>
        <Field label="Причина">
          <textarea
            aria-invalid={!form.comment.trim()}
            onChange={(event) => onChange({ ...form, comment: event.target.value })}
            placeholder="Например: сотрудник вышел на обед, событие выхода не пришло из PERCo"
            required
            value={form.comment}
          />
        </Field>
        <div className="perco-modal-actions">
          <button className="perco-button perco-button-secondary" onClick={onCancel} type="button">
            Отмена
          </button>
          <button className="perco-button perco-button-primary" disabled={!canSubmit} onClick={onSubmit} type="button">
            Закрыть интервал
          </button>
        </div>
      </section>
    </div>
  );
}
function PercoFlowChart({ points }: { points: PercoHourlyFlowPoint[] }) {
  const max = Math.max(1, ...points.flatMap((point) => [point.inCount, point.outCount]));
  const hasData = points.some((point) => point.inCount > 0 || point.outCount > 0);
  return (
    <div className="perco-flow-chart" aria-label="График входов и выходов по часам">
      {hasData ? (
        <div className="perco-flow-bars">
          {points.map((point) => (
            <div className="perco-flow-hour" key={point.hour}>
              <div className="perco-flow-stack">
                <span className="in" style={{ height: getChartBarHeight(point.inCount, max) }} title={`Входов: ${point.inCount}`} />
                <span className="out" style={{ height: getChartBarHeight(point.outCount, max) }} title={`Выходов: ${point.outCount}`} />
              </div>
              <small>{point.hour}</small>
            </div>
          ))}
        </div>
      ) : (
        <div className="perco-chart-empty">Нет проходов за выбранный период</div>
      )}
      <div className="perco-chart-legend">
        <span><i className="in" /> Вход</span>
        <span><i className="out" /> Выход</span>
      </div>
    </div>
  );
}

function PresenceRatio({ inside, outside, stale }: { inside: number; outside: number; stale: number }) {
  const total = Math.max(inside + outside + stale, 1);
  const insidePercent = Math.round((inside / total) * 100);
  const outsidePercent = Math.round((outside / total) * 100);
  const stalePercent = Math.round((stale / total) * 100);
  return (
    <div className="perco-presence-ratio">
      <div
        className="perco-presence-ring"
        style={{
          background: `conic-gradient(#0b63f6 0 ${insidePercent}%, #10b981 ${insidePercent}% ${insidePercent + outsidePercent}%, #f97316 ${insidePercent + outsidePercent}% ${insidePercent + outsidePercent + stalePercent}%, #e7eef8 ${insidePercent + outsidePercent + stalePercent}% 100%)`,
        }}
      >
        <span>{inside}</span>
        <small>на территории</small>
      </div>
      <dl>
        <div><dt><i aria-hidden={true} />На территории</dt><dd>{inside}</dd></div>
        <div><dt><i aria-hidden={true} />Вышли</dt><dd>{outside}</dd></div>
        <div><dt><i aria-hidden={true} />Спорные</dt><dd>{stale}</dd></div>
      </dl>
    </div>
  );
}

function DurationBars({ buckets }: { buckets: PercoDurationBucket[] }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const hasData = buckets.some((bucket) => bucket.count > 0);
  if (!hasData) {
    return <div className="perco-chart-empty">Нет завершённых интервалов</div>;
  }

  return (
    <div className="perco-duration-bars">
      {buckets.map((bucket) => (
        <div key={bucket.label}>
          <span>{bucket.label}</span>
          <b>{bucket.count}</b>
          <i style={{ width: bucket.count > 0 ? getChartBarHeight(bucket.count, max) : "0%" }} />
        </div>
      ))}
    </div>
  );
}

function getChartBarHeight(value: number, max: number) {
  if (value <= 0) return "0%";
  return `${Math.max(1, (value / Math.max(1, max)) * 100)}%`;
}

function PresenceTimeline({ intervals }: { intervals: PercoPresenceIntervalDiagnosticsDto[] }) {
  const visible = intervals.slice(0, 4);
  const total = Math.max(1, Math.max(...visible.map((item) => Math.max(item.durationMinutes, 1))));
  return (
    <div className="perco-presence-timeline">
      {visible.map((interval) => (
        <span
          className={interval.endedAt ? "closed" : isStaleInterval(interval) ? "stale" : "open"}
          key={interval.id}
          style={{ width: `${Math.max(14, Math.round((Math.max(interval.durationMinutes, 1) / total) * 100))}%` }}
          title={`${formatDateTime(interval.startedAt)} - ${interval.endedAt ? formatDateTime(interval.endedAt) : "сейчас"}`}
        />
      ))}
    </div>
  );
}

function MetricCard({
  label,
  note,
  tone = "default",
  value,
}: {
  label: string;
  note: string;
  tone?: "default" | "warning" | "danger" | "success";
  value: number | string;
}) {
  return (
    <article className={`perco-metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="perco-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SecretField({
  disabled,
  hasSaved,
  id,
  label,
  onChange,
  onToggleVisibility,
  placeholder,
  showValue,
  value,
}: {
  disabled: boolean;
  hasSaved: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  onToggleVisibility: () => void;
  placeholder: string;
  showValue: boolean;
  value: string;
}) {
  const helperId = `${id}-help`;
  const hasDraft = value.trim().length > 0;

  return (
    <div className="perco-secret-field">
      <div className="perco-secret-field-heading">
        <label htmlFor={id}>{label}</label>
        <span className={`perco-secret-state ${hasDraft ? "is-draft" : hasSaved ? "is-saved" : "is-empty"}`}>
          {hasDraft ? "Новый секрет" : hasSaved ? "Сохранён" : "Не задан"}
        </span>
      </div>
      <div className="perco-secret-input">
        <input
          aria-describedby={helperId}
          autoComplete="new-password"
          disabled={disabled}
          id={id}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={showValue ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={showValue ? `Скрыть ${label.toLowerCase()}` : `Показать ${label.toLowerCase()}`}
          className="perco-secret-toggle"
          disabled={disabled}
          onClick={onToggleVisibility}
          type="button"
        >
          {showValue ? "Скрыть" : "Показать"}
        </button>
      </div>
      <small id={helperId}>
        {hasDraft ? "Новое значение будет зашифровано после сохранения настроек." : hasSaved ? "Введите новое значение для замены. Пустое поле сохранит текущий секрет." : "Секрет ещё не сохранён. Введите значение перед проверкой подключения."}
      </small>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const normalized = normalizeStatusTone(status);
  return <span className={`perco-status-pill ${normalized}`}>{formatStatus(status)}</span>;
}

function usePercoPagination<T>(items: T[], initialPageSize: PercoPageSize = defaultListPageSize) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PercoPageSize>(initialPageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageItems = useMemo(() => items.slice((safePage - 1) * pageSize, safePage * pageSize), [items, pageSize, safePage]);

  useEffect(() => {
    setPage(1);
  }, [items]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  function changePageSize(nextPageSize: PercoPageSize) {
    setPageSize(nextPageSize);
    setPage(1);
  }

  return {
    page: safePage,
    pageCount,
    pageItems,
    pageSize,
    setPage,
    setPageSize: changePageSize,
  };
}

function ListPagination({
  onPageChange,
  onPageSizeChange,
  page,
  pageCount,
  pageSize,
  total,
}: {
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PercoPageSize) => void;
  page: number;
  pageCount: number;
  pageSize: PercoPageSize;
  total: number;
}) {
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="perco-list-expansion" aria-live="polite">
      <span>Показано {start}-{end} из {total}</span>
      <label>
        <span>На странице</span>
        <select aria-label="Количество записей на странице" onChange={(event) => onPageSizeChange(Number(event.target.value) as PercoPageSize)} value={pageSize}>
          {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <div>
        <button className="perco-button perco-button-secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button">Назад</button>
        <span>Страница {page} из {pageCount}</span>
        <button className="perco-button perco-button-secondary" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} type="button">Далее</button>
      </div>
    </div>
  );
}

function EmptyBlock({ text, title }: { text: string; title: string }) {
  return (
    <div className="perco-empty-block">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function buildHourlyFlow(events: PercoAccessEventDiagnosticsDto[]): PercoHourlyFlowPoint[] {
  const byHour = new Map<string, PercoHourlyFlowPoint>();
  const sorted = [...events].sort((left, right) => new Date(left.eventAt).getTime() - new Date(right.eventAt).getTime());

  for (const event of sorted) {
    const date = new Date(event.eventAt);
    if (Number.isNaN(date.getTime())) continue;

    const hour = `${String(date.getHours()).padStart(2, "0")}:00`;
    const point = byHour.get(hour) ?? { hour, inCount: 0, outCount: 0 };
    if (event.direction === "IN") point.inCount += 1;
    if (event.direction === "OUT") point.outCount += 1;
    byHour.set(hour, point);
  }

  return Array.from(byHour.values()).slice(-12);
}

function buildDurationBuckets(intervals: PercoPresenceIntervalDiagnosticsDto[]): PercoDurationBucket[] {
  const buckets: PercoDurationBucket[] = [
    { label: "до 4 ч", count: 0 },
    { label: "4-8 ч", count: 0 },
    { label: "8-12 ч", count: 0 },
    { label: "12+ ч", count: 0 },
  ];

  for (const interval of intervals) {
    if (!interval.endedAt || isStaleInterval(interval) || isOldOpenInterval(interval)) {
      continue;
    }

    const minutes = Math.max(0, interval.durationMinutes);
    if (minutes < 4 * 60) buckets[0].count += 1;
    else if (minutes < 8 * 60) buckets[1].count += 1;
    else if (minutes < 12 * 60) buckets[2].count += 1;
    else buckets[3].count += 1;
  }

  return buckets;
}

function buildPercoQuality(diagnostics: PercoDiagnosticsDto | null, analytics: ReturnType<typeof buildPresenceAnalytics>) {
  const events = diagnostics?.recentEventsCount ?? 0;
  const unmatched = diagnostics?.unmatchedEventsCount ?? 0;
  const unmatchedPercent = events ? Math.round((unmatched / events) * 100) : 0;
  const stalePercent = analytics.employees.length ? Math.round((analytics.staleCount / analytics.employees.length) * 100) : 0;
  return [
    { label: "несопоставленных проходов", tone: unmatched > 0 ? "warning" : "success", value: `${unmatchedPercent}%` },
    { label: "смен требуют проверки", tone: analytics.staleCount > 0 ? "danger" : "success", value: `${stalePercent}%` },
    { label: "старых открытых входов", tone: (diagnostics?.oldOpenPresenceCount ?? 0) > 0 ? "warning" : "success", value: diagnostics?.oldOpenPresenceCount ?? 0 },
    { label: "интервалов построено", tone: analytics.employees.length > 0 ? "success" : "muted", value: analytics.employees.length },
  ];
}

function buildPresenceAnalytics(diagnostics: PercoDiagnosticsDto | null) {
  const intervals = diagnostics?.presenceIntervals ?? [];
  const events = diagnostics?.recentEvents ?? [];
  const currentIntervals = intervals.filter((interval) => !isOldOpenInterval(interval));
  const archiveOpenIntervals = intervals
    .filter(isOldOpenInterval)
    .sort((left, right) => right.durationMinutes - left.durationMinutes);
  const byEmployee = new Map<string, PresenceEmployeeSummary>();
  let totalMinutes = 0;

  for (const interval of currentIntervals) {
    const employeeKey = interval.employeeId || interval.employeeName || interval.id;
    const reliableMinutes = !isStaleInterval(interval) && !isOldOpenInterval(interval) ? Math.max(0, interval.durationMinutes) : 0;
    const current =
      byEmployee.get(employeeKey) ??
      ({
        closedMinutes: 0,
        currentMinutes: 0,
        currentStartedAt: null,
        employeeId: interval.employeeId,
        employeeName: interval.employeeName || "Сотрудник не сопоставлен",
        firstIn: null,
        intervals: [],
        latestEventAt: null,
        latestEventDirection: null,
        lastOut: null,
        openIntervals: 0,
        personnelNo: interval.personnelNo,
        state: "outside",
        totalMinutes: 0,
      } satisfies PresenceEmployeeSummary);

    current.intervals.push(interval);
    current.totalMinutes += reliableMinutes;
    if (interval.endedAt) {
      current.closedMinutes += reliableMinutes;
    } else if (!isOldOpenInterval(interval)) {
      current.currentStartedAt = maxIso(current.currentStartedAt, interval.startedAt);
      current.currentMinutes = Math.max(current.currentMinutes, reliableMinutes);
    }
    current.openIntervals += interval.endedAt ? 0 : 1;
    current.firstIn = minIso(current.firstIn, interval.startedAt);
    current.lastOut = interval.endedAt ? maxIso(current.lastOut, interval.endedAt) : current.lastOut;
    if (isStaleInterval(interval)) current.state = "stale";
    else if (!interval.endedAt) current.state = "inside";
    totalMinutes += reliableMinutes;
    byEmployee.set(employeeKey, current);
  }

  for (const event of events) {
    if (!event.employeeId || (event.direction !== "IN" && event.direction !== "OUT")) {
      continue;
    }

    const employeeKey = event.employeeId;
    const current =
      byEmployee.get(employeeKey) ??
      ({
        closedMinutes: 0,
        currentMinutes: 0,
        currentStartedAt: null,
        employeeId: event.employeeId,
        employeeName: event.employeeName || "Сотрудник не сопоставлен",
        firstIn: null,
        intervals: [],
        latestEventAt: null,
        latestEventDirection: null,
        lastOut: null,
        openIntervals: 0,
        personnelNo: event.personnelNo,
        state: "outside",
        totalMinutes: 0,
      } satisfies PresenceEmployeeSummary);

    current.employeeName = current.employeeName || event.employeeName || "Сотрудник не сопоставлен";
    current.personnelNo = current.personnelNo || event.personnelNo;
    if (event.direction === "IN") current.firstIn = minIso(current.firstIn, event.eventAt);
    if (event.direction === "OUT") current.lastOut = maxIso(current.lastOut, event.eventAt);
    if (!current.latestEventAt || event.eventAt > current.latestEventAt) {
      current.latestEventAt = event.eventAt;
      current.latestEventDirection = event.direction;
    }
    byEmployee.set(employeeKey, current);
  }

  const employees = Array.from(byEmployee.values())
    .map((employee) => {
      const hasCurrentStale = employee.intervals.some((interval) => isStaleInterval(interval) && !isOldOpenInterval(interval));
      const activeInterval = employee.intervals
        .filter((interval) => !interval.endedAt && !isStaleInterval(interval) && !isOldOpenInterval(interval))
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
      const hasOpenInterval = Boolean(activeInterval);
      const hasClosedShiftInterval = employee.intervals.some(isClosedShiftInterval);
      const hasOnlyLunchBreaks = employee.intervals.length > 0 && employee.intervals.every(isLunchBreakInterval);
      const intervals = employee.intervals.sort((left, right) => right.startedAt.localeCompare(left.startedAt));

      return {
        ...employee,
        currentMinutes: activeInterval ? Math.max(0, activeInterval.durationMinutes) : 0,
        currentStartedAt: activeInterval?.startedAt ?? null,
        intervals,
        openIntervals: hasOpenInterval ? Math.max(employee.openIntervals, 1) : 0,
        state: hasCurrentStale || hasOnlyLunchBreaks ? "stale" : hasOpenInterval ? "inside" : hasClosedShiftInterval ? "outside" : "stale",
      } satisfies PresenceEmployeeSummary;
    })
    .sort((left, right) => {
      if (left.openIntervals !== right.openIntervals) return right.openIntervals - left.openIntervals;
      return right.totalMinutes - left.totalMinutes;
    });

  const openIntervals = currentIntervals
    .filter((interval) => !interval.endedAt && !isOldOpenInterval(interval))
    .sort((left, right) => right.durationMinutes - left.durationMinutes);
  const staleIntervals = currentIntervals
    .filter((interval) => isStaleInterval(interval) && !isOldOpenInterval(interval))
    .sort((left, right) => right.durationMinutes - left.durationMinutes);

  return {
    archiveOpenIntervals,
    employees,
    insideCount: employees.filter((employee) => employee.state === "inside").length,
    openIntervals,
    outsideCount: employees.filter((employee) => employee.state === "outside").length,
    staleCount: staleIntervals.length,
    staleIntervals,
    totalMinutes,
  };
}

function toForm(settings: PercoIntegrationSettingsDto): SettingsForm {
  return {
    authMode: settings.authMode ?? "LoginPassword",
    baseUrl: settings.baseUrl || defaultSettings.baseUrl,
    devPath: settings.devPath || defaultSettings.devPath,
    employeesEndpoint: settings.employeesEndpoint || defaultSettings.employeesEndpoint,
    employeesSyncMinutes: settings.employeesSyncMinutes || defaultSettings.employeesSyncMinutes,
    eventsEndpoint: settings.eventsEndpoint || defaultSettings.eventsEndpoint,
    eventsSyncMinutes: settings.eventsSyncMinutes || defaultSettings.eventsSyncMinutes,
    isEnabled: settings.isEnabled,
    password: "",
    shiftEndToleranceMinutes: settings.shiftEndToleranceMinutes || defaultSettings.shiftEndToleranceMinutes,
    shiftStartToleranceMinutes: settings.shiftStartToleranceMinutes || defaultSettings.shiftStartToleranceMinutes,
    timezone: settings.timezone || defaultSettings.timezone,
    token: "",
    username: settings.username ?? "",
  };
}

function buildSuggestedMatches(items: ReadonlyArray<PercoUnmatchedEmployeeDto>) {
  return Object.fromEntries(items.map((item) => [item.percoEmployeeId, item.suggestedEmployeeId ?? null]));
}

function getMatchSuggestionReason(item: PercoUnmatchedEmployeeDto, employeeOptions: EmployeeDirectoryItem[]) {
  const suggested = item.suggestedEmployeeId
    ? employeeOptions.find((employee) => employee.id === item.suggestedEmployeeId)
    : undefined;
  if (suggested && item.personnelNo && suggested.personnelNo && normalizeSearch(item.personnelNo) === normalizeSearch(suggested.personnelNo)) {
    return "точное совпадение по табельному номеру";
  }
  if (suggested && normalizeSearch(item.fullName) === normalizeSearch(suggested.fullName)) {
    return "точное совпадение по ФИО";
  }
  return "рекомендация по данным PERCo";
}

function isStaleInterval(interval: PercoPresenceIntervalDiagnosticsDto) {
  if (interval.stateCode === "stale" || interval.needsReview) {
    return true;
  }

  const state = interval.state.toLowerCase();
  return !isOldOpenInterval(interval) && (interval.durationMinutes >= 18 * 60 || state.includes("требует") || state.includes("stale"));
}

function isOldOpenInterval(interval: PercoPresenceIntervalDiagnosticsDto) {
  if (interval.stateCode === "old_open") {
    return true;
  }

  const state = interval.state.toLowerCase();
  return !interval.endedAt && (state.includes("стар") || state.includes("не входит"));
}

function isLunchBreakInterval(interval: PercoPresenceIntervalDiagnosticsDto) {
  return interval.stateCode === "lunch_break" || interval.state.toLowerCase().includes("обед");
}

function isClosedShiftInterval(interval: PercoPresenceIntervalDiagnosticsDto) {
  return interval.stateCode === "outside" || Boolean(interval.endedAt && !isLunchBreakInterval(interval) && !isStaleInterval(interval));
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeStatusTone(status: string) {
  const value = status.toLowerCase();
  if (value.includes("success") || value.includes("ok") || value.includes("active") || value.includes("успеш")) return "success";
  if (value.includes("error") || value.includes("fail") || value.includes("ошиб")) return "error";
  if (value.includes("warn") || value.includes("треб")) return "warning";
  return "idle";
}

function formatStatus(status: string) {
  const value = status || "нет данных";
  if (value === "success") return "Активно";
  if (value === "error") return "Ошибка";
  if (value === "warning") return "Внимание";
  if (value === "idle") return "Нет данных";
  return value;
}

function formatSecretStatus(status: PercoSecretStatusDto) {
  return `API: ${status.apiStatus}; worker: ${status.workerStatus}`;
}

function formatOperation(value: string) {
  const operation = value.trim();
  const normalized = operation
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
  switch (normalized) {
    case "SYNC_EMPLOYEES":
      return "Синхронизация сотрудников";
    case "SYNC_EVENTS":
      return "Синхронизация проходов";
    case "TEST_CONNECTION":
      return "Проверка подключения";
    case "CHECK_SECRET":
      return "Проверка секрета";
    case "MATCH_EMPLOYEES":
      return "Сопоставление сотрудников";
    case "CLOSE_PRESENCE_INTERVAL":
      return "Ручное закрытие интервала";
    case "UPDATE_SETTINGS":
      return "Обновление настроек";
    default:
      return operation ? `Операция ${operation}` : "Операция без названия";
  }
}

function formatLogStatus(value: string) {
  const normalized = value.trim().toUpperCase();
  switch (normalized) {
    case "SUCCESS":
    case "OK":
      return "Успешно";
    case "ERROR":
    case "FAILED":
      return "Ошибка";
    case "WARNING":
    case "WARN":
      return "Предупреждение";
    case "RUNNING":
    case "IN_PROGRESS":
      return "Выполняется";
    case "IDLE":
      return "Не запускалось";
    default:
      return value.trim() || "Неизвестно";
  }
}

function formatLogSource(createdByUserId: string | null) {
  return createdByUserId ? "Вручную через API" : "Автоматически, worker";
}

function formatLogDetails(value: string) {
  const details = value.trim();
  if (!details) return "";
  if (!details.includes("=")) return details;

  return details
    .split(";")
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return part.trim();
      const key = part.slice(0, separator).trim();
      const rawValue = part.slice(separator + 1).trim();
      return `${formatLogDetailKey(key)}: ${formatLogDetailValue(key, rawValue)}`;
    })
    .filter(Boolean)
    .join(" · ");
}

function formatLogDetailKey(key: string) {
  const labels: Record<string, string> = {
    action: "Действие",
    active: "Активных",
    backfilledEvents: "Дополнено событий",
    comment: "Комментарий",
    created: "Создано",
    duplicates: "Дубликатов",
    employee: "Сотрудник",
    employeeId: "ID сотрудника проекта",
    endedAt: "Окончание",
    endpoint: "Адрес API",
    loaded: "Загружено",
    loadedRaw: "Получено сырых",
    mode: "Режим",
    percoEmployeeId: "ID сотрудника PERCo",
    skippedInactive: "Неактивных пропущено",
    skippedInvalidTimestamp: "Некорректное время пропущено",
    skippedNotFactory: "Вне завода пропущено",
    startedAt: "Начало",
    unmatched: "Без сопоставления",
    updated: "Обновлено",
  };
  return labels[key] ?? key;
}

function formatLogDetailValue(key: string, value: string) {
  if (!value) return "-";
  if (key === "mode") {
    if (value === "accessReports") return "отчёты о проходах";
    if (value === "cursor") return "курсорный режим";
  }
  if (key === "action") {
    if (value.toLowerCase() === "ignore") return "игнорировать";
    if (value.toLowerCase() === "link" || value.toLowerCase() === "match") return "сопоставить";
  }
  if (key === "startedAt" || key === "endedAt") {
    return formatDateTime(value);
  }
  return value;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function formatDuration(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours <= 0) return `${mins} мин`;
  if (mins === 0) return `${hours} ч`;
  return `${hours} ч ${mins} мин`;
}

function toDateTimeLocalValue(value: Date) {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function minIso(current: string | null, next: string) {
  if (!current) return next;
  return next < current ? next : current;
}

function maxIso(current: string | null, next: string) {
  if (!current) return next;
  return next > current ? next : current;
}

function isBusyStatus(status: LoadStatus) {
  return status === "loading" || status === "saving";
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const details = error.errors ? ` ${Object.values(error.errors).flat().join(" ")}` : "";
    if (error.status === 401) return "Сессия истекла или не подтверждена. Войдите заново и повторите обновление.";
    if (error.status === 403) return "Недостаточно прав для загрузки этого раздела PERCO-Web.";
    if (error.status === 404) return "Сервис PERCO-Web не найден. Проверьте версию и адрес backend.";
    if (error.status === 0 || error.status >= 500) return "Сервис PERCO-Web временно недоступен. Проверьте backend и повторите обновление.";
    return (`Не удалось выполнить запрос PERCO-Web.${details}`).trim();
  }
  return error instanceof Error && error.message
    ? "Не удалось обновить данные PERCO-Web. Повторите попытку."
    : "Неизвестная ошибка PERCO-Web.";
}
