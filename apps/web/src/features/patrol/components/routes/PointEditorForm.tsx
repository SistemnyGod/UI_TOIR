import { useState, type FormEvent } from "react";
import type { RouteDirectoryItem, RoutePoint, RoutePointFormPayload } from "../../../../types";
import { Button, EmptyState, Field } from "../../../../shared/ui";

type MaybePromise<T> = T | Promise<T>;

const pointTypeOptions = ["NFC", "QR-код", "Ручной контроль"] as RoutePoint["type"][];

export const emptyPointDraft: RoutePointFormPayload = {
  requiresPhoto: false,
  name: "",
  zone: "",
  type: "NFC",
  tag: "",
  description: "",
  instruction: "",
  interval: "00:10",
  expectedTime: "00:05",
  status: "Активна" as RoutePoint["status"],
};

export function PointEditorForm({
  draft,
  mode,
  point,
  route,
  isSaving = false,
  error = "",
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
  isSaving?: boolean;
  error?: string;
  onCancel: () => void;
  onChange: (draft: RoutePointFormPayload) => void;
  onCreate: () => void;
  onDelete?: () => MaybePromise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => MaybePromise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const normalizedTag = draft.tag.trim().toLowerCase();
  const hasDuplicateTag =
    normalizedTag.length > 0 &&
    route.points.some((routePoint) => routePoint.id !== point?.id && routePoint.tag.trim().toLowerCase() === normalizedTag);

  if (mode === "edit" && !point) {
    return (
      <EmptyState
        title="Точка не выбрана"
        description="Выберите точку в таблице или добавьте новую."
        action={<Button onClick={onCreate} variant="ghost">Добавить точку</Button>}
      />
    );
  }

  return (
    <form className="route-point-form" onSubmit={onSubmit} aria-busy={isSaving}>
      <div className="route-point-editor-body"><fieldset className="patrol-route-fields" disabled={isSaving}>
        <section className="route-point-editor-section">
          <div className="route-point-editor-section-head">
            <span className="route-point-editor-step">1</span>
            <div>
              <h3>Идентификация оборудования</h3>
              <p>Основные данные контрольной точки и физической метки.</p>
            </div>
          </div>
          <div className="route-point-editor-grid">
            <label className="route-point-editor-wide">
              Название точки
              <input required value={draft.name} onChange={(event) => onChange({ ...draft, name: event.currentTarget.value })} />
            </label>
            <label>
              Тип точки
              <select aria-label="Тип точки" value={draft.type} onChange={(event) => onChange({ ...draft, type: event.currentTarget.value as RoutePoint["type"] })}>
                {pointTypeOptions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Код метки
              <input aria-label="Код метки" placeholder="Например, NFC-001" value={draft.tag} onChange={(event) => onChange({ ...draft, tag: event.currentTarget.value })} />
              <small>Уникальный NFC/QR-код внутри маршрута.</small>
            </label>
            <label className="route-point-editor-wide">
              Зона или узел оборудования
              <input placeholder="Например, электродвигатель печи" value={draft.zone} onChange={(event) => onChange({ ...draft, zone: event.currentTarget.value })} />
            </label>
          </div>
        </section>

        <section className="route-point-editor-section">
          <div className="route-point-editor-section-head">
            <span className="route-point-editor-step">2</span>
            <div>
              <h3>Контекст для обходчика</h3>
              <p>Обходчик увидит описание и инструкцию при открытии точки.</p>
            </div>
          </div>
          <div className="route-point-editor-copy-grid">
            <label>
              Описание оборудования
              <textarea
                aria-label="Описание оборудования"
                maxLength={1000}
                placeholder="Что это за оборудование и что контролируется в этой точке"
                rows={4}
                value={draft.description}
                onChange={(event) => onChange({ ...draft, description: event.currentTarget.value })}
              />
              <small>{draft.description.length}/1000</small>
            </label>
            <label>
              Инструкция к метке
              <textarea
                aria-label="Инструкция к метке"
                maxLength={2000}
                placeholder="Куда поднести телефон, что осмотреть и на что обратить внимание"
                rows={4}
                value={draft.instruction}
                onChange={(event) => onChange({ ...draft, instruction: event.currentTarget.value })}
              />
              <small>{draft.instruction.length}/2000</small>
            </label>
          </div>
        </section>
      <dl className="meta-list">
        <Field label="Порядок" value={point?.order ?? route.points.length + 1} />
        <Field label="Маршрут" value={route.name} />
      </dl>
      {hasDuplicateTag ? (
        <div className="notice warning-soft">
          <strong>Такая NFC/QR-метка уже есть в этом маршруте.</strong>
          <span>Измените тег или выберите существующую точку с этой меткой.</span>
        </div>
      ) : null}
      {confirmDelete ? <div className="notice warning-soft"><strong>Удалить точку «{point?.name}» из маршрута?</strong><span>Сохранение формы не требуется. Проверьте выбранную точку перед удалением.</span><div className="inline-actions"><Button variant="danger" onClick={onDelete}>Да, удалить точку</Button><Button variant="ghost" onClick={() => setConfirmDelete(false)}>Оставить точку</Button></div></div> : null}
      </fieldset></div>
      <div className="drawer-actions">
        {error ? <p role="alert" className="route-form-error">{error}</p> : null}
        {onDelete ? <Button disabled={isSaving} className="danger-outline" onClick={() => setConfirmDelete(true)} variant="ghost">Удалить точку</Button> : null}
        <Button disabled={isSaving} onClick={onCancel} variant="ghost">Отмена</Button>
        <Button disabled={hasDuplicateTag || isSaving} isLoading={isSaving} type="submit" variant="primary">{mode === "create" ? "Добавить точку" : "Сохранить точку"}</Button>
      </div>
    </form>
  );
}

export function pointToDraft(point: RoutePoint): RoutePointFormPayload {
  return {
    requiresPhoto: false,
    name: point.name,
    zone: point.zone,
    type: point.type,
    tag: point.tag,
    description: point.description,
    instruction: point.instruction,
    interval: point.interval,
    expectedTime: point.expectedTime,
    status: point.status,
  };
}
