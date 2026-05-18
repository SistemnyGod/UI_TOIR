import type { FormEvent } from "react";
import type { RouteDirectoryItem, RoutePoint, RoutePointFormPayload } from "../../types";
import { Chip, EmptyState, Field } from "../ui";

type MaybePromise<T> = T | Promise<T>;

const pointTypeOptions = ["NFC", "QR-код", "Ручной контроль"] as RoutePoint["type"][];
const pointStatusOptions = ["Активна", "Повтор метки", "Черновик"] as RoutePoint["status"][];

export const emptyPointDraft: RoutePointFormPayload = {
  name: "",
  zone: "",
  type: "NFC",
  tag: "",
  interval: "00:10",
  expectedTime: "00:05",
  status: "Активна" as RoutePoint["status"],
  requiresPhoto: true,
};

export function PointEditorForm({
  draft,
  mode,
  point,
  route,
  onCancel,
  onChange,
  onCreate,
  onDelete,
  onSubmit,
}: {
  draft: RoutePointFormPayload;
  mode: "create" | "edit";
  point?: RoutePoint;
  route: RouteDirectoryItem;
  onCancel: () => void;
  onChange: (draft: RoutePointFormPayload) => void;
  onCreate: () => void;
  onDelete?: () => MaybePromise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => MaybePromise<void>;
}) {
  if (mode === "edit" && !point) {
    return (
      <EmptyState
        title="Точка не выбрана"
        description="Выберите точку в таблице или добавьте новую."
        action={<button className="button ghost" onClick={onCreate} type="button">Добавить точку</button>}
      />
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="drawer-title">
        <div>
          <h2>{mode === "create" ? "Новая точка" : "Редактирование точки"}</h2>
          <p>{route.name}</p>
        </div>
        <button className="icon-button" onClick={onCancel} title="Отменить" type="button">×</button>
      </div>
      <div className="form-stack">
        <label>
          Название точки
          <input required value={draft.name} onChange={(event) => onChange({ ...draft, name: event.currentTarget.value })} />
        </label>
        <label>
          Зона / локация
          <input value={draft.zone} onChange={(event) => onChange({ ...draft, zone: event.currentTarget.value })} />
        </label>
        <label>
          Тип точки
          <select value={draft.type} onChange={(event) => onChange({ ...draft, type: event.currentTarget.value as RoutePoint["type"] })}>
            {pointTypeOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          NFC / тег / ярлык
          <input value={draft.tag} onChange={(event) => onChange({ ...draft, tag: event.currentTarget.value })} />
        </label>
        <div className="form-grid two">
          <label>
            Интервал
            <input value={draft.interval} onChange={(event) => onChange({ ...draft, interval: event.currentTarget.value })} />
          </label>
          <label>
            Ожид. время
            <input value={draft.expectedTime} onChange={(event) => onChange({ ...draft, expectedTime: event.currentTarget.value })} />
          </label>
        </div>
        <label>
          Статус
          <select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.currentTarget.value as RoutePoint["status"] })}>
            {pointStatusOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <dl className="meta-list">
        <Field label="Порядок" value={point?.order ?? route.points.length + 1} />
        <Field label="Маршрут" value={route.name} />
        {point ? <Field label="Текущий статус" value={<Chip>{point.status}</Chip>} /> : null}
      </dl>
      <div className="notice info-soft">
        <strong>Повтор NFC-метки разрешен.</strong>
        <span>Одинаковый тег можно сохранить в другом маршруте или в этом маршруте, если это нужно для реального обхода.</span>
      </div>
      <label className="toggle-filter">
        <input checked={draft.requiresPhoto} onChange={(event) => onChange({ ...draft, requiresPhoto: event.currentTarget.checked })} type="checkbox" />
        Требовать фото
      </label>
      <div className="drawer-actions">
        {onDelete ? <button className="button danger-outline" onClick={onDelete} type="button">Удалить</button> : null}
        <button className="button ghost" onClick={onCancel} type="button">Отмена</button>
        <button className="button primary" type="submit">{mode === "create" ? "Добавить точку" : "Сохранить точку"}</button>
      </div>
    </form>
  );
}

export function pointToDraft(point: RoutePoint): RoutePointFormPayload {
  return {
    name: point.name,
    zone: point.zone,
    type: point.type,
    tag: point.tag,
    interval: point.interval,
    expectedTime: point.expectedTime,
    status: point.status,
    requiresPhoto: point.requiresPhoto,
  };
}
