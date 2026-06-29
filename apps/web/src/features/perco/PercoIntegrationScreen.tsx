import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

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
    return employeeDirectory
      .filter((employee) => {
        if (!query) return true;
        return normalizeSearch(
          `${employee.fullName} ${employee.personnelNo} ${employee.position} ${employee.department} ${employee.employeeGroup}`,
        ).includes(query);
      })
      .slice(0, 80);
  }, [employeeDirectory, matchSearch]);

  const load = useCallback(async () => {
    if (!canView) return;
    setStatus("loading");
    setErrorMessage(null);
    try {
      const nextSettings = await repository.getSettings();
      setSettings(nextSettings);
      setForm(toForm(nextSettings));

      const requests: Array<Promise<unknown>> = [
        repository.getDiagnostics(120).then(setDiagnostics),
        repository.getUnmatchedEmployees().then((items) => {
          setUnmatchedEmployees([...items]);
          setSelectedMatch(buildSuggestedMatches(items));
        }),
      ];
      if (canViewLogs) {
        requests.push(repository.getLogs(80).then((items) => setLogs([...items])));
      }

      await Promise.allSettled(requests);
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
    try {
      const result = kind === "employees" ? await repository.syncEmployees() : await repository.syncEvents();
      setSyncResult(result);
      setStatus("ready");
      onNotify(result.message);
      await Promise.allSettled([refreshDiagnostics(), refreshLogs(), refreshUnmatched()]);
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
    setStatus("loading");
    setErrorMessage(null);
    try {
      await Promise.allSettled([load(), refreshDiagnostics(), refreshLogs(), refreshUnmatched()]);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function refreshLiveData() {
    if (canSync && (activeTab === "dashboard" || activeTab === "diagnostics")) {
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
      await Promise.allSettled([refreshUnmatched(), refreshDiagnostics()]);
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
      await Promise.allSettled([refreshDiagnostics(), refreshLogs()]);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setErrorMessage(getErrorMessage(error));
    }
  }

  function updateForm<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
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
    <div className="perco-shell">
      <section className="perco-toolbar">
        <div className="perco-toolbar-main">
          <span className="perco-eyebrow">PERCo-Web</span>
          <strong>Проходы по заводу и смены сотрудников</strong>
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
          <button className="perco-button perco-button-secondary" disabled={status === "loading"} onClick={() => void refreshLiveData()} type="button">
            Обновить данные
          </button>
        </div>
      </section>

      <nav className="perco-tabs" aria-label="Разделы PERCo-Web">
        {percoTabs.map((tab) => (
          <button className={activeTab === tab.id ? "active" : ""} key={tab.id} onClick={() => setActiveTab(tab.id)} type="button">
            {getPercoTabLabel(tab.id)}
          </button>
        ))}
      </nav>

      {errorMessage ? <div className="perco-alert perco-alert-error">{errorMessage}</div> : null}

      {activeTab === "dashboard" ? (
        <PercoDashboardTab
          canSync={canSync}
          diagnostics={diagnostics}
          logs={logs}
          settings={settings}
          status={status}
          onCloseInterval={startClosePresenceInterval}
          onNavigate={setActiveTab}
          onRefresh={refreshLiveData}
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
        <SyncTab canSync={canSync} result={syncResult} status={status} onRunSync={runSync} />
      ) : null}

      {activeTab === "matching" ? (
        <MatchingTab
          canMatch={canMatch}
          employeeOptions={matchEmployeeOptions}
          search={matchSearch}
          selectedMatch={selectedMatch}
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
          onCloseInterval={startClosePresenceInterval}
          onRefresh={async () => {
            await refreshLiveData();
          }}
        />
      ) : null}

      {activeTab === "logs" ? (
        <LogsTab canView={canViewLogs} logs={logs} onRefresh={refreshLogs} />
      ) : null}

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
            <span>Пароль и токен не выводятся при чтении настроек. Пустое поле не сбрасывает сохраненный секрет.</span>
          </div>
          <label className="perco-switch">
            <input
              checked={form.isEnabled}
              disabled={!canManage}
              onChange={(event) => onUpdate("isEnabled", event.target.checked)}
              type="checkbox"
            />
            <span>Интеграция включена</span>
          </label>
        </header>

        <div className="perco-form-grid">
          <Field label="Адрес сервера PERCo">
            <input disabled={!canManage} onChange={(event) => onUpdate("baseUrl", event.target.value)} value={form.baseUrl} />
          </Field>
          <Field label="Проверочный путь">
            <input disabled={!canManage} onChange={(event) => onUpdate("devPath", event.target.value)} value={form.devPath} />
          </Field>
          <Field label="Endpoint сотрудников">
            <input
              disabled={!canManage}
              onChange={(event) => onUpdate("employeesEndpoint", event.target.value)}
              value={form.employeesEndpoint}
            />
          </Field>
          <Field label="Endpoint проходов по заводу">
            <input
              disabled={!canManage}
              onChange={(event) => onUpdate("eventsEndpoint", event.target.value)}
              value={form.eventsEndpoint}
            />
          </Field>
          <Field label="Режим авторизации">
            <select
              disabled={!canManage}
              onChange={(event) => onUpdate("authMode", event.target.value as SettingsForm["authMode"])}
              value={form.authMode}
            >
              <option value="LoginPassword">Логин и пароль</option>
              <option value="Token">Bearer token</option>
            </select>
          </Field>
          {form.authMode === "Token" ? (
            <Field label={`Токен${settings?.hasToken ? " сохранен" : ""}`}>
              <input
                autoComplete="off"
                disabled={!canManage}
                onChange={(event) => onUpdate("token", event.target.value)}
                placeholder={settings?.hasToken ? "Оставьте пустым, чтобы не менять" : "Вставьте Bearer token"}
                type="password"
                value={form.token}
              />
            </Field>
          ) : (
            <>
              <Field label="Логин">
                <input disabled={!canManage} onChange={(event) => onUpdate("username", event.target.value)} value={form.username} />
              </Field>
              <Field label={`Пароль${settings?.hasPassword ? " сохранен" : ""}`}>
                <input
                  autoComplete="off"
                  disabled={!canManage}
                  onChange={(event) => onUpdate("password", event.target.value)}
                  placeholder={settings?.hasPassword ? "Оставьте пустым, чтобы не менять" : "Введите пароль"}
                  type="password"
                  value={form.password}
                />
              </Field>
            </>
          )}
        </div>

        <div className="perco-form-grid compact">
          <Field label="Часовой пояс">
            <input disabled={!canManage} onChange={(event) => onUpdate("timezone", event.target.value)} value={form.timezone} />
          </Field>
          <Field label="Сотрудники, мин">
            <input
              disabled={!canManage}
              min={1}
              onChange={(event) => onUpdate("employeesSyncMinutes", Number(event.target.value))}
              type="number"
              value={form.employeesSyncMinutes}
            />
          </Field>
          <Field label="Проходы, мин">
            <input
              disabled={!canManage}
              min={1}
              onChange={(event) => onUpdate("eventsSyncMinutes", Number(event.target.value))}
              type="number"
              value={form.eventsSyncMinutes}
            />
          </Field>
          <Field label="Допуск смены, мин">
            <input
              disabled={!canManage}
              min={0}
              onChange={(event) => onUpdate("shiftStartToleranceMinutes", Number(event.target.value))}
              type="number"
              value={form.shiftStartToleranceMinutes}
            />
          </Field>
        </div>

        <div className="perco-actions">
          <button className="perco-button perco-button-primary" disabled={!canManage || status === "saving"} type="submit">
            Сохранить настройки
          </button>
          <button className="perco-button perco-button-secondary" disabled={!canManage || status === "loading"} onClick={onTest} type="button">
            Проверить подключение
          </button>
          <button
            className="perco-button perco-button-secondary"
            disabled={!canManage || status === "loading"}
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
  result,
  status,
  onRunSync,
}: {
  canSync: boolean;
  result: PercoSyncResultDto | null;
  status: LoadStatus;
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
          <button className="perco-button perco-button-primary" disabled={!canSync || status === "loading"} onClick={() => onRunSync("employees")} type="button">
            Синхронизировать сотрудников
          </button>
          <button className="perco-button perco-button-primary" disabled={!canSync || status === "loading"} onClick={() => onRunSync("events")} type="button">
            Синхронизировать проходы
          </button>
        </div>
        {result ? <SyncSummary result={result} /> : <EmptyBlock title="Синхронизация еще не запускалась" text="Результат появится после ручного запуска или работы worker." />}
      </div>
      <div className="perco-card">
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
function MatchingTab({
  canMatch,
  employeeOptions,
  search,
  selectedMatch,
  unmatchedEmployees,
  onSearch,
  onSelect,
  onSubmit,
}: {
  canMatch: boolean;
  employeeOptions: EmployeeDirectoryItem[];
  search: string;
  selectedMatch: Record<string, string | null>;
  unmatchedEmployees: PercoUnmatchedEmployeeDto[];
  onSearch: (value: string) => void;
  onSelect: (percoEmployeeId: string, employeeId: string) => void;
  onSubmit: (percoEmployeeId: string, action: "match" | "ignore") => void;
}) {
  return (
    <section className="perco-card">
      <header>
        <div>
          <h2>Сопоставление сотрудников</h2>
          <span>Свяжите сотрудников PERCo с действующим справочником проекта по ФИО, табельному номеру или карте.</span>
        </div>
      </header>
      <div className="perco-match-toolbar">
        <input onChange={(event) => onSearch(event.target.value)} placeholder="Поиск по ФИО, табельному, должности или подразделению" value={search} />
        <span>Найдено: {employeeOptions.length}</span>
      </div>
      {unmatchedEmployees.length === 0 ? (
        <EmptyBlock title="Несопоставленных сотрудников нет" text="Новые записи появятся после синхронизации сотрудников PERCo." />
      ) : (
        <div className="perco-table">
          {unmatchedEmployees.map((item) => (
            <article key={item.percoEmployeeId}>
              <div>
                <strong>{item.fullName || "Без ФИО"}</strong>
                <span>
                  Табельный: {item.personnelNo || "-"} · карта: {item.cardNumber || "-"} · {item.department || "подразделение не указано"}
                </span>
                {item.suggestedEmployeeName ? <small>Предложение: {item.suggestedEmployeeName}</small> : null}
              </div>
              <div className="perco-match-actions">
                <select
                  disabled={!canMatch}
                  onChange={(event) => onSelect(item.percoEmployeeId, event.target.value)}
                  value={selectedMatch[item.percoEmployeeId] ?? ""}
                >
                  <option value="">Выберите сотрудника</option>
                  {employeeOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.fullName} · {employee.personnelNo || "без таб."}
                    </option>
                  ))}
                </select>
                <button className="perco-button perco-button-primary" disabled={!canMatch} onClick={() => onSubmit(item.percoEmployeeId, "match")} type="button">
                  Связать
                </button>
                <button className="perco-button perco-button-secondary" disabled={!canMatch} onClick={() => onSubmit(item.percoEmployeeId, "ignore")} type="button">
                  Игнорировать
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
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
        <button className="perco-button perco-button-primary" disabled={status === "loading"} onClick={() => void onRefresh()} type="button">
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
            <button className="perco-button perco-button-primary" disabled={status === "loading"} onClick={onSyncEvents} type="button">
              Синхронизировать проходы
            </button>
          ) : null}
          <button className="perco-button perco-button-secondary" disabled={status === "loading"} onClick={() => void onRefresh()} type="button">
            Обновить дашборд
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
  onCloseInterval,
  onRefresh,
}: {
  canSync: boolean;
  canManage: boolean;
  diagnostics: PercoDiagnosticsDto | null;
  settings: PercoIntegrationSettingsDto | null;
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
        <button className="perco-button perco-button-secondary" onClick={() => void onRefresh()} type="button">
          {canSync ? "Синхронизировать проходы" : "Обновить диагностику"}
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
        <div className="perco-presence-rollup">
          <span><b>{analytics.insideCount}</b> на заводе</span>
          <span><b>{analytics.outsideCount}</b> вышли</span>
          <span><b>{analytics.staleCount}</b> спорные</span>
          <span><b>{diagnostics.oldOpenPresenceCount ?? 0}</b> старые</span>
          <span><b>{diagnostics.unmatchedEventsCount}</b> без сотрудника</span>
        </div>
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
                {activeShiftEmployees.map((employee) => (
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
                {completedShiftEmployees.map((employee) => (
                  <article className="is-completed-shift" key={`${employee.employeeId}-${employee.employeeName}`}>
                    <div className="perco-presence-person">
                      <span className="perco-presence-dot outside" />
                      <div>
                        <strong>{employee.employeeName}</strong>
                        <small>
                          {employee.personnelNo || "без табельного"} · вход: {employee.firstIn ? formatDateTime(employee.firstIn) : "-"} · выход: {employee.lastOut ? formatDateTime(employee.lastOut) : "-"}
                        </small>
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
              filteredProblemIntervals.map((interval) => (
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
                      <button className="perco-link-button" onClick={() => onCloseInterval(interval)} type="button">
                        Закрыть вручную
                      </button>
                    ) : null}
                  </aside>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="perco-diagnostics-grid">
        <section className="perco-diagnostics-panel">
          <h3>Последние проходы</h3>
          <div className="perco-diagnostics-list">
            {filteredRecentEvents.length === 0 ? (
              <EmptyBlock title="Проходов по фильтру нет" text="Измените фильтр или обновите диагностику проходов." />
            ) : (
              filteredRecentEvents.map((event) => (
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
function LogsTab({ canView, logs, onRefresh }: { canView: boolean; logs: PercoIntegrationLogDto[]; onRefresh: () => void }) {
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
        <button className="perco-button perco-button-secondary" onClick={onRefresh} type="button">
          Обновить журнал
        </button>
      </header>
      {logs.length === 0 ? (
        <EmptyBlock title="Записей журнала нет" text="Журнал появится после проверки подключения или синхронизации." />
      ) : (
        <div className="perco-log-list">
          {logs.map((log) => (
            <article key={log.id}>
              <div>
                <strong>{formatOperation(log.operation)}</strong>
                <span>{log.message}</span>
                {log.details ? <small>{log.details}</small> : null}
              </div>
              <aside>
                <b className={normalizeStatusTone(log.status)}>{log.status}</b>
                <time>{formatDateTime(log.startedAt)}</time>
              </aside>
            </article>
          ))}
        </div>
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
  const previewDurationMinutes = Math.max(
    0,
    Math.round((new Date(form.endedAt).getTime() - new Date(interval.startedAt).getTime()) / 60000),
  );
  const durationIsTooLong = previewDurationMinutes > 18 * 60;

  return (
    <div className="perco-modal-backdrop" onMouseDown={onCancel}>
      <section className="perco-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header>
          <div>
            <h2>Закрыть присутствие вручную</h2>
            <span>{interval.employeeName} · вход {formatDateTime(interval.startedAt)}</span>
          </div>
          <button className="perco-icon-button" onClick={onCancel} type="button" aria-label="Закрыть">
            ×
          </button>
        </header>
        <p className="perco-warning-text">
          Используйте только когда PERCo не прислал выход с завода или направление прохода было распознано неверно.
        </p>
        <p className={`perco-warning-text ${durationIsTooLong ? "is-danger" : ""}`}>
          Расчетная длительность: {formatDuration(previewDurationMinutes)}. Максимум для ручного закрытия: 18 ч.
        </p>
        <Field label="Время выхода">
          <input
            onChange={(event) => onChange({ ...form, endedAt: event.target.value })}
            type="datetime-local"
            value={form.endedAt}
          />
        </Field>
        <Field label="Причина">
          <textarea
            onChange={(event) => onChange({ ...form, comment: event.target.value })}
            placeholder="Например: сотрудник вышел на обед, событие выхода не пришло из PERCo"
            value={form.comment}
          />
        </Field>
        <div className="perco-modal-actions">
          <button className="perco-button perco-button-secondary" onClick={onCancel} type="button">
            Отмена
          </button>
          <button className="perco-button perco-button-primary" onClick={onSubmit} type="button">
            Закрыть интервал
          </button>
        </div>
      </section>
    </div>
  );
}
function PercoFlowChart({ points }: { points: PercoHourlyFlowPoint[] }) {
  const max = Math.max(1, ...points.flatMap((point) => [point.inCount, point.outCount]));
  return (
    <div className="perco-flow-chart" aria-label="График входов и выходов по часам">
      <div className="perco-flow-bars">
        {points.map((point) => (
          <div className="perco-flow-hour" key={point.hour}>
            <div className="perco-flow-stack">
              <span className="in" style={{ height: `${Math.max(4, (point.inCount / max) * 100)}%` }} title={`Входов: ${point.inCount}`} />
              <span className="out" style={{ height: `${Math.max(4, (point.outCount / max) * 100)}%` }} title={`Выходов: ${point.outCount}`} />
            </div>
            <small>{point.hour}</small>
          </div>
        ))}
      </div>
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
  const stalePercent = Math.round((stale / total) * 100);
  return (
    <div className="perco-presence-ratio">
      <div
        className="perco-presence-ring"
        style={{
          background: `conic-gradient(#0b63f6 0 ${insidePercent}%, #f97316 ${insidePercent}% ${insidePercent + stalePercent}%, #dbeafe ${insidePercent + stalePercent}% 100%)`,
        }}
      >
        <span>{inside}</span>
        <small>на заводе</small>
      </div>
      <dl>
        <div><dt>На территории</dt><dd>{inside}</dd></div>
        <div><dt>Вышли</dt><dd>{outside}</dd></div>
        <div><dt>Спорные</dt><dd>{stale}</dd></div>
      </dl>
    </div>
  );
}

function DurationBars({ buckets }: { buckets: PercoDurationBucket[] }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return (
    <div className="perco-duration-bars">
      {buckets.map((bucket) => (
        <div key={bucket.label}>
          <span>{bucket.label}</span>
          <b>{bucket.count}</b>
          <i style={{ width: `${Math.max(6, (bucket.count / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
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

function StatusPill({ status }: { status: string }) {
  const normalized = normalizeStatusTone(status);
  return <span className={`perco-status-pill ${normalized}`}>{formatStatus(status)}</span>;
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
  switch (value) {
    case "syncEmployees":
      return "Синхронизация сотрудников";
    case "syncEvents":
      return "Синхронизация проходов";
    case "testConnection":
      return "Проверка подключения";
    case "checkSecret":
      return "Проверка секрета";
    default:
      return value;
  }
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

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const details = error.errors ? ` ${Object.values(error.errors).flat().join(" ")}` : "";
    return `${error.message}${details}`.trim();
  }
  return error instanceof Error ? error.message : "Неизвестная ошибка PERCo-Web.";
}




