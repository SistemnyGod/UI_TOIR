import { useEffect } from "react";
import type { FormEvent, MouseEvent as ReactMouseEvent } from "react";
import type { RouteDirectoryItem, RoutePoint, RoutePointFormPayload } from "../../../../types";
import { EmptyState } from "../../../../shared/ui";
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
        handleCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, point]);

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

  return (
    <div
      className="modal-backdrop route-point-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal(event);
      }}
      role="presentation"
    >
      <section
        aria-labelledby="route-point-modal-title"
        className="modal-window route-point-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
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
      </section>
    </div>
  );
}
