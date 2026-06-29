import { AlertTriangle, BarChart3, CalendarDays, CheckCircle2, Clock3 } from "lucide-react";
import type { ReactNode } from "react";

type EmuHistoryKpiStripProps = {
  averageWork: string;
  completedPercent: number;
  completedWorks: number;
  pauseTime: string;
  problemWorks: number;
  totalTime: string;
  totalWorks: number;
};

export function EmuHistoryKpiStrip({
  averageWork,
  completedPercent,
  completedWorks,
  pauseTime,
  problemWorks,
  totalTime,
  totalWorks,
}: EmuHistoryKpiStripProps) {
  return (
    <section className="emu-history-kpi-grid">
      <HistoryMetric icon={<CalendarDays size={20} />} label="Всего работ" sublabel="за выбранный период" value={totalWorks} />
      <HistoryMetric icon={<CheckCircle2 size={20} />} label="Выполнено" sublabel={`${completedPercent}%`} tone="green" value={completedWorks} />
      <HistoryMetric icon={<Clock3 size={20} />} label="Трудозатраты" sublabel="по сотрудникам" tone="blue" value={totalTime} />
      <HistoryMetric icon={<Clock3 size={20} />} label="Время пауз" sublabel="ожидание и прочее" tone="orange" value={pauseTime} />
      <HistoryMetric icon={<BarChart3 size={20} />} label="Среднее на работу" sublabel="по выборке" tone="cyan" value={averageWork} />
      <HistoryMetric icon={<AlertTriangle size={20} />} label="Проблемные" sublabel="требуют проверки" tone="red" value={problemWorks} />
    </section>
  );
}

function HistoryMetric({ icon, label, sublabel, tone = "blue", value }: { icon: ReactNode; label: string; sublabel: string; tone?: string; value: ReactNode }) {
  return (
    <article className={`emu-history-kpi tone-${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{sublabel}</em>
      </div>
    </article>
  );
}
