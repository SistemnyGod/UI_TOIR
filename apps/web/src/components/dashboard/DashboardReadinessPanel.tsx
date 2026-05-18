import type { ScreenId } from "../../types";
import { Panel } from "../ui";

export interface DashboardReadinessItem {
  label: string;
  count: number;
  action: string;
  screen: ScreenId;
}

export function DashboardReadinessPanel({
  items,
  onNavigate,
}: {
  items: DashboardReadinessItem[];
  onNavigate: (screen: ScreenId) => void;
}) {
  return (
    <Panel title="Готовность данных" note="Что нужно заполнить до реального мониторинга">
      <div className="readiness-list">
        {items.map((item) => (
          <button className="readiness-row" key={item.label} onClick={() => onNavigate(item.screen)} type="button">
            <span className={item.count > 0 ? "readiness-dot ready" : "readiness-dot"} />
            <div>
              <strong>{item.label}</strong>
              <small>{item.count > 0 ? `${item.count} записей` : "нет записей"}</small>
            </div>
            <em>{item.action}</em>
          </button>
        ))}
      </div>
    </Panel>
  );
}
