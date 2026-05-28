import type { FormEvent } from "react";
import type { RouteDirectoryItem, RoutePoint, RoutePointFormPayload } from "../../types";
import { EmptyState } from "../ui";
import { PointEditorForm, pointToDraft } from "./PointEditorForm";

type MaybePromise<T> = T | Promise<T>;

interface RoutePointDrawerProps {
  canManage?: boolean;
  draft: RoutePointFormPayload;
  editorMode: "create" | "edit";
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
  point,
  route,
  onCancel,
  onChange,
  onCreate,
  onDelete,
  onSubmit,
}: RoutePointDrawerProps) {
  return (
    <aside className="side-drawer route-point-drawer">
      {!route ? (
        <EmptyState title="Точка не выбрана" description="Сначала создайте или выберите маршрут." />
      ) : (
        canManage ? (
          <PointEditorForm
            draft={draft}
            mode={editorMode}
            point={point}
            route={route}
            onCancel={() => {
              onCancel();
              if (point) onChange(pointToDraft(point));
            }}
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
    </aside>
  );
}
