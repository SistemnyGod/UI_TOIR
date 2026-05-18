import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CreateServiceRequestPayload, EmployeeDirectoryItem, PatrolResult, RouteDirectoryItem } from "../../types";
import { Chip } from "../ui";
import { buildNotificationText, getDateInputValue } from "./requestModalUtils";

export function RequestCreateModal({
  sourceResult,
  employeeOptions,
  routeOptions,
  onClose,
  onDirtyChange,
  onSubmitCreate,
}: {
  sourceResult?: PatrolResult;
  employeeOptions: EmployeeDirectoryItem[];
  routeOptions: RouteDirectoryItem[];
  onClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
  onSubmitCreate: (payload: CreateServiceRequestPayload) => void | Promise<void>;
}) {
  const [employee, setEmployee] = useState(sourceResult?.employee ?? employeeOptions[0]?.fullName ?? "");
  const [route, setRoute] = useState(sourceResult?.route ?? routeOptions[0]?.name ?? "");
  const [scheduledDate, setScheduledDate] = useState(getDateInputValue(new Date()));
  const [scheduledTime, setScheduledTime] = useState("");
  const [description, setDescription] = useState(
    sourceResult ? `Повторно проверить точку ${sourceResult.point}. Комментарий результата: ${sourceResult.comment}` : "",
  );
  const [notifyEmployee, setNotifyEmployee] = useState(true);
  const [notificationEdited, setNotificationEdited] = useState(false);
  const defaultNotificationText = useMemo(
    () => buildNotificationText({ employee, route, scheduledDate, scheduledTime }),
    [employee, route, scheduledDate, scheduledTime],
  );
  const [notificationText, setNotificationText] = useState(defaultNotificationText);

  function markDirty() {
    onDirtyChange(true);
  }

  useEffect(() => {
    if (!notificationEdited) {
      setNotificationText(defaultNotificationText);
    }
  }, [defaultNotificationText, notificationEdited]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmployee = employee.trim();
    const normalizedRoute = route.trim();

    if (!normalizedEmployee || !normalizedRoute) {
      return;
    }

    onSubmitCreate({
      employee: normalizedEmployee,
      route: normalizedRoute,
      scheduledDate,
      scheduledTime,
      notifyEmployee,
      notificationText: notifyEmployee ? notificationText.trim() || defaultNotificationText : "",
      description: description.trim() || "Заявка на проведение обхода территории.",
    });
  }

  return (
    <form
      aria-label="Создание заявки на обход"
      aria-modal="true"
      className="modal-window request-modal request-create-modal"
      onMouseDown={(event) => event.stopPropagation()}
      onSubmit={submit}
      role="dialog"
    >
      <div className="modal-head">
        <div>
          <span className="modal-kicker">Новая заявка</span>
          <h2>Заявка на проведение обхода</h2>
          <p>Выберите дату, сотрудника и маршрут. Время прохождения можно не указывать.</p>
        </div>
        <button aria-label="Закрыть" className="modal-close" onClick={onClose} type="button">
          ×
        </button>
      </div>

      {sourceResult ? (
        <div className="source-card">
          <div>
            <strong>Основание: {sourceResult.point}</strong>
            <span>
              {sourceResult.route} · {sourceResult.employee}
            </span>
          </div>
          <Chip>{sourceResult.status}</Chip>
        </div>
      ) : null}

      <div className="form-grid two request-form-grid">
        <label>
          Дата обхода
          <input
            name="scheduledDate"
            onChange={(event) => {
              markDirty();
              setScheduledDate(event.currentTarget.value);
            }}
            required
            type="date"
            value={scheduledDate}
          />
        </label>
        <label>
          Время прохождения
          <input
            name="scheduledTime"
            onChange={(event) => {
              markDirty();
              setScheduledTime(event.currentTarget.value);
            }}
            type="time"
            value={scheduledTime}
          />
          <span className="field-help">Необязательно</span>
        </label>
        <label>
          Сотрудник
          <input
            autoComplete="off"
            list="request-employee-options"
            name="employee"
            onChange={(event) => {
              markDirty();
              setEmployee(event.currentTarget.value);
            }}
            placeholder="Введите или выберите ФИО"
            required
            value={employee}
          />
          <datalist id="request-employee-options">
            {employeeOptions.map((item) => (
              <option key={item.id} value={item.fullName} />
            ))}
          </datalist>
        </label>
        <label>
          Маршрут обхода
          <input
            autoComplete="off"
            list="request-route-options"
            name="route"
            onChange={(event) => {
              markDirty();
              setRoute(event.currentTarget.value);
            }}
            placeholder="Введите или выберите маршрут"
            required
            value={route}
          />
          <datalist id="request-route-options">
            {routeOptions.map((item) => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>
        </label>
        <label className="full-label">
          Комментарий к заявке
          <textarea
            name="description"
            onChange={(event) => {
              markDirty();
              setDescription(event.currentTarget.value);
            }}
            placeholder="Например: проверить внешний периметр и зафиксировать состояние ворот"
            value={description}
          />
        </label>
      </div>

      <label className="notify-card">
        <input
          checked={notifyEmployee}
          name="notifyEmployee"
          onChange={(event) => {
            markDirty();
            setNotifyEmployee(event.currentTarget.checked);
          }}
          type="checkbox"
        />
        <span>
          <strong>Уведомить сотрудника</strong>
          <small>Подготовить сообщение о необходимости пройти обход.</small>
        </span>
      </label>

      {notifyEmployee ? (
        <label className="notification-message">
          Текст уведомления
          <textarea
            name="notificationText"
            onChange={(event) => {
              markDirty();
              setNotificationEdited(true);
              setNotificationText(event.currentTarget.value);
            }}
            value={notificationText}
          />
        </label>
      ) : null}

      <div className="notice info-soft">
        <strong>Логика заявки</strong>
        <span>
          После подключения backend эта форма будет создавать назначение обхода и отправлять уведомление выбранному
          сотруднику через мобильный контур.
        </span>
      </div>

      <div className="modal-actions">
        <button className="button ghost" onClick={onClose} type="button">
          Отмена
        </button>
        <button className="button primary" type="submit">
          Создать заявку
        </button>
      </div>
    </form>
  );
}
