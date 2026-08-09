import type { FormEvent, MouseEvent as ReactMouseEvent } from "react";
import type { RouteDirectoryItem, RoutePoint, RoutePointFormPayload } from "../../../../types";
import { EmptyState, ModalShell } from "../../../../shared/ui";
import { PointEditorForm, pointToDraft } from "./PointEditorForm";

type MaybePromise<T> = T | Promise<T>;

interface RoutePointDrawerProps {
  canManage?: boolean;
  draft: RoutePointFormPayload;
  editorMode: "create" | "edit";
  isOpen: boolean;
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
  point,
  route,
  onCancel,
  onChange,
  onCreate,
  onDelete,
  onSubmit,
}: RoutePointDrawerProps) {
  if (!isOpen) return null;

  function handleCancel() {
    onCancel();
    if (point) onChange(pointToDraft(point));
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
      : "Редактирование точки";

  return (
    <ModalShell
      className="route-point-modal"
      onClose={() => closeModal()}
      subtitle={route?.name}
      title={title}
    >
      {!route ? (
        <EmptyState title="Точка не выбрана" description="Сначала создайте или выберите маршрут." />
      ) : (
        canManage ? (
          <PointEditorForm
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
          <EmptyState
            title="Просмотр точки маршрута"
            description={point ? `${point.name} / ${point.type} / ${point.tag || "без метки"}` : "Выберите точку маршрута для просмотра."}
          />
        )
      )}
    </ModalShell>
  );
}
