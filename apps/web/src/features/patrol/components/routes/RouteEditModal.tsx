import { useEffect } from "react";
import type { FormEvent, MouseEvent as ReactMouseEvent } from "react";
import type { RouteFormPayload } from "../../../../types";
import { ModalShell } from "../../../../shared/ui";
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
  if (!isOpen) return null;

  function closeModal(event?: Pick<ReactMouseEvent, "preventDefault" | "stopPropagation">) {
    event?.preventDefault();
    event?.stopPropagation();
    onCancel();
  }

  return (
    <ModalShell
      className="route-edit-modal"
      onClose={() => closeModal()}
      subtitle="Измените параметры маршрута и сохраните изменения."
      title="Редактирование маршрута"
    >
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
    </ModalShell>
  );
}
