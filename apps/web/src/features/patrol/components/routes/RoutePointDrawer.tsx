import type { FormEvent, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef } from "react";
import type { RouteDirectoryItem, RoutePoint, RoutePointFormPayload } from "../../../../types";
import { EmptyState, Field, ModalShell, useDialogCloseGuard } from "../../../../shared/ui";
import { PointEditorForm, pointToDraft } from "./PointEditorForm";

type MaybePromise<T> = T | Promise<T>;

interface RoutePointDrawerProps {
  canManage?: boolean;
  draft: RoutePointFormPayload;
  editorMode: "create" | "edit";
  isOpen: boolean;
  isSaving?: boolean;
  error?: string;
  point?: RoutePoint;
  route?: RouteDirectoryItem;
  onCancel: () => void;
  onChange: (draft: RoutePointFormPayload) => void;
  onCreate: () => void;
  onDelete?: () => MaybePromise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => MaybePromise<void>;
}

export function RoutePointDrawer({
  canManage = true,
  draft,
  editorMode,
  isOpen,
  isSaving = false,
  error = "",
  point,
  route,
  onCancel,
  onChange,
  onCreate,
  onDelete,
  onSubmit,
}: RoutePointDrawerProps) {
  const initial = useRef(JSON.stringify(draft));
  useEffect(() => { if (isOpen) initial.current = JSON.stringify(draft); }, [isOpen, point?.id, editorMode]);
  const { requestClose, discardDialog } = useDialogCloseGuard({ dirty: () => canManage && JSON.stringify(draft) !== initial.current, pending: isSaving, onClose: () => {
    onCancel();
    if (point) onChange(pointToDraft(point));
  } });
  if (!isOpen) return null;

  function handleCancel() {
    if (isSaving) return;
    requestClose();
  }

  function closeModal(event?: Pick<ReactMouseEvent, "preventDefault" | "stopPropagation">) {
    event?.preventDefault();
    event?.stopPropagation();
    handleCancel();
  }

  const title = !route
    ? "Точка не выбрана"
    : editorMode === "create"
      ? "Новая точка"
      : canManage ? "Редактирование точки" : "Просмотр точки";

  return (
    <><ModalShell
      className="route-point-modal"
      pending={isSaving}
      onClose={() => closeModal()}
      subtitle={route?.name}
      title={title}
    >
      {!route ? (
        <EmptyState title="Точка не выбрана" description="Сначала создайте или выберите маршрут." />
      ) : (
        canManage ? (
          <PointEditorForm
            key={editorMode === "edit" ? point?.id : "create"}
            isSaving={isSaving}
            error={error}
            draft={draft}
            mode={editorMode}
            point={point}
            route={route}
            onCancel={handleCancel}
            onChange={onChange}
            onCreate={onCreate}
            onDelete={editorMode === "edit" && point ? onDelete : undefined}
            onSubmit={onSubmit}
          />
        ) : (
          point ? <div className="route-point-readonly"><h3>{point.name}</h3><dl className="meta-list"><Field label="Порядок" value={point.order} /><Field label="Зона" value={point.zone || "—"} /><Field label="Тип" value={point.type} /><Field label="Код метки" value={point.tag || "—"} /></dl><section><h3>Описание оборудования</h3><p>{point.description || "Описание не добавлено"}</p></section><section><h3>Инструкция к метке</h3><p>{point.instruction || "Инструкция не добавлена"}</p></section></div> : <EmptyState title="Точка не выбрана" description="Выберите точку маршрута для просмотра." />
        )
      )}
    </ModalShell>{discardDialog}</>
  );
}
