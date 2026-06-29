import { Chip, EmptyState } from "../../../../shared/ui";
import type { DataSourceStatus, Employee, RouteOption, ScreenId, ServiceRequest } from "../../../../types";

interface AssignmentDraftDrawerProps {
  canManage?: boolean;
  employee?: Employee;
  fieldErrors?: Record<string, string[]>;
  route?: RouteOption;
  hasConflict: boolean;
  isCreating?: boolean;
  onAssign: () => void | Promise<void>;
  onNavigate: (screen: ScreenId) => void;
  onNotify: (message: string) => void;
  onPlannedAtChange: (value: string) => void;
  onSelectRequest: (id: string) => void;
  onShiftChange: (value: string) => void;
  plannedAt: string;
  requestListStatus: DataSourceStatus;
  requests: ServiceRequest[];
  selectedRequestId: string;
  shift: string;
}

export function AssignmentDraftDrawer({
  canManage = true,
  employee,
  fieldErrors = {},
  route,
  hasConflict,
  isCreating = false,
  onAssign,
  onNavigate,
  onNotify,
  onPlannedAtChange,
  onSelectRequest,
  onShiftChange,
  plannedAt,
  requestListStatus,
  requests,
  selectedRequestId,
  shift,
}: AssignmentDraftDrawerProps) {
  const selectedRequest = requests.find((request) => request.id === selectedRequestId);
  const hasSelection = Boolean(employee && route);
  const canSubmit =
    canManage &&
    hasSelection &&
    Boolean(selectedRequestId) &&
    Boolean(plannedAt) &&
    requestListStatus !== "error" &&
    !isCreating;

  return (
    <aside className="side-drawer assign-drawer">
      <div className="drawer-title">
        <div>
          <h2>Назначить сотрудника</h2>
          <p>Черновик назначения применяется сразу через backend API</p>
        </div>
      </div>
      {!hasSelection ? (
        <EmptyState
          title="Выберите сотрудника и маршрут"
          description="После выбора здесь появятся заявка, смена, дата, проверка конфликтов и кнопка отправки."
          action={
            <button className="button ghost" onClick={() => onNavigate("routes")} type="button">
              Проверить маршруты
            </button>
          }
        />
      ) : (
        <>
          <h3>Заявка для назначения</h3>
          <div className="form-stack">
            <label>
              Заявка
              <select value={selectedRequestId} onChange={(event) => onSelectRequest(event.currentTarget.value)}>
                <option value="">Выберите заявку</option>
                {requests.map((request) => (
                  <option key={request.id} value={request.id}>
                    {request.title} / {request.employee} / {request.route}
                  </option>
                ))}
              </select>
              {fieldErrors.patrolRequestId ? <span className="field-error">{fieldErrors.patrolRequestId[0]}</span> : null}
            </label>
            {requestListStatus === "error" ? (
              <div className="notice danger-soft">
                <strong>Заявки API не загружены</strong>
                <span>Создание назначения недоступно, потому что patrolRequestId обязателен.</span>
              </div>
            ) : null}
            {selectedRequest ? (
              <div className="notice info-soft">
                <strong>{selectedRequest.title}</strong>
                <span>{selectedRequest.description || selectedRequest.notificationText}</span>
              </div>
            ) : null}
          </div>
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
          {fieldErrors.employeeId ? <span className="field-error">{fieldErrors.employeeId[0]}</span> : null}
          <h3>Выбранный маршрут</h3>
          <div className="summary-card route-summary">
            <div>
              <strong>{route!.name}</strong>
              <span>{route!.zone}</span>
              <em>{route!.duration} / {route!.distance} / {route!.points} точек</em>
            </div>
            <Chip>{route!.priority}</Chip>
          </div>
          {fieldErrors.routeId ? <span className="field-error">{fieldErrors.routeId[0]}</span> : null}
          <div className="form-stack">
            <label>
              Смена
              <select value={shift} onChange={(event) => onShiftChange(event.currentTarget.value)}>
                <option>День</option>
                <option>Ночь</option>
              </select>
              {fieldErrors.shift ? <span className="field-error">{fieldErrors.shift[0]}</span> : null}
            </label>
            <label>
              Дата и время начала
              <input
                onChange={(event) => onPlannedAtChange(event.currentTarget.value)}
                type="datetime-local"
                value={plannedAt}
              />
              {fieldErrors.plannedAt ? <span className="field-error">{fieldErrors.plannedAt[0]}</span> : null}
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
            <button className="button primary" disabled={!canSubmit} onClick={() => void onAssign()} type="button">
              {isCreating ? "Назначаем..." : "Назначить сейчас"}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
