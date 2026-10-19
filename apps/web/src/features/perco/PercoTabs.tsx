import { useMemo, useState } from "react";

import type { PercoConnectionTestResultDto, PercoDiagnosticsDto, PercoIntegrationLogDto, PercoIntegrationSettingsDto, PercoPresenceIntervalDiagnosticsDto, PercoSyncResultDto } from "../../api/contracts";
import { PercoAnalytics } from "./PercoAnalytics";

import {
  ConnectionResult,
  EmptyBlock,
  Field,
  ListPagination,
  LoadStatus,
  MetricCard,
  PresenceEmployeeSummary,
  PresenceTimeline,
  SecretField,
  SettingsForm,
  SettingsStatus,
  SyncSummary,
  buildPresenceAnalytics,
  defaultListPageSize,
  diagnosticsListPageSize,
  formatDateTime,
  formatDuration,
  formatLogDetails,
  formatLogSource,
  formatLogStatus,
  formatOperation,
  formatStatus,
  isBusyStatus,
  isOldOpenInterval,
  isStaleInterval,
  normalizeSearch,
  normalizeStatusTone,
  usePercoPagination
} from "./percoScreenSupport";
export function ConnectionTab({
  canManage,
  connectionResult,
  form,
  hasUnsavedSettings,
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
  hasUnsavedSettings: boolean;
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

        {hasUnsavedSettings ? <div className="perco-unsaved-note" role="status">Есть несохранённые изменения. Обновление данных не изменяет заполненную форму.</div> : null}

        <div className="perco-form-grid">
          <Field label="Адрес сервера PERCo">
            <input disabled={!canManage || isBusyStatus(status)} onChange={(event) => onUpdate("baseUrl", event.target.value)} value={form.baseUrl} />
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

        <details className="perco-connection-advanced">
          <summary>Адреса API и параметры синхронизации</summary>
          <div className="perco-form-grid">
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
          <Field label="Допуск начала смены, мин">
            <input
              disabled={!canManage || isBusyStatus(status)}
              min={0}
              onChange={(event) => onUpdate("shiftStartToleranceMinutes", Number(event.target.value))}
              type="number"
              value={form.shiftStartToleranceMinutes}
            />
          </Field>
          <Field label="Допуск конца смены, мин">
            <input disabled={!canManage || isBusyStatus(status)} min={0} required onChange={(event) => onUpdate("shiftEndToleranceMinutes", Number(event.target.value))} type="number" value={form.shiftEndToleranceMinutes} />
          </Field>
        </div>

        </details>

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

export function SyncTab({
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
      <small>Секрет worker: {formatStatus(workerStatus)}{settings?.secretStatus.workerCheckedAt ? ` · ${formatDateTime(settings.secretStatus.workerCheckedAt)}` : ""}</small>
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

export { MatchingTab } from "./PercoMatchingTab";

type PresenceFilter = "all" | PresenceEmployeeSummary["state"] | "unmatched";

export function DiagnosticsTab({
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
    return Array.from(new Map(source.map(interval => [interval.id, interval])).values()).filter((interval) => {
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
  const activePagination = usePercoPagination(activeShiftEmployees, diagnosticsListPageSize, `${normalizedPresenceQuery}|${presenceState}`);
  const completedPagination = usePercoPagination(completedShiftEmployees, diagnosticsListPageSize, `${normalizedPresenceQuery}|${presenceState}`);
  const problemPagination = usePercoPagination(filteredProblemIntervals, diagnosticsListPageSize, `${normalizedPresenceQuery}|${presenceState}`);
  const eventPagination = usePercoPagination(filteredRecentEvents, defaultListPageSize, `${normalizedPresenceQuery}|${presenceState}`);

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

      <PercoAnalytics diagnostics={diagnostics} />

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
              <h2>Открытые и спорные интервалы</h2>
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
export function LogsTab({ canView, logs, status, onRefresh }: { canView: boolean; logs: PercoIntegrationLogDto[]; status: LoadStatus; onRefresh: () => void }) {
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
  const pagination = usePercoPagination(filteredLogs, defaultListPageSize, normalizedQuery);

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
