import type { ScreenId } from "../../../types";
import { Panel } from "../../../shared/ui";
import { DashboardReadinessPanel, type DashboardReadinessItem } from "./DashboardReadinessPanel";

interface DashboardCommandPanelProps {
  readinessItems: DashboardReadinessItem[];
  onCreateRequest: () => void;
  onNavigate: (screen: ScreenId) => void;
}

export function DashboardCommandPanel({
  readinessItems,
  onCreateRequest,
  onNavigate,
}: DashboardCommandPanelProps) {
  return (
    <div className="dashboard-command-grid">
      <Panel className="dashboard-shift-panel">
        <div className="shift-command-copy">
          <span className="command-kicker">Операционный старт</span>
          <h2>Дашборд готов к работе, данные еще не подключены</h2>
          <p>
            Экран показывает структуру смены без фальшивых записей. Начните с маршрутов, сотрудников и назначений,
            затем сюда подтянутся живые обходы и результаты.
          </p>
          <div className="command-step-grid">
            <button onClick={() => onNavigate("routes")} type="button">
              <span>1</span>
              <strong>Маршруты и точки</strong>
              <small>NFC/QR, порядок точек, требования к фото</small>
            </button>
            <button onClick={() => onNavigate("employees")} type="button">
              <span>2</span>
              <strong>Сотрудники</strong>
              <small>Справочник, смены и мобильный доступ</small>
            </button>
            <button onClick={() => onNavigate("assign")} type="button">
              <span>3</span>
              <strong>Первый обход</strong>
              <small>Сотрудник, маршрут, дата и уведомление</small>
            </button>
          </div>
        </div>
        <div className="command-actions">
          <button className="button primary" onClick={() => onNavigate("assign")} type="button">
            Назначить обход
          </button>
          <button className="button ghost" onClick={() => onNavigate("routes")} type="button">
            Настроить маршруты
          </button>
          <button className="button ghost" onClick={onCreateRequest} type="button">
            Создать заявку
          </button>
        </div>
      </Panel>

      <DashboardReadinessPanel items={readinessItems} onNavigate={onNavigate} />
    </div>
  );
}
