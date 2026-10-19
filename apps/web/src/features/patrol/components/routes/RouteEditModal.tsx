import type { FormEvent, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef } from "react";
import type { RouteFormPayload } from "../../../../types";
import { ModalShell, useDialogCloseGuard } from "../../../../shared/ui";
import { RouteEditorForm } from "./RouteEditorForm";

type MaybePromise<T> = T | Promise<T>;

export function RouteEditModal({
  draft,
  isOpen,
  isSaving = false,
  error = "",
  onCancel,
  onChange,
  onDelete,
  onSubmit,
}: {
  draft: RouteFormPayload;
  isOpen: boolean;
  isSaving?: boolean;
  error?: string;
  onCancel: () => void;
  onChange: (draft: RouteFormPayload) => void;
  onDelete?: () => MaybePromise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => MaybePromise<void>;
}) {
  const initial = useRef(JSON.stringify(draft));
  useEffect(() => { if (isOpen) initial.current = JSON.stringify(draft); }, [isOpen]);
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: () => JSON.stringify(draft) !== initial.current, pending: isSaving, onClose: onCancel });
  if (!isOpen) return null;

  function closeModal(event?: Pick<ReactMouseEvent, "preventDefault" | "stopPropagation">) {
    event?.preventDefault();
    event?.stopPropagation();
    if (isSaving) return;
    requestClose();
  }

  return (
    <><ModalShell
      className="route-edit-modal"
      pending={isSaving}
      onClose={() => closeModal()}
      subtitle="Измените параметры маршрута и сохраните изменения."
      title="Редактирование маршрута"
    >
      <div className="route-edit-body">
          <RouteEditorForm
            isSaving={isSaving}
            error={error}
            draft={draft}
            mode="edit"
            onCancel={closeModal}
            onChange={onChange}
            onDelete={onDelete}
            onSubmit={onSubmit}
          />
      </div>
    </ModalShell>{discardDialog}</>
  );
}
