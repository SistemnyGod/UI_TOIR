import { useEffect } from "react";
import type { FormEvent, MouseEvent as ReactMouseEvent } from "react";
import type { RouteFormPayload } from "../../types";
import { RouteEditorForm } from "./RouteEditorForm";

type MaybePromise<T> = T | Promise<T>;

export function RouteEditModal({
  draft,
  isOpen,
  onCancel,
  onChange,
  onDelete,
  onSubmit,
}: {
  draft: RouteFormPayload;
  isOpen: boolean;
  onCancel: () => void;
  onChange: (draft: RouteFormPayload) => void;
  onDelete?: () => MaybePromise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => MaybePromise<void>;
}) {
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

  function closeModal(event?: Pick<ReactMouseEvent, "preventDefault" | "stopPropagation">) {
    event?.preventDefault();
    event?.stopPropagation();
    onCancel();
  }

  return (
    <div
      className="modal-backdrop route-edit-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal(event);
      }}
      role="presentation"
    >
      <section
        aria-labelledby="route-edit-modal-title"
        className="modal-window route-edit-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-head route-edit-head">
          <div>
            <span className="modal-kicker">Маршрут</span>
            <h2 id="route-edit-modal-title">Редактирование маршрута</h2>
            <p>Измените параметры маршрута и сохраните изменения.</p>
          </div>
          <button aria-label="Закрыть" className="icon-button route-modal-close" onClick={closeModal} title="Закрыть" type="button">
            x
          </button>
        </header>
        <div className="route-edit-body">
          <RouteEditorForm
            draft={draft}
            mode="edit"
            onCancel={onCancel}
            onChange={onChange}
            onDelete={onDelete}
            onSubmit={onSubmit}
          />
        </div>
      </section>
    </div>
  );
}
