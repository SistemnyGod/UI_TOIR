import type { Metric } from "../../types";
import { StatTile } from "../ui";

export function DashboardMetricsBar({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="metric-grid dashboard-metrics">
      {metrics.map((metric) => (
        <StatTile
          key={metric.label}
          icon={metric.icon}
          label={metric.label}
          value={metric.value}
          hint={metric.delta}
          tone={metric.tone}
        />
      ))}
    </div>
  );
}
