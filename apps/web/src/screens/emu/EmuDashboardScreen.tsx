import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Import,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EmuAuditEventDto, EmuWorkSessionDto } from "../../api/contracts";
import type { EmuWorkspace } from "../../hooks/useEmuWorkspace";
import type { EmployeeDirectoryItem } from "../../types";

type MetricTone = "blue" | "green" | "orange" | "red";
type WorkStatusKind = "inWork" | "paused" | "completed" | "attention";
type IncidentSeverity = "high" | "medium" | "low";

type DashboardMetric = {
  key: string;
  title: string;
  value: string | number;
  delta: string;
  tone: MetricTone;
  icon: LucideIcon;
  sparkline: number[];
};

type AreaLoad = {
  areaName: string;
  count: number;
  percent: number;
};

type TrendPoint = {
  date: string;
  value: number;
};

type IncidentItem = {
  id: string;
  areaName: string;
  title: string;
  severity: IncidentSeverity;
};

type ShiftStatus = {
  title: string;
  shiftDate: string;
  timeRange: string;
  percent: number;
  elapsed: string;
  remaining: string;
  status: "active" | "closed";
};

type QuickStats = {
  planned: number;
  completed: number;
  overdue: number;
  inWork: number;
  planPercent: number;
};

export function EmuDashboardScreen({
  employeeDirectory,
  onNotify,
  workspace,
}: {
  employeeDirectory: EmployeeDirectoryItem[];
  onNotify: (message: string) => void;
  workspace: EmuWorkspace;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const intervalId = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const activeWork = workspace.dashboard.activeWork;
  const allWork = workspace.workSessions.rows.filter((work) => !work.deletedAt);
  const today = toDateKey(now);
  const completedToday = allWork.filter((work) => isCompletedOnDate(work, today));
  const pausedWork = activeWork.filter((work) => work.employees.some((employee) => !employee.finishedAt && employee.status !== "Работает"));
  const pausedWithoutWorking = activeWork.filter(
    (work) =>
      work.employees.some((employee) => !employee.finishedAt) &&
      !work.employees.some((employee) => !employee.finishedAt && employee.status === "Работает"),
  );
  const planWithoutApproval = workspace.planTasks.filter((task) => task.status === "Запланировано" && task.approvalStatus !== "Согласовано");
  const averageMinutes = averageCompletedMinutes(allWork);
  const metrics = buildMetrics(activeWork.length, completedToday.length, pausedWork.length, workspace.dashboard.forgottenWork.length + planWithoutApproval.length, averageMinutes);
  const shiftStatus = buildShiftStatus(now);
  const areaLoad = buildAreaLoad(workspace, activeWork);
  const trend = buildTrend(allWork);
  const incidents = buildIncidents(workspace.dashboard.forgottenWork, pausedWithoutWorking, planWithoutApproval);
  const quickStats = buildQuickStats(workspace, activeWork.length, completedToday.length, incidents.length);
  const lastUpdatedAt = now.toLocaleString("ru-RU", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit", year: "numeric" });

  function openAccounting(message: string) {
    window.location.hash = "emu-work-accounting";
    onNotify(message);
  }

  return (
    <section className="emu-page emu-dashboard-page">
      <div className="emu-dashboard-header">
        <div>
          <h2>Дашборд</h2>
          <p>Обзор текущей ситуации и ключевых показателей по работам и обслуживанию ЭМУ</p>
        </div>
        <div className="emu-dashboard-header-actions">
          <button className="emu-shift-select" type="button">
            {shiftStatus.shiftDate} ({shiftStatus.timeRange})
            <ChevronDown size={17} />
          </button>
          <button className="emu-secondary-button" onClick={() => void workspace.reload()} type="button">
            <RefreshCw size={17} />
            Обновить
          </button>
        </div>
      </div>

      {workspace.error ? <div className="emu-alert">{workspace.error}</div> : null}

      <section className="emu-dashboard-top-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
        <ShiftStatusCard shift={shiftStatus} />
      </section>

      <section className="emu-dashboard-middle-grid">
        <AreaSummary areas={areaLoad} />
        <TrendCard points={trend} />
        <QuickActions
          onAssignWork={() => openAccounting("Выберите сотрудников и отправьте карточку в работу.")}
          onCreateWork={() => openAccounting("Откройте форму «Отправить в работу» для создания новой карточки.")}
          onImportResults={() => onNotify("Импорт результатов будет добавлен отдельным сценарием после MVP.")}
          onReportProblem={() => onNotify("Проблемы сейчас фиксируются через паузу, результат работы и историю изменений карточки.")}
        />
      </section>

      <section className="emu-dashboard-bottom-grid">
        <ActiveWorks items={activeWork} onOpenAll={() => openAccounting("Активные карточки открыты во вкладке «Учет работ».")} />
        <Events events={workspace.dashboard.recentEvents} />
        <Incidents incidents={incidents} />
        <KeyIndicators stats={quickStats} />
      </section>

      <footer className="emu-dashboard-footer">
        <span>Избранных сотрудников: {workspace.settings.favoriteEmployees.filter((employee) => employee.isActive).length} из {employeeDirectory.length}</span>
        <span>
          Последнее обновление: {lastUpdatedAt}
          <RefreshCw size={16} />
        </span>
      </footer>
    </section>
  );
}

function MetricCard({ metric }: { metric: DashboardMetric }) {
  const Icon = metric.icon;
  const positive = !String(metric.delta).trim().startsWith("-");

  return (
    <article className={`emu-dashboard-metric emu-dashboard-tone-${metric.tone}`}>
      <div className="emu-dashboard-metric-main">
        <span className="emu-dashboard-icon"><Icon size={24} /></span>
        <div>
          <span>{metric.title}</span>
          <strong>{metric.value}</strong>
          <em className={positive ? "is-positive" : "is-negative"}>{metric.delta}</em>
        </div>
      </div>
      <Sparkline tone={metric.tone} values={metric.sparkline} />
    </article>
  );
}

function Sparkline({ tone, values }: { tone: MetricTone; values: number[] }) {
  if (!values.some((value) => value > 0)) {
    return <div className="emu-dashboard-sparkline-empty">Нет данных для графика</div>;
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const points = values
    .map((value, index) => {
      const x = index * 24;
      const y = 38 - ((value - min) / Math.max(max - min, 1)) * 28;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg aria-hidden="true" className="emu-dashboard-sparkline" viewBox="0 0 220 44">
      <polyline className={`tone-${tone}`} fill="none" points={points} />
    </svg>
  );
}

function ShiftStatusCard({ shift }: { shift: ShiftStatus }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (shift.percent / 100) * circumference;

  return (
    <article className="emu-dashboard-shift">
      <div className="emu-dashboard-card-title">
        <h3>{shift.title}</h3>
        <span className={shift.status === "active" ? "is-active" : ""}>{shift.status === "active" ? "Идет" : "Закрыта"}</span>
      </div>
      <div className="emu-dashboard-shift-main">
        <div className="emu-dashboard-donut">
          <svg viewBox="0 0 100 100">
            <circle cx="50" cy="50" fill="none" r={radius} stroke="#e8f1ff" strokeWidth="9" />
            <circle
              cx="50"
              cy="50"
              fill="none"
              r={radius}
              stroke="#0b63f6"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              strokeWidth="9"
              transform="rotate(-90 50 50)"
            />
          </svg>
          <strong>{shift.percent}%</strong>
        </div>
        <div>
          <b>{shift.shiftDate}</b>
          <span>{shift.timeRange}</span>
        </div>
      </div>
      <div className="emu-dashboard-shift-times">
        <span>Прошло <b>{shift.elapsed}</b></span>
        <span>Осталось <b>{shift.remaining}</b></span>
      </div>
    </article>
  );
}

function AreaSummary({ areas }: { areas: AreaLoad[] }) {
  return (
    <DashboardCard action="По участкам" title="Оперативная сводка">
      <div className="emu-area-summary">
        {areas.map((area) => (
          <div key={area.areaName}>
            <span>{area.areaName}</span>
            <div><i style={{ width: `${area.percent}%` }} /></div>
            <b>{area.count}</b>
            <em>{area.percent}%</em>
          </div>
        ))}
        <p><span>● Загрузка</span><span>Количество работ</span></p>
      </div>
    </DashboardCard>
  );
}

function TrendCard({ points }: { points: TrendPoint[] }) {
  const hasData = points.some((point) => point.value > 0);
  const max = Math.max(...points.map((point) => point.value), 1);
  const coords = points.map((point, index) => `${42 + index * 78},${142 - (point.value / max) * 100}`).join(" ");

  return (
    <DashboardCard action="По завершению" title="Динамика выполнения работ">
      <div className="emu-trend-chart">
        {hasData ? <svg viewBox="0 0 560 190">
          {[0, 1, 2, 3].map((line) => (
            <line key={line} stroke="#e2e8f0" strokeDasharray="4 4" x1="30" x2="540" y1={40 + line * 35} y2={40 + line * 35} />
          ))}
          <polyline fill="none" points={coords} stroke="#0b63f6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          {points.map((point, index) => {
            const x = 42 + index * 78;
            const y = 142 - (point.value / max) * 100;
            return (
              <g key={point.date}>
                <circle cx={x} cy={y} fill="#0b63f6" r="5" />
                <text fill="#17213a" fontSize="12" fontWeight="700" textAnchor="middle" x={x} y={y - 12}>{point.value}</text>
                <text fill="#64748b" fontSize="12" textAnchor="middle" x={x} y="174">{point.date}</text>
              </g>
            );
          })}
        </svg> : <div className="emu-empty-state">Реальных завершенных работ за период пока нет</div>}
        <span>● Завершено работ</span>
      </div>
    </DashboardCard>
  );
}

function QuickActions({
  onAssignWork,
  onCreateWork,
  onImportResults,
  onReportProblem,
}: {
  onAssignWork: () => void;
  onCreateWork: () => void;
  onImportResults: () => void;
  onReportProblem: () => void;
}) {
  const actions = [
    { icon: Plus, label: "Создать работу", onClick: onCreateWork, variant: "primary" },
    { icon: Users, label: "Назначить работу", onClick: onAssignWork, variant: "secondary" },
    { icon: AlertTriangle, label: "Сообщить о проблеме", onClick: onReportProblem, variant: "secondary" },
    { icon: Import, label: "Импорт результатов", onClick: onImportResults, variant: "secondary" },
  ] as const;

  return (
    <DashboardCard title="Быстрые действия">
      <div className="emu-quick-actions">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button className={action.variant === "primary" ? "primary" : ""} key={action.label} onClick={action.onClick} type="button">
              <Icon size={18} />
              {action.label}
            </button>
          );
        })}
      </div>
    </DashboardCard>
  );
}

function ActiveWorks({ items, onOpenAll }: { items: EmuWorkSessionDto[]; onOpenAll: () => void }) {
  return (
    <DashboardCard action="Все работы" onAction={onOpenAll} title="Активные работы">
      <div className="emu-active-work-list">
        {items.length ? (
          items.slice(0, 5).map((work) => {
            const status = resolveWorkStatus(work);
            const primaryEmployee = work.employees[0];
            return (
              <article className={`status-${status}`} key={work.id}>
                <div>
                  <small>{work.sectionName || "Прочее"}</small>
                  <strong>{work.taskDescription || "Задача не указана"}</strong>
                  <span>{primaryEmployee?.fullNameSnapshot || "Сотрудник не указан"} · {primaryEmployee?.positionSnapshot || "бригада не указана"}</span>
                </div>
                <div>
                  <StatusBadge status={status} />
                  <b>{formatClockDuration(work)}</b>
                  <span>{formatStartedAt(work.arrivedAt)}</span>
                </div>
              </article>
            );
          })
        ) : (
          <div className="emu-empty-state">Активных работ пока нет</div>
        )}
      </div>
      {items.length > 5 ? <LinkFooter onClick={onOpenAll} text={`Показать еще ${items.length - 5} работ`} /> : null}
    </DashboardCard>
  );
}

function Events({ events }: { events: EmuAuditEventDto[] }) {
  return (
    <DashboardCard action="Все события" title="Последние события">
      <div className="emu-event-list">
        {events.length ? (
          events.slice(0, 5).map((event) => {
            const Icon = auditIcon(event.eventType);
            const summary = auditSummary(event);
            return (
              <article key={event.id}>
                <span><Icon size={18} /></span>
                <div>
                  <strong>{summary.title}</strong>
                  <small>{summary.detail}</small>
                </div>
                <time>{formatTime(event.createdAt)}</time>
              </article>
            );
          })
        ) : (
          <div className="emu-empty-state">Событий пока нет</div>
        )}
      </div>
      {events.length > 5 ? <LinkFooter text={`Показать еще ${events.length - 5} событий`} /> : null}
    </DashboardCard>
  );
}

function Incidents({ incidents }: { incidents: IncidentItem[] }) {
  return (
    <DashboardCard title="Инциденты и проблемы">
      <div className="emu-incident-list">
        {incidents.length ? (
          incidents.slice(0, 5).map((incident) => (
            <article className={`severity-${incident.severity}`} key={incident.id}>
              <small>{incident.areaName}</small>
              <strong>{incident.title}</strong>
              <SeverityBadge severity={incident.severity} />
            </article>
          ))
        ) : (
          <div className="emu-empty-state">Открытых проблем нет</div>
        )}
      </div>
      {incidents.length > 5 ? <LinkFooter text={`Показать еще ${incidents.length - 5} проблем`} /> : null}
    </DashboardCard>
  );
}

function KeyIndicators({ stats }: { stats: QuickStats }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (stats.planPercent / 100) * circumference;

  return (
    <DashboardCard action="Сегодня" title="Ключевые показатели">
      <div className="emu-key-indicators">
        <div className="emu-key-indicators-main">
          <div>
            <span>План работ</span>
            <strong>{stats.planned}</strong>
            <span>Выполнено</span>
            <strong>{stats.completed}</strong>
          </div>
          <div className="emu-dashboard-donut">
            <svg viewBox="0 0 110 110">
              <circle cx="55" cy="55" fill="none" r={radius} stroke="#e8f1ff" strokeWidth="10" />
              <circle
                cx="55"
                cy="55"
                fill="none"
                r={radius}
                stroke="#0b63f6"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                strokeWidth="10"
                transform="rotate(-90 55 55)"
              />
            </svg>
            <strong>{stats.planPercent}%</strong>
            <span>от плана</span>
          </div>
        </div>
        <div className="emu-key-indicators-foot">
          <span>Просрочено <b>{stats.overdue}</b></span>
          <span>В работе <b>{stats.inWork}</b></span>
        </div>
      </div>
    </DashboardCard>
  );
}

function DashboardCard({
  action,
  children,
  onAction,
  title,
}: {
  action?: string;
  children: ReactNode;
  onAction?: () => void;
  title: string;
}) {
  return (
    <section className="emu-dashboard-card">
      <header>
        <h3>{title}</h3>
        {action ? (
          <button onClick={onAction} type="button">
            {action}
            <ChevronDown size={15} />
          </button>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: WorkStatusKind }) {
  return <span className={`emu-dashboard-status status-${status}`}>{statusText(status)}</span>;
}

function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  return <span className={`emu-dashboard-severity severity-${severity}`}>{severityText(severity)}</span>;
}

function LinkFooter({ onClick, text }: { onClick?: () => void; text: string }) {
  return (
    <button className="emu-dashboard-link-footer" onClick={onClick} type="button">
      {text}
      <ChevronDown size={15} />
    </button>
  );
}

function buildMetrics(active: number, completed: number, paused: number, attention: number, averageMinutes: number): DashboardMetric[] {
  return [
    { icon: Play, key: "active", title: "Активные работы", value: active, delta: active ? "в работе сейчас" : "нет активных", tone: "blue", sparkline: [] },
    { icon: CheckCircle2, key: "completed", title: "Завершено сегодня", value: completed, delta: completed ? "за сегодня" : "нет завершенных", tone: "green", sparkline: [] },
    { icon: Pause, key: "paused", title: "На паузе", value: paused, delta: paused ? "ожидание открыто" : "нет пауз", tone: "orange", sparkline: [] },
    { icon: AlertTriangle, key: "attention", title: "Требуют внимания", value: attention, delta: attention ? "требует проверки" : "нет замечаний", tone: "red", sparkline: [] },
    { icon: Clock3, key: "avgTime", title: "Среднее время", value: averageMinutes ? formatMinutes(averageMinutes) : "Нет данных", delta: averageMinutes ? "по завершенным работам" : "нет завершенных", tone: "blue", sparkline: [] },
  ];

}

function buildShiftStatus(now: Date): ShiftStatus {
  const hour = now.getHours();
  const shiftStart = new Date(now);
  const shiftEnd = new Date(now);
  if (hour >= 15 && hour < 23) {
    shiftStart.setHours(15, 0, 0, 0);
    shiftEnd.setHours(23, 0, 0, 0);
  } else if (hour >= 7 && hour < 15) {
    shiftStart.setHours(7, 0, 0, 0);
    shiftEnd.setHours(15, 0, 0, 0);
  } else {
    shiftStart.setHours(hour >= 23 ? 23 : -1, 0, 0, 0);
    shiftEnd.setTime(shiftStart.getTime());
    shiftEnd.setHours(shiftEnd.getHours() + 8);
  }

  const total = shiftEnd.getTime() - shiftStart.getTime();
  const elapsedMs = Math.max(0, Math.min(total, now.getTime() - shiftStart.getTime()));
  const percent = Math.round((elapsedMs / Math.max(total, 1)) * 100);
  const date = shiftStart.toLocaleDateString("ru-RU");
  return {
    elapsed: formatMinutes(Math.round(elapsedMs / 60000)),
    percent,
    remaining: formatMinutes(Math.max(0, Math.round((total - elapsedMs) / 60000))),
    shiftDate: `Смена ${date}`,
    status: percent >= 100 ? "closed" : "active",
    timeRange: `${formatTimeOnly(shiftStart)} — ${formatTimeOnly(shiftEnd)}`,
    title: "Статус смены",
  };
}

function buildAreaLoad(workspace: EmuWorkspace, activeWork: EmuWorkSessionDto[]): AreaLoad[] {
  const rows = workspace.settings.sections
    .filter((section) => section.isActive)
    .map((section) => {
      const activeCount = activeWork.filter((work) => work.sectionId === section.id).length;
      const plannedCount = workspace.planTasks.filter((task) => task.sectionId === section.id && task.status === "Запланировано").length;
      return {
        areaName: section.name,
        count: activeCount + plannedCount,
        percent: 0,
      };
    });
  const max = Math.max(...rows.map((row) => row.count), 1);
  return rows.map((row) => ({ ...row, percent: Math.round((row.count / max) * 100) })).slice(0, 6);
}

function buildTrend(work: EmuWorkSessionDto[]): TrendPoint[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = toDateKey(date);
    return {
      date: date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
      value: work.filter((item) => isCompletedOnDate(item, key)).length,
    };
  });
}

function buildIncidents(forgotten: EmuWorkSessionDto[], paused: EmuWorkSessionDto[], planWithoutApproval: Array<{ id: string; title: string; plannedDate: string; sectionName: string }>): IncidentItem[] {
  return [
    ...forgotten.map((work) => ({
      areaName: work.sectionName || "Прочее",
      id: `forgotten-${work.id}`,
      severity: "high" as const,
      title: `Забытая работа: ${work.taskDescription || work.workNumber}`,
    })),
    ...paused.map((work) => ({
      areaName: work.sectionName || "Прочее",
      id: `paused-${work.id}`,
      severity: "medium" as const,
      title: `Открытая пауза: ${work.taskDescription || work.workNumber}`,
    })),
    ...planWithoutApproval.map((task) => ({
      areaName: task.sectionName || "Прочее",
      id: `plan-${task.id}`,
      severity: "low" as const,
      title: `План без согласования: ${task.title}`,
    })),
  ];
}

function buildQuickStats(workspace: EmuWorkspace, active: number, completed: number, overdue: number): QuickStats {
  const planned = workspace.planTasks.length;
  const approved = workspace.planTasks.filter((task) => task.approvalStatus === "Согласовано").length;
  return {
    completed,
    inWork: active,
    overdue,
    planned,
    planPercent: planned ? Math.round((approved / planned) * 100) : 0,
  };
}

function resolveWorkStatus(work: EmuWorkSessionDto): WorkStatusKind {
  if (work.completedAt) return "completed";
  if (work.isCarriedOver) return "attention";
  if (work.employees.some((employee) => !employee.finishedAt && employee.status !== "Работает")) return "paused";
  return "inWork";
}

function statusText(status: WorkStatusKind) {
  if (status === "paused") return "Пауза";
  if (status === "completed") return "Завершено";
  if (status === "attention") return "Внимание";
  return "В работе";
}

function severityText(severity: IncidentSeverity) {
  if (severity === "high") return "Высокий";
  if (severity === "medium") return "Средний";
  return "Низкий";
}

function auditIcon(eventType: string): LucideIcon {
  if (eventType.includes("completed")) return CheckCircle2;
  if (eventType.includes("_changed") || eventType.includes("updated")) return Clock3;
  if (eventType.includes("paused") || eventType.includes("other_work")) return Pause;
  if (eventType.includes("created") || eventType.includes("started")) return Play;
  if (eventType.includes("deleted") || eventType.includes("changed")) return AlertTriangle;
  return Users;
}

function auditTitle(event: EmuAuditEventDto) {
  if (event.eventType.includes("completed_at_changed")) return "Изменено время окончания";
  if (event.eventType.includes("arrived_at_changed")) return "Изменено время прихода";
  if (event.eventType.includes("work_date_changed")) return "Изменена дата работы";
  if (event.eventType.includes("time_changed")) return "Изменено время";
  if (event.eventType.includes("updated")) return "Карточка изменена";
  const labels: Record<string, string> = {
    completed: "Работа завершена",
    created: "Начата работа",
    deleted: "Работа удалена",
    paused: "Работа поставлена на паузу",
    plan_started: "Плановая задача отправлена в работу",
    resumed: "Работа продолжена",
  };
  return labels[event.eventType] ?? event.eventType;
}

function auditSummary(event: EmuAuditEventDto) {
  return {
    detail: compactAuditDetail(event),
    title: auditTitle(event),
  };
}

function compactAuditDetail(event: EmuAuditEventDto) {
  const comment = event.comment?.trim();
  if (comment) {
    const explicitComment = comment.match(/комментарий:\s*(.+)$/iu)?.[1]?.trim();
    if (explicitComment) return truncateText(explicitComment, 72);
    if (comment.includes("Ручная корректировка") || comment.includes("Серверное время")) {
      return "Ручная корректировка времени";
    }
    return truncateText(comment.replace(/\s+/g, " "), 72);
  }

  const from = event.fromStatus || "";
  const to = event.toStatus || "";
  if (from && to && from !== to) return `${from} → ${to}`;
  if (to) return to;
  return "Действие записано";
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}…` : value;
}

function averageCompletedMinutes(work: EmuWorkSessionDto[]) {
  const completed = work.filter((item) => item.completedAt && !item.deletedAt);
  if (!completed.length) return 0;
  return Math.round(completed.reduce((sum, item) => sum + item.workMinutes + item.waitingMinutes + item.otherWorkMinutes, 0) / completed.length);
}

function formatClockDuration(work: EmuWorkSessionDto) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(work.arrivedAt).getTime()) / 60000));
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}:00`;
}

function formatStartedAt(value: string) {
  return `начат ${formatTime(value)}`;
}

function formatMinutes(value: number) {
  if (value <= 0) return "0 мин";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatTimeOnly(value: Date) {
  return value.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isCompletedOnDate(work: EmuWorkSessionDto, dateKey: string) {
  return Boolean(work.completedAt && toDateKey(new Date(work.completedAt)) === dateKey);
}

