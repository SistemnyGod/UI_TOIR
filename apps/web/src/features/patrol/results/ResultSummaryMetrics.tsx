import { AlertTriangle, Camera, CheckCircle2, FileText, type LucideIcon } from "lucide-react";
import { PhoneDisclosure } from "../../../shared/ui/PhoneDisclosure";

export function ResultSummaryMetrics({ metrics, caption }: { metrics: { total: number; issues: number; withPhotos: number; clean: number }; caption: string }) {
  return (
      <PhoneDisclosure title={`Сводка · ${metrics.total}`} collapsibleOnDesktop>
      <section className="results-review-metrics" aria-label="Сводка результатов обходов">
        <MetricCard icon={FileText} title="Всего обходов" value={metrics.total} caption={caption} />
        <MetricCard icon={AlertTriangle} title="С замечаниями" value={metrics.issues} caption={caption} tone="orange" />
        <MetricCard icon={Camera} title="С медиа" value={metrics.withPhotos} caption={caption} />
        <MetricCard icon={CheckCircle2} title="Без замечаний" value={metrics.clean} caption={caption} tone="green" />
      </section>
      </PhoneDisclosure>
  );
}

function MetricCard({
  caption,
  icon: Icon,
  title,
  tone = "blue",
  value,
}: {
  caption: string;
  icon: LucideIcon;
  title: string;
  tone?: "blue" | "green" | "orange";
  value: string | number;
}) {
  return (
    <article className={`results-review-metric tone-${tone}`}>
      <span className="results-review-metric-icon">
        <Icon size={20} />
      </span>
      <div>
        <small>{title}</small>
        <strong>{value}</strong>
        <p>{caption}</p>
      </div>
    </article>
  );
}

