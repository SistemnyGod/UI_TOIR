import type { FormEvent } from "react";
import type { RouteDirectoryItem, RoutePoint, RoutePointFormPayload } from "../../../../types";
import { EmptyState, Field } from "../../../../shared/ui";

type MaybePromise<T> = T | Promise<T>;

const pointTypeOptions = ["NFC", "QR-код", "Ручной контроль"] as RoutePoint["type"][];

export const emptyPointDraft: RoutePointFormPayload = {
  name: "",
  zone: "",
  type: "NFC",
  tag: "",
  interval: "00:10",
  expectedTime: "00:05",
  status: "Активна" as RoutePoint["status"],
  requiresPhoto: false,
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
  const normalizedTag = draft.tag.trim().toLowerCase();
  const hasDuplicateTag =
    normalizedTag.length > 0 &&
    route.points.some((routePoint) => routePoint.id !== point?.id && routePoint.tag.trim().toLowerCase() === normalizedTag);

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
          <h2 id="route-point-modal-title">{mode === "create" ? "Новая точка" : "Редактирование точки"}</h2>
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
          Тип точки
          <select value={draft.type} onChange={(event) => onChange({ ...draft, type: event.currentTarget.value as RoutePoint["type"] })}>
            {pointTypeOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          NFC / тег / ярлык
          <input value={draft.tag} onChange={(event) => onChange({ ...draft, tag: event.currentTarget.value })} />
        </label>
        <label>
          Зона точки
          <input value={draft.zone} onChange={(event) => onChange({ ...draft, zone: event.currentTarget.value })} />
        </label>
        <label className="route-create-check">
          <input
            checked={draft.requiresPhoto}
            onChange={(event) => onChange({ ...draft, requiresPhoto: event.currentTarget.checked })}
            type="checkbox"
          />
          Фото обязательно
        </label>
      </div>
      <dl className="meta-list">
        <Field label="Порядок" value={point?.order ?? route.points.length + 1} />
        <Field label="Маршрут" value={route.name} />
      </dl>
      <div className="notice info-soft">
        <strong>NFC-метка должна быть уникальной внутри маршрута.</strong>
        <span>Одинаковый тег допустим только в другом маршруте. В этом маршруте сохранение дубля будет заблокировано.</span>
      </div>
      {hasDuplicateTag ? (
        <div className="notice warning-soft">
          <strong>Такая NFC/QR-метка уже есть в этом маршруте.</strong>
          <span>Измените тег или выберите существующую точку с этой меткой.</span>
        </div>
      ) : null}
      <div className="drawer-actions">
        {onDelete ? <button className="button danger-outline" onClick={onDelete} type="button">Удалить</button> : null}
        <button className="button ghost" onClick={onCancel} type="button">Отмена</button>
        <button className="button primary" disabled={hasDuplicateTag} type="submit">{mode === "create" ? "Добавить точку" : "Сохранить точку"}</button>
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
