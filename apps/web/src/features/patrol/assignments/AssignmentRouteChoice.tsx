import { Clock3, MapPin } from "./AssignmentIcons";
import type { RouteDirectoryItem, RouteOption, RoutePoint } from "../../../types";

export function AssignmentRoutePoints({ points }: { points?: RoutePoint[] }) {
  if (!points?.length) return <p className="assignment-route-empty">Список точек маршрута пока не загружен.</p>;
  return <ol className="assignment-route-points">
    {[...points].sort((a, b) => a.order - b.order).map((point) => <li key={point.id}>
      <strong>{point.name}</strong><span>{point.zone} · {point.type}</span>
      {point.instruction ? <small>{point.instruction}</small> : null}
    </li>)}
  </ol>;
}

export function AssignmentRouteChoice({ route, selected, onSelect, directory, disabled = false }: {
  route: RouteOption; selected: boolean; onSelect: (id: string) => void;
  directory?: RouteDirectoryItem; disabled?: boolean;
}) {
  return <article className={`assignment-route-choice ${selected ? "is-selected" : ""}`}>
    <button type="button" aria-pressed={selected} disabled={disabled} onClick={() => onSelect(route.id)} className="assignment-route-select">
      <strong>{route.name}</strong><span className="assign-am-radio" aria-hidden="true" />
      <span className="assignment-route-meta"><span><MapPin size={16} />{route.points} точек</span><span><Clock3 size={16} />{route.duration}</span></span>
    </button>
    <details className="assignment-route-details"><summary>Посмотреть точки</summary><AssignmentRoutePoints points={directory?.points} /></details>
  </article>;
}
