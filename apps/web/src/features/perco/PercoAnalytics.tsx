import { useMemo } from "react";
import { ChartNoAxesCombined, ChevronDown } from "lucide-react";
import type { PercoDiagnosticsDto } from "../../api/contracts";
import { buildDurationBuckets, buildHourlyFlow, buildPercoQuality, buildPresenceAnalytics, DurationBars, PercoFlowChart, PresenceRatio } from "./percoScreenSupport";

/** One analytics view for the overview and diagnostics; lists stay above the fold. */
export function PercoAnalytics({ diagnostics }: { diagnostics: PercoDiagnosticsDto }) {
  const analytics = useMemo(() => buildPresenceAnalytics(diagnostics), [diagnostics]);
  const flow = useMemo(() => buildHourlyFlow(diagnostics.recentEvents), [diagnostics.recentEvents]);
  const durations = useMemo(() => buildDurationBuckets(diagnostics.presenceIntervals), [diagnostics.presenceIntervals]);
  const quality = useMemo(() => buildPercoQuality(diagnostics, analytics), [diagnostics, analytics]);
  const employeesToReview = analytics.employees.filter(employee => employee.state === "stale").length;
  return <details className="perco-analytics-disclosure">
    <summary><ChartNoAxesCombined size={20} aria-hidden="true" /><span>Графики и качество данных<small>Динамика проходов, присутствие и длительность интервалов</small></span><ChevronDown size={18} aria-hidden="true" /></summary>
    <div className="perco-live-analytics-grid">
      <section className="perco-analytics-panel perco-flow-panel"><div className="perco-analytics-head"><div><h3>Входы и выходы по часам</h3><span>По загруженным событиям</span></div><b>{diagnostics.recentEvents.length} в выборке</b></div><PercoFlowChart points={flow} /></section>
      <section className="perco-analytics-panel"><div className="perco-analytics-head"><h3>Присутствие</h3></div><PresenceRatio inside={analytics.insideCount} outside={analytics.outsideCount} stale={employeesToReview} /></section>
      <section className="perco-analytics-panel"><div className="perco-analytics-head"><h3>Длительность интервалов</h3></div><DurationBars buckets={durations} /></section>
      <section className="perco-analytics-panel"><div className="perco-analytics-head"><h3>Качество данных</h3></div><div className="perco-quality-list">{quality.map(item => <article className={`tone-${item.tone}`} key={item.label}><strong>{item.value}</strong><span>{item.label}</span></article>)}</div></section>
    </div>
  </details>;
}
