import { useEffect, useState } from "react";
import type { FormEvent, MouseEvent as ReactMouseEvent } from "react";
import type { RouteFormPayload, RoutePoint, RoutePointFormPayload } from "../../../../types";
import { createClientUuid } from "../../../../shared/clientUuid";
import { emptyPointDraft } from "./PointEditorForm";

type MaybePromise<T> = T | Promise<T>;

interface DraftPoint extends RoutePointFormPayload {
  id: string;
  order: number;
}

const pointTypeOptions = ["NFC", "QR-код", "Ручной контроль"] as RoutePoint["type"][];

export function RouteCreateModal({
  draft,
  isOpen,
  onCancel,
  onChange,
  onSubmit,
}: {
  draft: RouteFormPayload;
  isOpen: boolean;
  onCancel: () => void;
  onChange: (draft: RouteFormPayload) => void;
  onSubmit: (routeDraft: RouteFormPayload, points: RoutePointFormPayload[]) => MaybePromise<void>;
}) {
  const [pointDraft, setPointDraft] = useState<RoutePointFormPayload>(emptyPointDraft);
  const [points, setPoints] = useState<DraftPoint[]>([]);
  const [editingPointId, setEditingPointId] = useState<string | null>(null);
  const [error, setError] = useState("");

  function closeModal(event?: Pick<ReactMouseEvent, "preventDefault" | "stopPropagation">) {
    event?.preventDefault();
    event?.stopPropagation();
    onCancel();
  }

  useEffect(() => {
    if (!isOpen) return;
    setPointDraft({ ...emptyPointDraft, zone: draft.territory });
    setPoints([]);
    setEditingPointId(null);
    setError("");
  }, [draft.territory, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  function patchPoint(patch: Partial<RoutePointFormPayload>) {
    setPointDraft((current) => ({ ...current, ...patch }));
  }

  function resetPointDraft() {
    setPointDraft({ ...emptyPointDraft, zone: draft.territory });
    setEditingPointId(null);
    setError("");
  }

  function addOrUpdatePoint() {
    if (!pointDraft.name.trim()) {
      setError("Укажите название точки.");
      return;
    }

    if (hasDuplicateTag) {
      setError("Такая NFC/QR-метка уже есть в этом маршруте. Укажите уникальную метку.");
      return;
    }

    if (editingPointId) {
      setPoints((current) =>
        reorderDraftPoints(current.map((point) => (point.id === editingPointId ? { ...point, ...pointDraft } : point))),
      );
      resetPointDraft();
      return;
    }

    setPoints((current) =>
      reorderDraftPoints([
        ...current,
        {
          ...pointDraft,
          id: `draft-point-${createClientUuid()}`,
          order: current.length + 1,
        },
      ]),
    );
    resetPointDraft();
  }

  function editPoint(point: DraftPoint) {
    setPointDraft({
      expectedTime: point.expectedTime,
      interval: point.interval,
      name: point.name,
      description: point.description,
      instruction: point.instruction,
      status: point.status,
      tag: point.tag,
      type: point.type,
      zone: point.zone,
    });
    setEditingPointId(point.id);
    setError("");
  }

  function deletePoint(pointId: string) {
    setPoints((current) => reorderDraftPoints(current.filter((point) => point.id !== pointId)));
    if (editingPointId === pointId) resetPointDraft();
  }

  function movePoint(pointId: string, direction: -1 | 1) {
    setPoints((current) => {
      const index = current.findIndex((point) => point.id === pointId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;

      const next = [...current];
      const [point] = next.splice(index, 1);
      next.splice(nextIndex, 0, point);
      return reorderDraftPoints(next);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!draft.name.trim()) {
      setError("Укажите название маршрута.");
      return;
    }

    await onSubmit(
      {
        ...draft,
        duration: draft.duration.trim() || "00:30",
      },
      points.map(({ id: _id, order: _order, ...point }) => point),
    );
  }

  const normalizedPointTag = pointDraft.tag.trim().toLowerCase();
  const hasDuplicateTag =
    normalizedPointTag.length > 0 &&
    points.some((point) => point.id !== editingPointId && point.tag.trim().toLowerCase() === normalizedPointTag);

  return (
    <div
      className="modal-backdrop route-create-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal(event);
      }}
    >
      <section
        aria-labelledby="route-create-modal-title"
        className="modal-window route-create-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <header className="modal-head">
            <div>
              <span className="modal-kicker">Маршрут и точки</span>
              <h2 id="route-create-modal-title">Создание маршрута</h2>
              <p>Заполните маршрут, добавьте контрольные точки и расставьте порядок обхода перед сохранением.</p>
            </div>
            <button aria-label="Закрыть" className="icon-button route-modal-close" onClick={closeModal} title="Закрыть" type="button">
              x
            </button>
          </header>

          <div className="route-create-body">
            <section className="route-create-section">
              <div className="section-line-title">
                <h3>Параметры маршрута</h3>
                <span>{points.length} точек</span>
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
            </section>

            <section className="route-create-section point-builder">
              <div className="section-line-title">
                <h3>{editingPointId ? "Редактирование точки" : "Новая точка"}</h3>
                <button className="button ghost compact-button" onClick={resetPointDraft} type="button">Очистить</button>
              </div>
              <div className="form-grid two route-point-builder-grid">
                <label>
                  Название точки
                  <input value={pointDraft.name} onChange={(event) => patchPoint({ name: event.currentTarget.value })} />
                </label>
                <label>
                  Тип точки
                  <select value={pointDraft.type} onChange={(event) => patchPoint({ type: event.currentTarget.value as RoutePoint["type"] })}>
                    {pointTypeOptions.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  NFC / QR / метка
                  <input value={pointDraft.tag} onChange={(event) => patchPoint({ tag: event.currentTarget.value })} />
                </label>
                <label>
                  Зона точки
                  <input value={pointDraft.zone} onChange={(event) => patchPoint({ zone: event.currentTarget.value })} />
                </label>
                <label className="route-point-builder-copy">
                  Описание оборудования
                  <textarea rows={3} maxLength={1000} value={pointDraft.description} onChange={(event) => patchPoint({ description: event.currentTarget.value })} />
                </label>
                <label className="route-point-builder-copy">
                  Инструкция к метке
                  <textarea rows={3} maxLength={2000} value={pointDraft.instruction} onChange={(event) => patchPoint({ instruction: event.currentTarget.value })} />
                </label>
              </div>
              <button className="button primary route-create-add-point" disabled={hasDuplicateTag} onClick={addOrUpdatePoint} type="button">
                {editingPointId ? "Сохранить точку" : "Добавить точку"}
              </button>
            </section>

            {error ? <div className="notice danger-soft route-create-error"><strong>{error}</strong></div> : null}
            {hasDuplicateTag ? (
              <div className="notice info-soft route-create-error">
                <strong>NFC/QR-код уже есть в этом маршруте.</strong>
                <span>Сохранение точки заблокировано: внутри одного маршрута NFC/QR-метка должна быть уникальной.</span>
              </div>
            ) : null}

            <section className="route-create-section route-create-points">
              <div className="section-line-title">
                <h3>Порядок точек</h3>
                <span>{points.length} точек</span>
              </div>
              {points.length ? (
                <div className="route-create-point-list">
                  {points.map((point, index) => (
                    <div className="route-create-point-row" key={point.id}>
                      <span className="route-create-point-order">{point.order}</span>
                      <button className="route-create-point-main" onClick={() => editPoint(point)} type="button">
                        <strong>{point.name}</strong>
                        <small>{point.type} / {point.tag || "без метки"} / {point.zone || "без зоны"}</small>
                      </button>
                      <div className="order-actions">
                        <button className="mini-icon" disabled={index === 0} onClick={() => movePoint(point.id, -1)} type="button">↑</button>
                        <button className="mini-icon" disabled={index === points.length - 1} onClick={() => movePoint(point.id, 1)} type="button">↓</button>
                        <button className="mini-icon danger" onClick={() => deletePoint(point.id)} type="button">x</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="route-create-empty">
                  <strong>Точек пока нет</strong>
                  <span>Добавьте первую точку выше. После добавления точки появятся в этом списке, их можно перемещать вверх и вниз.</span>
                </div>
              )}
            </section>
          </div>

          <footer className="route-create-footer">
            <button className="button ghost" onClick={closeModal} type="button">Отмена</button>
            <button className="button primary" type="submit">Создать маршрут{points.length ? ` с точками (${points.length})` : ""}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function reorderDraftPoints(points: DraftPoint[]) {
  return points.map((point, index) => ({ ...point, order: index + 1 }));
}
