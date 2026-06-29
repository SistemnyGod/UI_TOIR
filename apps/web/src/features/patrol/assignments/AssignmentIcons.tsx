import type { ReactElement } from "react";

export type AssignmentIconProps = { size?: number };
export type AssignmentIconComponent = (props: AssignmentIconProps) => ReactElement;

const assignIconPaths = {
  alert: ["M12 4 3 20h18L12 4Z", "M12 9v5", "M12 17h.01"],
  calendar: ["M7 3v4", "M17 3v4", "M4 8h16", "M5 5h14v15H5V5Z"],
  check: ["M20 6 9 17l-5-5"],
  clock: ["M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z", "M12 8v4l3 2"],
  file: ["M6 3h8l4 4v14H6V3Z", "M14 3v5h5", "M9 13h6", "M9 17h6"],
  list: ["M9 6h11", "M9 12h11", "M9 18h11", "M4 6h.01", "M4 12h.01", "M4 18h.01"],
  mapPin: ["M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z", "M12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"],
  plus: ["M12 5v14", "M5 12h14"],
  route: ["M5 6h7a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h10", "M5 6l3-3", "M5 6l3 3"],
  search: ["M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z", "m16 16 4 4"],
  send: ["M21 3 10 14", "M21 3l-7 18-4-7-7-4 18-7Z"],
  sliders: ["M4 7h10", "M18 7h2", "M4 17h2", "M10 17h10", "M14 5v4", "M8 15v4"],
  userPlus: ["M15 19a6 6 0 0 0-12 0", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M19 8v6", "M16 11h6"],
  wifi: ["M5 12a10 10 0 0 1 14 0", "M8.5 15.5a5 5 0 0 1 7 0", "M12 19h.01"],
} as const;

const makeIcon =
  (name: keyof typeof assignIconPaths): AssignmentIconComponent =>
  ({ size = 18 }) => (
    <svg className="assign-am-svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {assignIconPaths[name].map((path, index) => (
        <path d={path} key={index} />
      ))}
    </svg>
  );

export const AlertTriangle = makeIcon("alert");
export const CalendarDays = makeIcon("calendar");
export const CheckCircle2 = makeIcon("check");
export const Clock3 = makeIcon("clock");
export const FileText = makeIcon("file");
export const ListChecks = makeIcon("list");
export const MapPin = makeIcon("mapPin");
export const Plus = makeIcon("plus");
export const Route = makeIcon("route");
export const Search = makeIcon("search");
export const Send = makeIcon("send");
export const SlidersHorizontal = makeIcon("sliders");
export const UserPlus = makeIcon("userPlus");
export const Wifi = makeIcon("wifi");
