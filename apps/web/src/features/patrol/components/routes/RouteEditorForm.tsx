import type { FormEvent } from "react";
import type { RouteDirectoryItem, RouteFormPayload } from "../../../../types";
import { Button } from "../../../../shared/ui";

type MaybePromise<T> = T | Promise<T>;

export const emptyRouteDraft: RouteFormPayload = {
  name: "",
  territory: "",
  status: "Активен" as RouteDirectoryItem["status"],
  description: "",
  duration: "00:30",
  distance: "0 км",
  periodicity: "По заявке",
};

export function RouteEditorForm({
  draft,
  mode,
  onCancel,
  onChange,
  onDelete,
  onSubmit,
}: {
  draft: RouteFormPayload;
  mode: "create" | "edit";
  onCancel: () => void;
  onChange: (draft: RouteFormPayload) => void;
  onDelete?: () => MaybePromise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => MaybePromise<void>;
}) {
  return (
    <form className="route-form-card" onSubmit={onSubmit}>
      <div className="section-line-title">
        <h3>{mode === "create" ? "Создание маршрута" : "Редактирование маршрута"}</h3>
        {onDelete ? <Button className="compact-button" onClick={onDelete} variant="danger">Удалить</Button> : null}
      </div>
      <div className="form-grid two route-form-grid">
        <label>
          Название маршрута
          <input required value={draft.name} onChange={(event) => onChange({ ...draft, name: event.currentTarget.value })} />
        </label>
        <label>
          Территория
          <input value={draft.territory} onChange={(event) => onChange({ ...draft, territory: event.currentTarget.value })} />
        </label>
        <label className="full-label">
          Описание
          <textarea value={draft.description} onChange={(event) => onChange({ ...draft, description: event.currentTarget.value })} />
        </label>
      </div>
      <div className="form-actions">
        <Button onClick={onCancel} variant="ghost">Отмена</Button>
        <Button type="submit" variant="primary">{mode === "create" ? "Создать маршрут" : "Сохранить маршрут"}</Button>
      </div>
    </form>
  );
}

export function routeToDraft(route: RouteDirectoryItem): RouteFormPayload {
  return {
    name: route.name,
    territory: route.territory,
    status: route.status,
    description: route.description,
    duration: route.duration,
    distance: route.distance,
    periodicity: route.periodicity,
  };
}
