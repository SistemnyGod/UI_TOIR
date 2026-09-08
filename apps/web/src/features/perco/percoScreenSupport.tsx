import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../../api/client";
import type { ClosePercoPresenceIntervalDto, PercoAccessEventDiagnosticsDto, PercoConnectionTestResultDto, PercoDiagnosticsDto, PercoIntegrationLogDto, PercoIntegrationSettingsDto, PercoPresenceIntervalDiagnosticsDto, PercoSecretStatusDto, PercoSyncResultDto, PercoUnmatchedEmployeeDto, SessionUserDto } from "../../api/contracts";
import type { EmployeeDirectoryItem } from "../../types";

export type PercoTab = "dashboard" | "connection" | "sync" | "matching" | "diagnostics" | "logs";
export type LoadStatus = "idle" | "loading" | "ready" | "saving" | "error";

export interface PercoIntegrationScreenProps {
  currentUser: SessionUserDto | null;
  employeeDirectory: EmployeeDirectoryItem[];
  onNotify: (message: string) => void;
}
export interface SettingsForm {
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

export interface PresenceEmployeeSummary {
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

export interface PercoHourlyFlowPoint {
  hour: string;
  inCount: number;
  outCount: number;
}

export interface PercoDurationBucket {
  label: string;
  count: number;
}

export const defaultSettings: SettingsForm = {
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

export const percoTabs: Array<{ id: PercoTab; label: string }> = [
  { id: "dashboard", label: "Дашборд" },
  { id: "connection", label: "Подключение" },
  { id: "sync", label: "Синхронизация" },
  { id: "matching", label: "Сопоставление" },
  { id: "diagnostics", label: "Проходы и смены" },
  { id: "logs", label: "Журнал" },
];

export const percoTabOrder = percoTabs.map((tab) => tab.id);
export const pageSizeOptions = [10, 25, 50, 100] as const;
export type PercoPageSize = (typeof pageSizeOptions)[number];
export const defaultListPageSize: PercoPageSize = 10;
export const diagnosticsListPageSize: PercoPageSize = 10;

export function getPercoTabLabel(tab: PercoTab) {
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

export function SettingsStatus({ settings }: { settings: PercoIntegrationSettingsDto | null }) {
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

export function ConnectionResult({ result }: { result: PercoConnectionTestResultDto }) {
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

export function SyncSummary({ result }: { result: PercoSyncResultDto }) {
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

export function ConfirmIgnoreEmployeeModal({
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

export function ClosePresenceModal({
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
export function PercoFlowChart({ points }: { points: PercoHourlyFlowPoint[] }) {
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

export function PresenceRatio({ inside, outside, stale }: { inside: number; outside: number; stale: number }) {
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

export function DurationBars({ buckets }: { buckets: PercoDurationBucket[] }) {
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

export function getChartBarHeight(value: number, max: number) {
  if (value <= 0) return "0%";
  return `${Math.max(1, (value / Math.max(1, max)) * 100)}%`;
}

export function PresenceTimeline({ intervals }: { intervals: PercoPresenceIntervalDiagnosticsDto[] }) {
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

export function MetricCard({
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

export function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="perco-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SecretField({
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

export function StatusPill({ status }: { status: string }) {
  const normalized = normalizeStatusTone(status);
  return <span className={`perco-status-pill ${normalized}`}>{formatStatus(status)}</span>;
}

export function usePercoPagination<T>(items: T[], initialPageSize: PercoPageSize = defaultListPageSize) {
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

export function ListPagination({
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

export function EmptyBlock({ text, title }: { text: string; title: string }) {
  return (
    <div className="perco-empty-block">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

export function buildHourlyFlow(events: PercoAccessEventDiagnosticsDto[]): PercoHourlyFlowPoint[] {
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

export function buildDurationBuckets(intervals: PercoPresenceIntervalDiagnosticsDto[]): PercoDurationBucket[] {
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

export function buildPercoQuality(diagnostics: PercoDiagnosticsDto | null, analytics: ReturnType<typeof buildPresenceAnalytics>) {
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

export function buildPresenceAnalytics(diagnostics: PercoDiagnosticsDto | null) {
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

export function toForm(settings: PercoIntegrationSettingsDto): SettingsForm {
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

export function buildSuggestedMatches(items: ReadonlyArray<PercoUnmatchedEmployeeDto>) {
  return Object.fromEntries(items.map((item) => [item.percoEmployeeId, item.suggestedEmployeeId ?? null]));
}

export function getMatchSuggestionReason(item: PercoUnmatchedEmployeeDto, employeeOptions: EmployeeDirectoryItem[]) {
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

export function isStaleInterval(interval: PercoPresenceIntervalDiagnosticsDto) {
  if (interval.stateCode === "stale" || interval.needsReview) {
    return true;
  }

  const state = interval.state.toLowerCase();
  return !isOldOpenInterval(interval) && (interval.durationMinutes >= 18 * 60 || state.includes("требует") || state.includes("stale"));
}

export function isOldOpenInterval(interval: PercoPresenceIntervalDiagnosticsDto) {
  if (interval.stateCode === "old_open") {
    return true;
  }

  const state = interval.state.toLowerCase();
  return !interval.endedAt && (state.includes("стар") || state.includes("не входит"));
}

export function isLunchBreakInterval(interval: PercoPresenceIntervalDiagnosticsDto) {
  return interval.stateCode === "lunch_break" || interval.state.toLowerCase().includes("обед");
}

export function isClosedShiftInterval(interval: PercoPresenceIntervalDiagnosticsDto) {
  return interval.stateCode === "outside" || Boolean(interval.endedAt && !isLunchBreakInterval(interval) && !isStaleInterval(interval));
}

export function normalizeSearch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeStatusTone(status: string) {
  const value = status.toLowerCase();
  if (value.includes("success") || value.includes("ok") || value.includes("active") || value.includes("успеш")) return "success";
  if (value.includes("error") || value.includes("fail") || value.includes("ошиб")) return "error";
  if (value.includes("warn") || value.includes("треб")) return "warning";
  return "idle";
}

export function formatStatus(status: string) {
  const value = status || "нет данных";
  if (value === "success") return "Активно";
  if (value === "error") return "Ошибка";
  if (value === "warning") return "Внимание";
  if (value === "idle") return "Нет данных";
  return value;
}

export function formatSecretStatus(status: PercoSecretStatusDto) {
  return `API: ${status.apiStatus}; worker: ${status.workerStatus}`;
}

export function formatOperation(value: string) {
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

export function formatLogStatus(value: string) {
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

export function formatLogSource(createdByUserId: string | null) {
  return createdByUserId ? "Вручную через API" : "Автоматически, worker";
}

export function formatLogDetails(value: string) {
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

export function formatLogDetailKey(key: string) {
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

export function formatLogDetailValue(key: string, value: string) {
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

export function formatDateTime(value: string | null | undefined) {
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

export function formatDuration(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours <= 0) return `${mins} мин`;
  if (mins === 0) return `${hours} ч`;
  return `${hours} ч ${mins} мин`;
}

export function toDateTimeLocalValue(value: Date) {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function minIso(current: string | null, next: string) {
  if (!current) return next;
  return next < current ? next : current;
}

export function maxIso(current: string | null, next: string) {
  if (!current) return next;
  return next > current ? next : current;
}

export function isBusyStatus(status: LoadStatus) {
  return status === "loading" || status === "saving";
}

export function getErrorMessage(error: unknown) {
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
