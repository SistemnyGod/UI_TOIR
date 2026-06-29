import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EmuAuditEventDto, EmuPlanTaskDto, EmuWorkSessionDto, EmuWorkSessionEmployeeDto } from "../../api/contracts";
import { buildEmuEmployeeWorkload, normalizeEmuText, type EmuEmployeeWorkload } from "../../domain/emuWorkBoard";
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

type SectionRisk = {
  active: number;
  completedToday: number;
  sectionName: string;
  waiting: number;
  waitingMinutes: number;
};

type DashboardDrilldown =
  | { employeeId: string; kind: "employee" }
  | { kind: "section"; sectionName: string }
  | null;

const text = normalizeEmuText;

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
  const [drilldown, setDrilldown] = useState<DashboardDrilldown>(null);

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

  const today = toDateKey(now);
  const activeWork = workspace.dashboard.activeWork.filter((work) => !work.deletedAt);
  const allWork = workspace.workSessions.rows.filter((work) => !work.deletedAt);
  const completedToday = allWork.filter((work) => isCompletedOnDate(work, today));
  const pausedWork = activeWork.filter(hasPausedParticipant);
  const pausedWithoutWorking = activeWork.filter((work) => hasActiveParticipant(work) && !hasWorkingParticipant(work));
  const planWithoutApproval = workspace.planTasks.filter(isUnapprovedPlannedTask);
  const decisionsCount = workspace.decisions.filter((decision) => text(decision.status) !== "resolved").length;
  const attentionCount = workspace.dashboard.forgottenWork.length + planWithoutApproval.length + decisionsCount;
  const averageMinutes = averageCompletedMinutes(allWork);

  const employeeWorkload = useMemo(
    () => buildEmuEmployeeWorkload(workspace.settings.favoriteEmployees, allWork, employeeDirectory),
    [allWork, employeeDirectory, workspace.settings.favoriteEmployees],
  );

  const metrics = buildMetrics(activeWork.length, completedToday.length, pausedWork.length, attentionCount, averageMinutes);
  const shiftStatus = buildShiftStatus(now);
  const areaLoad = buildAreaLoad(workspace, activeWork);
  const sectionRisks = buildSectionRisks(workspace, activeWork, allWork, today);
  const trend = buildTrend(allWork);
  const incidents = buildIncidents(workspace.dashboard.forgottenWork, pausedWithoutWorking, planWithoutApproval, decisionsCount);
  const quickStats = buildQuickStats(workspace, activeWork.length, completedToday.length, incidents.length);
  const lastUpdatedAt = now.toLocaleString("ru-RU", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit", year: "numeric" });

  function openAccounting(message: string) {
    window.location.hash = "emu-work-accounting";
    onNotify(message);
  }

  function openHistory() {
    window.location.hash = "emu-completed-work-history";
    onNotify("Открыта история выполненных работ ЭМУ.");
  }

  return (
    <section className="emu-page emu-dashboard-page">
      <div className="emu-dashboard-header">
        <div>
          <h2>Дашборд ЭМУ</h2>
          <p>Оперативная сводка по активным работам, смене, участкам, сотрудникам и проблемам.</p>
        </div>
        <div className="emu-dashboard-header-actions">
          <button className="emu-shift-select" type="button">
            {shiftStatus.shiftDate} ({shiftStatus.timeRange})
          </button>
          <button className="emu-secondary-button" onClick={openHistory} type="button">
            <BarChart3 size={17} />
            История
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
        <AreaSummary areas={areaLoad} onOpenSection={(sectionName) => setDrilldown({ kind: "section", sectionName })} />
        <TrendCard points={trend} />
        <QuickActions
          onCreateWork={() => openAccounting("Откройте форму создания работы и выберите участок, задачу и сотрудников.")}
          onOpenHistory={openHistory}
          onOpenProblemWork={() => openAccounting("Открыт учет работ. Проверьте карточки с паузами, решениями и переносами.")}
          onReportProblem={() => onNotify("Проблемы фиксируются через паузу, результат работы, решение и аудит карточки.")}
        />
      </section>

      <section className="emu-dashboard-bottom-grid">
        <EmployeeOccupancy items={employeeWorkload} onOpenEmployee={(employeeId) => setDrilldown({ employeeId, kind: "employee" })} />
        <SectionRisks items={sectionRisks} onOpenSection={(sectionName) => setDrilldown({ kind: "section", sectionName })} />
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

      {drilldown ? (
        <DashboardDrilldownModal
          activeWork={activeWork}
          allWork={allWork}
          drilldown={drilldown}
          employeeWorkload={employeeWorkload}
          onClose={() => setDrilldown(null)}
          onOpenAccounting={() => openAccounting("Открыт учет работ по выбранному объекту дашборда.")}
          onOpenHistory={openHistory}
        />
      ) : null}
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
          <span>смены</span>
        </div>
        <div>
          <b>{shift.shiftDate}</b>
          <span>{shift.timeRange}</span>
          <div className="emu-dashboard-shift-times">
            <div>
              <span>Прошло</span>
              <b>{shift.elapsed}</b>
            </div>
            <div>
              <span>Осталось</span>
              <b>{shift.remaining}</b>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function AreaSummary({ areas, onOpenSection }: { areas: AreaLoad[]; onOpenSection: (sectionName: string) => void }) {
  return (
    <article className="emu-dashboard-card">
      <header>
        <div>
          <h3>Оперативная сводка по участкам</h3>
          <span>Активные работы и доля загрузки</span>
        </div>
      </header>
      <div className="emu-area-bars">
        {areas.length === 0 ? <EmptyCardText>Активных участков сейчас нет.</EmptyCardText> : null}
        {areas.map((area) => (
          <button key={area.areaName} onClick={() => onOpenSection(area.areaName)} type="button">
            <span>{area.areaName}</span>
            <b>{area.count}</b>
            <i>
              <em style={{ width: `${area.percent}%` }} />
            </i>
          </button>
        ))}
      </div>
    </article>
  );
}

function TrendCard({ points }: { points: TrendPoint[] }) {
  const max = Math.max(...points.map((point) => point.value), 1);
  const hasData = points.some((point) => point.value > 0);

  return (
    <article className="emu-dashboard-card">
      <header>
        <div>
          <h3>Динамика выполнения работ</h3>
          <span>Завершенные работы за последние 7 дней</span>
        </div>
      </header>
      {!hasData ? <EmptyCardText>Завершенных работ за последние 7 дней пока нет.</EmptyCardText> : null}
      <div className="emu-dashboard-bars">
        {points.map((point) => (
          <div key={point.date}>
            <i style={{ height: `${Math.max(8, (point.value / max) * 100)}%` }} />
            <span>{point.date}</span>
            <b>{point.value}</b>
          </div>
        ))}
      </div>
    </article>
  );
}

function QuickActions({
  onCreateWork,
  onOpenHistory,
  onOpenProblemWork,
  onReportProblem,
}: {
  onCreateWork: () => void;
  onOpenHistory: () => void;
  onOpenProblemWork: () => void;
  onReportProblem: () => void;
}) {
  return (
    <article className="emu-dashboard-card emu-dashboard-actions">
      <header>
        <div>
          <h3>Быстрые действия</h3>
          <span>Основные переходы диспетчера</span>
        </div>
      </header>
      <div className="emu-quick-actions">
        <button className="primary" onClick={onCreateWork} type="button">
          <Plus size={18} />
          Создать работу
        </button>
        <button onClick={onOpenProblemWork} type="button">
          <AlertTriangle size={18} />
          Открыть проблемные
        </button>
        <button onClick={onOpenHistory} type="button">
          <BarChart3 size={18} />
          История
        </button>
        <button onClick={onReportProblem} type="button">
          <Download size={18} />
          PERCo
        </button>
      </div>
    </article>
  );
}

function EmployeeOccupancy({ items, onOpenEmployee }: { items: EmuEmployeeWorkload[]; onOpenEmployee: (employeeId: string) => void }) {
  const counts = {
    conflict: items.filter((item) => item.status === "conflict").length,
    free: items.filter((item) => item.status === "free").length,
    waiting: items.filter((item) => item.status === "waiting").length,
    working: items.filter((item) => item.status === "working").length,
  };
  const total = Math.max(items.length, 1);
  const top = (items.some((item) => item.status !== "free") ? items.filter((item) => item.status !== "free") : items).slice(0, 5);

  return (
    <article className="emu-dashboard-card">
      <header>
        <div>
          <h3>Занятость сотрудников</h3>
          <span>Избранные сотрудники ЭМУ</span>
        </div>
      </header>
      <div className="emu-dashboard-occupancy">
        <div className="emu-dashboard-occupancy-grid">
          <article>
            <span>Свободны</span>
            <strong>{counts.free}</strong>
          </article>
          <article>
            <span>В работе</span>
            <strong>{counts.working}</strong>
          </article>
          <article>
            <span>На паузе</span>
            <strong>{counts.waiting}</strong>
          </article>
          <article>
            <span>Конфликты</span>
            <strong>{counts.conflict}</strong>
          </article>
        </div>
        <div className="emu-dashboard-occupancy-bar">
          <i style={{ width: `${((counts.working + counts.waiting + counts.conflict) / total) * 100}%` }} />
        </div>
        <div className="emu-dashboard-occupancy-list">
          {top.length === 0 ? <EmptyCardText>Избранные сотрудники пока не настроены.</EmptyCardText> : null}
          {top.map((employee) => (
            <button key={employee.employeeId} onClick={() => onOpenEmployee(employee.employeeId)} type="button">
              <strong>{employee.fullName}</strong>
              <span>{employee.sectionNames.join(", ") || employee.department || "Участок не указан"}</span>
              <span>{employee.workNumbers.join(", ") || statusLabel(employee.status)}</span>
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function SectionRisks({ items, onOpenSection }: { items: SectionRisk[]; onOpenSection: (sectionName: string) => void }) {
  return (
    <article className="emu-dashboard-card">
      <header>
        <div>
          <h3>Проблемные участки</h3>
          <span>Паузы, активные и завершенные работы</span>
        </div>
      </header>
      <div className="emu-dashboard-section-risks">
        {items.length === 0 ? <EmptyCardText>Нет данных по участкам.</EmptyCardText> : null}
        {items.map((item) => (
          <button key={item.sectionName} onClick={() => onOpenSection(item.sectionName)} type="button">
            <div>
              <strong>{item.sectionName}</strong>
              <span>{item.active} активных, {item.completedToday} завершено сегодня</span>
            </div>
            <div>
              <b>{formatMinutes(item.waitingMinutes)}</b>
              <span>{item.waiting} пауз</span>
            </div>
          </button>
        ))}
      </div>
    </article>
  );
}

function DashboardDrilldownModal({
  activeWork,
  allWork,
  drilldown,
  employeeWorkload,
  onClose,
  onOpenAccounting,
  onOpenHistory,
}: {
  activeWork: EmuWorkSessionDto[];
  allWork: EmuWorkSessionDto[];
  drilldown: Exclude<DashboardDrilldown, null>;
  employeeWorkload: EmuEmployeeWorkload[];
  onClose: () => void;
  onOpenAccounting: () => void;
  onOpenHistory: () => void;
}) {
  const isEmployee = drilldown.kind === "employee";
  const employee = isEmployee ? employeeWorkload.find((item) => item.employeeId === drilldown.employeeId) : undefined;
  const sectionName = isEmployee ? "" : drilldown.sectionName;
  const relevantWorks = isEmployee
    ? allWork.filter((work) => work.employees.some((participant) => participant.employeeId === drilldown.employeeId))
    : allWork.filter((work) => sectionLabel(work) === sectionName);
  const relevantActive = isEmployee
    ? activeWork.filter((work) => work.employees.some((participant) => participant.employeeId === drilldown.employeeId && !participant.finishedAt))
    : activeWork.filter((work) => sectionLabel(work) === sectionName);
  const completed = relevantWorks.filter((work) => work.completedAt);
  const pauseMinutes = relevantWorks.reduce((sum, work) => sum + participantPauseMinutes(work, isEmployee ? drilldown.employeeId : null), 0);
  const workMinutes = relevantWorks.reduce((sum, work) => sum + participantWorkMinutes(work, isEmployee ? drilldown.employeeId : null), 0);
  const employees = collectWorkEmployees(relevantWorks);
  const title = isEmployee ? employee?.fullName || "Сотрудник" : sectionName || "Участок";
  const subtitle = isEmployee
    ? [employee?.position, employee?.department].filter(Boolean).join(" · ") || "Сотрудник ЭМУ"
    : `${employees.length} сотрудников, ${relevantWorks.length} работ за период`;
  const recentWorks = [...relevantWorks]
    .sort((a, b) => new Date(b.completedAt || b.updatedAt || b.createdAt).getTime() - new Date(a.completedAt || a.updatedAt || a.createdAt).getTime())
    .slice(0, 6);

  return (
    <div className="emu-modal-backdrop" onMouseDown={onClose} role="presentation">
      <section aria-modal="true" className="emu-modal emu-modal-wide emu-dashboard-drilldown" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header>
          <div className="emu-dashboard-drilldown-title">
            <span>{isEmployee ? employeeInitials(title) : "УЧ"}</span>
            <div>
              <h3>{isEmployee ? "Карточка сотрудника" : "Карточка участка"}</h3>
              <p>{title}</p>
              <small>{subtitle}</small>
            </div>
          </div>
          <button aria-label="Закрыть" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </header>

        <div className="emu-dashboard-drilldown-body">
          <section className="emu-dashboard-drilldown-kpis">
            <DashboardDetailKpi label="Активных" value={relevantActive.length} />
            <DashboardDetailKpi label="Завершено" value={completed.length} />
            <DashboardDetailKpi label="Работа" value={formatMinutes(workMinutes)} />
            <DashboardDetailKpi label="Паузы" value={formatMinutes(pauseMinutes)} />
          </section>

          <section className="emu-dashboard-drilldown-grid">
            <article>
              <h4>{isEmployee ? "Работы сотрудника" : "Последние работы участка"}</h4>
              <div className="emu-dashboard-drilldown-list">
                {recentWorks.length === 0 ? <EmptyCardText>Работ по выбранному объекту пока нет.</EmptyCardText> : null}
                {recentWorks.map((work) => {
                  const status = getWorkStatus(work);
                  return (
                    <div key={work.id}>
                      <div>
                        <strong>{work.workNumber}</strong>
                        <span>{sectionLabel(work)}</span>
                      </div>
                      <p>{work.taskDescription || "Без описания"}</p>
                      <span className={`emu-dashboard-status status-${status.kind}`}>{status.label}</span>
                      <b>{formatMinutes(participantWorkMinutes(work, isEmployee ? drilldown.employeeId : null))}</b>
                    </div>
                  );
                })}
              </div>
            </article>

            <article>
              <h4>{isEmployee ? "Участки и статусы" : "Сотрудники участка"}</h4>
              {isEmployee ? (
                <div className="emu-dashboard-drilldown-tags">
                  {(employee?.sectionNames.length ? employee.sectionNames : ["Участок не указан"]).map((name) => (
                    <span key={name}>{name}</span>
                  ))}
                  <span>{employee ? statusLabel(employee.status) : "Статус не указан"}</span>
                </div>
              ) : (
                <div className="emu-dashboard-drilldown-people">
                  {employees.length === 0 ? <EmptyCardText>Сотрудники по участку пока не найдены.</EmptyCardText> : null}
                  {employees.slice(0, 10).map((person) => (
                    <div key={person.employeeId}>
                      <strong>{person.fullName}</strong>
                      <span>{formatMinutes(person.workMinutes)} работы · {formatMinutes(person.pauseMinutes)} пауз</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>
        </div>

        <footer className="emu-modal-actions">
          <button className="emu-secondary-button" onClick={onOpenHistory} type="button">
            <BarChart3 size={17} />
            Открыть историю
          </button>
          <button className="emu-primary-button" onClick={onOpenAccounting} type="button">
            <ChevronRight size={17} />
            Перейти в учет работ
          </button>
        </footer>
      </section>
    </div>
  );
}

function DashboardDetailKpi({ label, value }: { label: string; value: string | number }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ActiveWorks({ items, onOpenAll }: { items: EmuWorkSessionDto[]; onOpenAll: () => void }) {
  return (
    <article className="emu-dashboard-card">
      <header>
        <div>
          <h3>Активные работы</h3>
          <span>Карточки в работе сейчас</span>
        </div>
        <button onClick={onOpenAll} type="button">
          Все
          <ChevronRight size={16} />
        </button>
      </header>
      <div className="emu-active-work-list">
        {items.length === 0 ? <EmptyCardText>Активных работ сейчас нет.</EmptyCardText> : null}
        {items.slice(0, 6).map((work) => {
          const status = getWorkStatus(work);
          return (
            <article key={work.id}>
              <div>
                <strong>{work.workNumber}</strong>
                <span>{text(work.sectionName) || "Участок не указан"}</span>
              </div>
              <p>{work.taskDescription || "Без описания"}</p>
              <span className={`emu-dashboard-status status-${status.kind}`}>{status.label}</span>
              <b>{formatClockDuration(work.arrivedAt, new Date())}</b>
            </article>
          );
        })}
      </div>
    </article>
  );
}

function Events({ events }: { events: EmuAuditEventDto[] }) {
  return (
    <article className="emu-dashboard-card">
      <header>
        <div>
          <h3>Последние события</h3>
          <span>Аудит работ, планов и решений</span>
        </div>
      </header>
      <div className="emu-event-list">
        {events.length === 0 ? <EmptyCardText>Событий пока нет.</EmptyCardText> : null}
        {events.slice(0, 7).map((event) => (
          <article key={event.id}>
            <Clock3 size={16} />
            <div>
              <strong>{auditTitle(event)}</strong>
              <span>{compactAuditDetail(event)}</span>
            </div>
            <time>{formatShortDateTime(event.createdAt)}</time>
          </article>
        ))}
      </div>
    </article>
  );
}

function Incidents({ incidents }: { incidents: IncidentItem[] }) {
  return (
    <article className="emu-dashboard-card">
      <header>
        <div>
          <h3>Инциденты и проблемы</h3>
          <span>Что требует внимания</span>
        </div>
      </header>
      <div className="emu-incident-list">
        {incidents.length === 0 ? <EmptyCardText>Критичных проблем сейчас нет.</EmptyCardText> : null}
        {incidents.slice(0, 6).map((incident) => (
          <article key={incident.id}>
            <span className={`emu-dashboard-severity severity-${incident.severity}`}>{severityLabel(incident.severity)}</span>
            <strong>{incident.title}</strong>
            <em>{incident.areaName}</em>
          </article>
        ))}
      </div>
    </article>
  );
}

function KeyIndicators({ stats }: { stats: QuickStats }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (stats.planPercent / 100) * circumference;

  return (
    <article className="emu-dashboard-card emu-key-indicators">
      <header>
        <div>
          <h3>Ключевые показатели</h3>
          <span>План, факт и проблемные карточки</span>
        </div>
      </header>
      <div className="emu-dashboard-donut">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" fill="none" r={radius} stroke="#e8f1ff" strokeWidth="9" />
          <circle
            cx="50"
            cy="50"
            fill="none"
            r={radius}
            stroke="#10b981"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            strokeWidth="9"
            transform="rotate(-90 50 50)"
          />
        </svg>
        <strong>{stats.planPercent}%</strong>
        <span>план-факт</span>
      </div>
      <dl>
        <div>
          <dt>Плановых задач</dt>
          <dd>{stats.planned}</dd>
        </div>
        <div>
          <dt>Завершено сегодня</dt>
          <dd>{stats.completed}</dd>
        </div>
        <div>
          <dt>В работе сейчас</dt>
          <dd>{stats.inWork}</dd>
        </div>
        <div>
          <dt>Проблем</dt>
          <dd>{stats.overdue}</dd>
        </div>
      </dl>
    </article>
  );
}

function EmptyCardText({ children }: { children: ReactNode }) {
  return <p className="emu-empty-card-text">{children}</p>;
}

function buildMetrics(active: number, completedToday: number, paused: number, attention: number, averageMinutes: number): DashboardMetric[] {
  return [
    {
      delta: active > 0 ? "есть активные карточки" : "нет активных работ",
      icon: Play,
      key: "active",
      sparkline: [1, 2, 2, 3, active, active + 1, active],
      title: "Активные работы",
      tone: "blue",
      value: active,
    },
    {
      delta: completedToday > 0 ? "за текущую дату" : "пока нет завершенных",
      icon: CheckCircle2,
      key: "completed",
      sparkline: [0, 1, 1, 2, completedToday, completedToday + 1, completedToday],
      title: "Завершено сегодня",
      tone: "green",
      value: completedToday,
    },
    {
      delta: paused > 0 ? "проверьте причины" : "пауз нет",
      icon: Pause,
      key: "paused",
      sparkline: [0, paused, Math.max(0, paused - 1), paused, paused + 1, paused, 0],
      title: "На паузе",
      tone: "orange",
      value: paused,
    },
    {
      delta: attention > 0 ? "нужно решение" : "без критики",
      icon: AlertTriangle,
      key: "attention",
      sparkline: [attention, attention, Math.max(0, attention - 1), attention, attention + 1, attention, attention],
      title: "Требуют внимания",
      tone: "red",
      value: attention,
    },
    {
      delta: averageMinutes > 0 ? "по завершенным работам" : "нет базы расчета",
      icon: Clock3,
      key: "average",
      sparkline: [averageMinutes, Math.max(0, averageMinutes - 2), averageMinutes + 3, averageMinutes, averageMinutes + 1, averageMinutes - 1, averageMinutes],
      title: "Среднее время",
      tone: "blue",
      value: formatMinutes(averageMinutes),
    },
  ];
}

function buildShiftStatus(now: Date): ShiftStatus {
  const start = new Date(now);
  const end = new Date(now);
  const hour = now.getHours();

  if (hour >= 20 || hour < 8) {
    start.setHours(20, 0, 0, 0);
    if (hour < 8) start.setDate(start.getDate() - 1);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 1);
    end.setHours(8, 0, 0, 0);
  } else if (hour >= 8 && hour < 17) {
    start.setHours(8, 0, 0, 0);
    end.setHours(17, 0, 0, 0);
  } else {
    start.setHours(8, 0, 0, 0);
    end.setHours(20, 0, 0, 0);
  }

  const total = Math.max(1, end.getTime() - start.getTime());
  const elapsedMs = Math.min(Math.max(0, now.getTime() - start.getTime()), total);
  const remainingMs = Math.max(0, end.getTime() - now.getTime());
  const percent = Math.round((elapsedMs / total) * 100);

  return {
    elapsed: formatMinutes(Math.round(elapsedMs / 60000)),
    percent,
    remaining: formatMinutes(Math.round(remainingMs / 60000)),
    shiftDate: start.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
    status: now >= start && now <= end ? "active" : "closed",
    timeRange: `${formatTime(start)} - ${formatTime(end)}`,
    title: "Статус смены",
  };
}

function buildAreaLoad(workspace: EmuWorkspace, activeWork: EmuWorkSessionDto[]): AreaLoad[] {
  const counts = new Map<string, number>();
  activeWork.forEach((work) => {
    const name = text(work.sectionName) || "Без участка";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });

  const rows = workspace.settings.sections
    .filter((section) => section.isActive)
    .map((section) => {
      const name = text(section.name);
      return { areaName: name, count: counts.get(name) ?? 0 };
    })
    .filter((area) => area.count > 0);

  const fallbackRows = Array.from(counts.entries()).map(([areaName, count]) => ({ areaName, count }));
  const result = rows.length > 0 ? rows : fallbackRows;
  const max = Math.max(...result.map((area) => area.count), 1);

  return result
    .map((area) => ({ ...area, percent: Math.max(12, Math.round((area.count / max) * 100)) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function buildSectionRisks(workspace: EmuWorkspace, activeWork: EmuWorkSessionDto[], allWork: EmuWorkSessionDto[], today: string): SectionRisk[] {
  const sectionNames = new Set<string>();
  workspace.settings.sections.forEach((section) => {
    if (section.isActive) sectionNames.add(text(section.name));
  });
  activeWork.forEach((work) => sectionNames.add(text(work.sectionName) || "Без участка"));
  allWork.forEach((work) => sectionNames.add(text(work.sectionName) || "Без участка"));

  return Array.from(sectionNames)
    .map<SectionRisk>((sectionName) => {
      const active = activeWork.filter((work) => (text(work.sectionName) || "Без участка") === sectionName);
      const completedToday = allWork.filter((work) => (text(work.sectionName) || "Без участка") === sectionName && isCompletedOnDate(work, today));
      return {
        active: active.length,
        completedToday: completedToday.length,
        sectionName,
        waiting: active.filter(hasPausedParticipant).length,
        waitingMinutes: active.reduce((sum, work) => sum + work.waitingMinutes + work.otherWorkMinutes, 0),
      };
    })
    .filter((item) => item.active > 0 || item.completedToday > 0 || item.waiting > 0)
    .sort((a, b) => b.waitingMinutes - a.waitingMinutes || b.active - a.active || b.completedToday - a.completedToday)
    .slice(0, 6);
}

function buildTrend(allWork: EmuWorkSessionDto[]): TrendPoint[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = toDateKey(date);
    const count = allWork.filter((work) => isCompletedOnDate(work, key)).length;
    return {
      date: date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
      value: count,
    };
  });
}

function buildIncidents(
  forgottenWork: EmuWorkSessionDto[],
  pausedWithoutWorking: EmuWorkSessionDto[],
  planWithoutApproval: EmuPlanTaskDto[],
  decisionsCount: number,
): IncidentItem[] {
  const items: IncidentItem[] = [];

  forgottenWork.slice(0, 3).forEach((work) => {
    items.push({
      areaName: text(work.sectionName) || "Участок не указан",
      id: `forgotten-${work.id}`,
      severity: "high",
      title: `${work.workNumber}: забытая работа`,
    });
  });

  pausedWithoutWorking.slice(0, 3).forEach((work) => {
    items.push({
      areaName: text(work.sectionName) || "Участок не указан",
      id: `paused-${work.id}`,
      severity: "medium",
      title: `${work.workNumber}: все сотрудники на паузе`,
    });
  });

  planWithoutApproval.slice(0, 3).forEach((task) => {
    items.push({
      areaName: text(task.sectionName) || "План ЭМУ",
      id: `plan-${task.id}`,
      severity: "medium",
      title: `${task.title}: не согласовано`,
    });
  });

  if (decisionsCount > 0) {
    items.push({
      areaName: "Учет работ",
      id: "decisions",
      severity: "high",
      title: `${decisionsCount} спорных ситуаций требуют решения`,
    });
  }

  return items;
}

function buildQuickStats(workspace: EmuWorkspace, active: number, completedToday: number, overdue: number): QuickStats {
  const planned = workspace.planTasks.filter((task) => text(task.status) === "Запланировано").length;
  const completedPlan = workspace.planTasks.filter((task) => text(task.status) === "Выполнено").length;
  const planPercent = planned + completedPlan > 0 ? Math.round((completedPlan / (planned + completedPlan)) * 100) : completedToday > 0 ? 100 : 0;
  return {
    completed: completedToday,
    inWork: active,
    overdue,
    planPercent,
    planned,
  };
}

function getWorkStatus(work: EmuWorkSessionDto): { kind: WorkStatusKind; label: string } {
  if (work.deletedAt) return { kind: "attention", label: "Удалено" };
  if (work.completedAt || text(work.operationalStatus) === "Завершено") return { kind: "completed", label: "Завершено" };
  if (hasPausedParticipant(work)) return { kind: "paused", label: "На паузе" };
  return { kind: "inWork", label: "В работе" };
}

function sectionLabel(work: EmuWorkSessionDto) {
  return text(work.sectionName) || "Участок не указан";
}

function participantWorkMinutes(work: EmuWorkSessionDto, employeeId: string | null) {
  if (!employeeId) return work.workMinutes;
  const employee = work.employees.find((participant) => participant.employeeId === employeeId);
  return employee?.personalWorkMinutes ?? employee?.workMinutes ?? 0;
}

function participantPauseMinutes(work: EmuWorkSessionDto, employeeId: string | null) {
  if (!employeeId) return work.waitingMinutes + work.otherWorkMinutes;
  const employee = work.employees.find((participant) => participant.employeeId === employeeId);
  return employee?.personalPauseMinutes ?? employee?.waitingMinutes ?? 0;
}

function collectWorkEmployees(works: EmuWorkSessionDto[]) {
  const byEmployee = new Map<string, { employeeId: string; fullName: string; pauseMinutes: number; workMinutes: number }>();

  works.forEach((work) => {
    work.employees.forEach((employee) => {
      if (isEmployeeMistaken(employee)) return;
      const item = byEmployee.get(employee.employeeId) ?? {
        employeeId: employee.employeeId,
        fullName: employee.fullNameSnapshot || "Сотрудник",
        pauseMinutes: 0,
        workMinutes: 0,
      };
      item.workMinutes += employee.personalWorkMinutes ?? employee.workMinutes ?? 0;
      item.pauseMinutes += employee.personalPauseMinutes ?? employee.waitingMinutes ?? 0;
      byEmployee.set(employee.employeeId, item);
    });
  });

  return Array.from(byEmployee.values()).sort((a, b) => b.workMinutes - a.workMinutes || a.fullName.localeCompare(b.fullName, "ru"));
}

function employeeInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "С";
  const second = parts[1]?.[0] ?? "";
  return `${first}${second}`.toUpperCase();
}

function hasWorkingParticipant(work: EmuWorkSessionDto) {
  return work.employees.some(isEmployeeWorking);
}

function hasPausedParticipant(work: EmuWorkSessionDto) {
  return work.employees.some(isEmployeePaused);
}

function hasActiveParticipant(work: EmuWorkSessionDto) {
  return work.employees.some((employee) => !employee.finishedAt && !isEmployeeMistaken(employee));
}

function isEmployeeWorking(employee: EmuWorkSessionEmployeeDto) {
  const status = text(employee.participationStatus || employee.status);
  return !employee.finishedAt && (status === "Работает" || status === "В работе");
}

function isEmployeePaused(employee: EmuWorkSessionEmployeeDto) {
  const status = text(employee.participationStatus || employee.status);
  return !employee.finishedAt && !isEmployeeMistaken(employee) && (status === "На паузе" || status === "В ожидании" || status === "На другой работе");
}

function isEmployeeMistaken(employee: EmuWorkSessionEmployeeDto) {
  return text(employee.participationStatus || employee.status) === "Добавлен ошибочно";
}

function isUnapprovedPlannedTask(task: EmuPlanTaskDto) {
  return text(task.status) === "Запланировано" && text(task.approvalStatus) !== "Согласовано";
}

function averageCompletedMinutes(allWork: EmuWorkSessionDto[]) {
  const completed = allWork.filter((work) => work.completedAt && totalMinutes(work) > 0);
  if (completed.length === 0) return 0;
  return Math.round(completed.reduce((sum, work) => sum + totalMinutes(work), 0) / completed.length);
}

function isCompletedOnDate(work: EmuWorkSessionDto, dateKey: string) {
  return Boolean(work.completedAt && toDateKey(new Date(work.completedAt)) === dateKey);
}

function totalMinutes(work: EmuWorkSessionDto) {
  return work.workMinutes + work.waitingMinutes + work.otherWorkMinutes;
}

function formatMinutes(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours === 0) return `${rest} мин`;
  if (rest === 0) return `${hours} ч`;
  return `${hours} ч ${rest} мин`;
}

function formatClockDuration(startedAt: string, now: Date) {
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return "00:00";
  const minutes = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function formatShortDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit" });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function statusLabel(status: EmuEmployeeWorkload["status"]) {
  if (status === "working") return "В работе";
  if (status === "waiting") return "На паузе";
  if (status === "conflict") return "Конфликт";
  return "Свободен";
}

function severityLabel(severity: IncidentSeverity) {
  if (severity === "high") return "Высокий";
  if (severity === "medium") return "Средний";
  return "Низкий";
}

function auditTitle(event: EmuAuditEventDto) {
  const labels: Record<string, string> = {
    arrived_at_changed: "Скорректировано время прихода",
    completed: "Работа завершена",
    completed_at_changed: "Скорректировано время окончания",
    created: "Работа создана",
    decision_resolved: "Решение закрыто",
    deleted: "Работа удалена",
    employee_added: "Сотрудник добавлен",
    employee_finished: "Участие завершено",
    employee_mistaken: "Сотрудник добавлен ошибочно",
    paused: "Пауза",
    plan_rescheduled: "План перенесен",
    plan_started: "Плановая задача в работе",
    resumed: "Работа продолжена",
    shift_adjusted: "Смена скорректирована",
    work_date_changed: "Скорректирована дата работы",
    updated: "Карточка изменена",
  };
  return labels[event.eventType] ?? text(event.eventType) ?? "Событие";
}

function compactAuditDetail(event: EmuAuditEventDto) {
  const comment = text(event.comment).trim();
  if (comment) return truncate(comment, 92);
  const from = text(event.fromStatus).trim();
  const to = text(event.toStatus).trim();
  if (from || to) return `${from || "—"} → ${to || "—"}`;
  return event.actor ? `Оператор: ${event.actor}` : "Действие записано";
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
