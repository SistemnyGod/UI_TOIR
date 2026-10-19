import { useState, type FormEvent } from "react";
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
  isSaving = false,
  error = "",
  onCancel,
  onChange,
  onDelete,
  onSubmit,
}: {
  draft: RouteFormPayload;
  mode: "create" | "edit";
  isSaving?: boolean;
  error?: string;
  onCancel: () => void;
  onChange: (draft: RouteFormPayload) => void;
  onDelete?: () => MaybePromise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => MaybePromise<void>;
}) {
  const [confirmArchive, setConfirmArchive] = useState(false);
  return (
    <form className="route-form-card" onSubmit={onSubmit} aria-busy={isSaving}>
      <div className="route-edit-fields"><fieldset className="patrol-route-fields" disabled={isSaving}>
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
        <label>Статус маршрута<select aria-label="Статус маршрута" value={draft.status} onChange={event => onChange({ ...draft, status: event.currentTarget.value as RouteFormPayload["status"] })}><option>Активен</option><option>Черновик</option>{draft.status === "Архив" ? <option>Архив</option> : null}</select></label>
        <label>Длительность обхода<input value={draft.duration} placeholder="Например, 00:30" onChange={event => onChange({ ...draft, duration: event.currentTarget.value })} /></label>
      </div>
      <details className="route-extra-fields"><summary>Дополнительные параметры</summary><div className="form-grid two route-form-grid"><label>Длина маршрута<input value={draft.distance} placeholder="Например, 1 км" onChange={event => onChange({ ...draft, distance: event.currentTarget.value })} /></label><label>Периодичность<input value={draft.periodicity} onChange={event => onChange({ ...draft, periodicity: event.currentTarget.value })} /></label></div></details>
      {confirmArchive ? <div className="notice warning-soft"><strong>Перенести «{draft.name}» в архив?</strong><span>Маршрут сохранится в справочнике и будет доступен при отображении архива.</span><div className="inline-actions"><Button variant="danger" onClick={onDelete}>Да, в архив</Button><Button variant="ghost" onClick={() => setConfirmArchive(false)}>Оставить маршрут</Button></div></div> : null}
      </fieldset></div>
      <div className="form-actions">
        {error ? <p className="route-form-error" role="alert">{error}</p> : null}
        {onDelete ? <Button disabled={isSaving || draft.status === "Архив"} onClick={() => setConfirmArchive(true)} variant="ghost">В архив</Button> : null}
        <Button disabled={isSaving} onClick={onCancel} variant="ghost">Отмена</Button>
        <Button disabled={isSaving} isLoading={isSaving} type="submit" variant="primary">{mode === "create" ? "Создать маршрут" : "Сохранить маршрут"}</Button>
      </div>
    </form>
  );
}

export function routeToDraft(route: RouteDirectoryItem): RouteFormPayload {
  return {
    expectedVersionNo: route.versionNo,
    name: route.name,
    territory: route.territory,
    status: route.status,
    description: route.description,
    duration: route.duration,
    distance: route.distance,
    periodicity: route.periodicity,
  };
}
