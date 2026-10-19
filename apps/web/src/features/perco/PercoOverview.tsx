import { useMemo } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, RefreshCw, UserRoundPlus } from "lucide-react";
import type { PercoDiagnosticsDto, PercoIntegrationLogDto, PercoPresenceIntervalDiagnosticsDto } from "../../api/contracts";
import { PercoAnalytics } from "./PercoAnalytics";
import { buildPresenceAnalytics, EmptyBlock, formatDateTime, formatDuration, formatOperation, isBusyStatus, isOldOpenInterval, MetricCard, type LoadStatus, type PercoTab } from "./percoScreenSupport";

interface PercoOverviewProps {
  canSync: boolean;
  canManage: boolean;
  canViewLogs: boolean;
  diagnostics: PercoDiagnosticsDto | null;
  logs: PercoIntegrationLogDto[];
  status: LoadStatus;
  onCloseInterval: (interval: PercoPresenceIntervalDiagnosticsDto) => void;
  onNavigate: (tab: PercoTab) => void;
  onRefresh: () => Promise<void>;
  onSyncEvents: () => void;
}

export function PercoOverview({ canSync, canManage, canViewLogs, diagnostics, logs, status, onCloseInterval, onNavigate, onRefresh, onSyncEvents }: PercoOverviewProps) {
  const analytics = useMemo(() => buildPresenceAnalytics(diagnostics), [diagnostics]);
  if (!diagnostics) return <section className="perco-card perco-overview-empty"><EmptyBlock title={status === "loading" ? "Загружаем присутствие и проходы…" : "Данные присутствия не загружены"} text="После обновления здесь появятся сотрудники на территории, последние проходы и интервалы для проверки." /><button type="button" className="perco-button perco-button-primary" disabled={isBusyStatus(status)} onClick={() => void onRefresh()}>Обновить данные</button></section>;

  const attention = [...analytics.staleIntervals, ...analytics.archiveOpenIntervals].slice(0, 5);
  const employees = analytics.employees.filter(employee => employee.state === "inside").slice(0, 6);
  const events = [...diagnostics.recentEvents].sort((a, b) => Date.parse(b.eventAt) - Date.parse(a.eventAt)).slice(0, 6);
  const reviewCount = analytics.staleCount + diagnostics.oldOpenPresenceCount;
  return <section className="perco-dashboard">
    <header className="perco-overview-head">
      <div><h2>Присутствие и проходы</h2><p>Обновлено {formatDateTime(diagnostics.generatedAt)} · по загруженным данным</p></div>
      <div className="perco-dashboard-actions">
        <button className="perco-button perco-button-secondary" type="button" onClick={() => onNavigate("diagnostics")}>Все проходы и смены<ChevronRight size={16} aria-hidden="true" /></button>
        {canSync ? <button className="perco-button perco-button-primary" disabled={isBusyStatus(status)} type="button" onClick={onSyncEvents}><RefreshCw size={16} aria-hidden="true" />Синхронизировать проходы</button> : null}
      </div>
    </header>
    <div className="perco-dashboard-kpis" aria-label="Сводка присутствия">
      <MetricCard label="На территории" value={analytics.insideCount} note="подтверждённые открытые входы" tone="success" />
      <MetricCard label="Завершили смену" value={analytics.outsideCount} note="есть вход и выход" />
      <MetricCard label="Спорные интервалы" value={analytics.staleCount} note="в текущей выборке" tone={analytics.staleCount ? "danger" : "success"} />
      <MetricCard label="Старые открытые входы" value={diagnostics.oldOpenPresenceCount} note="не входят в текущую смену" tone={diagnostics.oldOpenPresenceCount ? "warning" : "success"} />
      <MetricCard label="Проходы без сотрудника" value={diagnostics.unmatchedEventsCount} note="требуют сопоставления" tone={diagnostics.unmatchedEventsCount ? "warning" : "success"} />
    </div>
    <div className="perco-overview-links">
      <button className="perco-link-button" type="button" onClick={() => onNavigate("matching")}><UserRoundPlus size={16} aria-hidden="true" />Сопоставить сотрудников</button>
      {canViewLogs ? <button className="perco-link-button" type="button" onClick={() => onNavigate("logs")}>Журнал синхронизации<ChevronRight size={16} aria-hidden="true" /></button> : null}
      <span>{canViewLogs && logs[0] ? `${formatOperation(logs[0].operation)} · ${formatDateTime(logs[0].startedAt)}` : `Окно расчёта: ${formatDateTime(diagnostics.windowStart)} — ${formatDateTime(diagnostics.windowEnd)}`}</span>
    </div>
    <div className="perco-dashboard-main-grid">
      <section className="perco-card perco-card-flat">
        <header><div><h2>Кто сейчас на территории</h2><span>Показаны {employees.length} из {analytics.insideCount}</span></div><button className="perco-link-button" type="button" onClick={() => onNavigate("diagnostics")}>Все смены</button></header>
        <div className="perco-dashboard-employee-list">
          {employees.length ? employees.map(employee => <article key={employee.employeeId || employee.employeeName}>
            <span className="perco-presence-dot inside" aria-hidden="true" />
            <div><strong>{employee.employeeName}</strong><small>Таб. {employee.personnelNo || "—"} · вход {formatDateTime(employee.currentStartedAt)}</small></div>
            <b title="Длительность текущего открытого интервала">{formatDuration(employee.currentMinutes)}</b>
          </article>) : <EmptyBlock title="Подтверждённых открытых входов нет" text="Проверьте последние проходы и спорные интервалы." />}
        </div>
      </section>
      <section className="perco-card perco-card-flat perco-attention-card">
        <header><div><h2>Требует проверки</h2><span>{reviewCount ? `${reviewCount} спорных и старых интервалов` : "Проблемных интервалов нет"}</span></div><button className="perco-link-button" type="button" onClick={() => onNavigate("diagnostics")}>Проверить</button></header>
        <div className="perco-dashboard-attention-list">
          {attention.length ? attention.map(interval => <article className={isOldOpenInterval(interval) ? "is-archive" : ""} key={interval.id}>
            <div><strong>{interval.employeeName}</strong><span>{isOldOpenInterval(interval) ? "Старый вход" : "Нет подтверждённого выхода"} · {formatDateTime(interval.startedAt)}</span><small>{formatDuration(interval.durationMinutes)}</small></div>
            {canManage && !interval.endedAt ? <button className="perco-link-button" disabled={isBusyStatus(status)} type="button" onClick={() => onCloseInterval(interval)}>Закрыть вручную</button> : null}
          </article>) : <EmptyBlock title="Интервалов для проверки нет" text="В загруженных данных нет зависших входов." />}
        </div>
      </section>
      <section className="perco-card perco-card-flat">
        <header><div><h2>Последние проходы</h2><span>Новые события сверху</span></div><button className="perco-link-button" type="button" onClick={() => onNavigate("diagnostics")}>Все</button></header>
        <div className="perco-dashboard-event-list">
          {events.length ? events.map(event => <article key={event.id}>
            <b className={event.direction === "IN" ? "in" : event.direction === "OUT" ? "out" : ""}>{event.direction === "IN" ? <ArrowDownLeft size={14} aria-hidden="true" /> : <ArrowUpRight size={14} aria-hidden="true" />}{event.directionLabel || event.direction}</b>
            <div><strong>{event.employeeName || "Сотрудник не сопоставлен"}</strong><span>{formatDateTime(event.eventAt)} · {event.deviceName || "Устройство не указано"}</span></div>
          </article>) : <EmptyBlock title="Проходов нет" text="Обновите данные после синхронизации PERCo." />}
        </div>
      </section>
    </div>
    <PercoAnalytics diagnostics={diagnostics} />
  </section>;
}
