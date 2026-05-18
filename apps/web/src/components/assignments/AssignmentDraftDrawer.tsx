import { Chip, EmptyState } from "../ui";
import type { Employee, RouteOption, ScreenId } from "../../types";

interface AssignmentDraftDrawerProps {
  employee?: Employee;
  route?: RouteOption;
  hasConflict: boolean;
  onAssign: () => void;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
}

export function AssignmentDraftDrawer({
  employee,
  route,
  hasConflict,
  onAssign,
  onNavigate,
  onNotify,
}: AssignmentDraftDrawerProps) {
  const hasSelection = Boolean(employee && route);

  return (
    <aside className="side-drawer assign-drawer">
      <div className="drawer-title">
        <div>
          <h2>Назначить сотрудника</h2>
          <p>Черновик назначения применяется сразу</p>
        </div>
      </div>
      {!hasSelection ? (
        <EmptyState
          title="Выберите сотрудника и маршрут"
          description="После выбора здесь появятся параметры назначения, проверка конфликтов и кнопка отправки."
          action={
            <button className="button ghost" onClick={() => onNavigate("routes")} type="button">
              Проверить маршруты
            </button>
          }
        />
      ) : (
        <>
          <h3>Выбранный сотрудник</h3>
          <div className="summary-card">
            <div className="avatar">{employee!.name.slice(0, 2)}</div>
            <div>
              <strong>{employee!.name}</strong>
              <span>{employee!.role} / {employee!.zone}</span>
              <em>Активность: {employee!.activity}</em>
            </div>
            <Chip>{employee!.status}</Chip>
          </div>
          <h3>Выбранный маршрут</h3>
          <div className="summary-card route-summary">
            <div>
              <strong>{route!.name}</strong>
              <span>{route!.zone}</span>
              <em>{route!.duration} / {route!.distance} / {route!.points} точек</em>
            </div>
            <Chip>{route!.priority}</Chip>
          </div>
          <div className="form-stack">
            <label>
              Смена
              <select defaultValue={employee!.shift}>
                <option>День</option>
                <option>Ночь</option>
              </select>
            </label>
            <label>
              Дата и время начала
              <input placeholder="Сейчас или выбранное время" />
            </label>
            <label>
              Примечание
              <textarea maxLength={200} placeholder="Введите примечание для назначения" />
            </label>
          </div>
          {hasConflict ? (
            <div className="notice danger-soft">
              <strong>Есть конфликт назначения</strong>
              <span>Проверьте загрузку маршрута и статус сотрудника перед отправкой.</span>
            </div>
          ) : (
            <div className="notice success-soft">
              <strong>Конфликтов нет</strong>
              <span>Назначение можно отправлять в мобильное приложение.</span>
            </div>
          )}
          <div className="drawer-actions">
            <button className="button ghost danger-outline" onClick={() => onNotify("Черновик назначения очищен")} type="button">
              Отменить
            </button>
            <button className="button primary" onClick={onAssign} type="button">
              Назначить сейчас
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
