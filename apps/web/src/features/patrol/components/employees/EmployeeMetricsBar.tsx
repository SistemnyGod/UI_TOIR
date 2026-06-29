import { Panel } from "../../../../shared/ui";
import type { EmployeeMetrics } from "../../../../repositories/employeesRepository";

export function EmployeeMetricsBar({ metrics }: { metrics: EmployeeMetrics }) {
  return (
    <div className="metric-grid compact">
      <Panel className="metric-panel">
        <strong>{metrics.total}</strong>
        <span>Всего сотрудников</span>
        <small>в справочнике</small>
      </Panel>
      <Panel className="metric-panel success">
        <strong>{metrics.active}</strong>
        <span>Активные</span>
        <small>доступны для назначений</small>
      </Panel>
      <Panel className="metric-panel warning">
        <strong>{metrics.onShift}</strong>
        <span>На смене сейчас</span>
        <small>по загруженным данным</small>
      </Panel>
      <Panel className="metric-panel">
        <strong>{metrics.mobileBound}</strong>
        <span>С мобильным входом</span>
        <small>привязаны к аккаунтам</small>
      </Panel>
    </div>
  );
}
