export type ScreenId = "dashboard" | "results" | "assign" | "employees" | "schedule" | "accounts" | "routes" | "users";

export type ResultMode = "all" | "issues" | "late" | "photos";
export type ScheduleMode = "week" | "month" | "exceptions";
export type AccountMode = "accounts" | "sessions" | "bindings";
export type RouteMode = "points" | "scheme" | "stats" | "history";
export type ShiftFilter = "day" | "night";
export type TerritoryFilter = "north" | "south";
export type DataSourceMode = "mock" | "api";
export type DataSourceStatus = "idle" | "loading" | "ready" | "error";

export type Tone =
  | "blue"
  | "green"
  | "red"
  | "orange"
  | "violet"
  | "slate"
  | "day"
  | "night"
  | "neutral";

export interface ScreenConfig {
  id: ScreenId;
  label: string;
  shortLabel: string;
  hint: string;
  title: string;
  subtitle: string;
  icon: string;
  createLabel: string;
}

export interface Metric {
  label: string;
  value: string;
  delta: string;
  tone: Tone;
  icon: string;
}

export interface ActivePatrol {
  id: string;
  employee: string;
  employeeId: string;
  route: string;
  zone: string;
  shift: "День" | "Ночь";
  currentPoint: string;
  status: "В пути" | "Задержка" | "Нет связи" | "Завершает" | "Ожидает" | "Запланирован";
  progress: number;
  eta: string;
  deviation: string;
  startedAt?: string;
  totalTime?: string;
  checkpoints?: PatrolCheckpointProgress[];
  media?: PatrolMediaAttachment[];
}

export interface PatrolCheckpointProgress {
  id: string;
  name: string;
  scannedAt?: string;
  activatedAt?: string;
  status: "Исправно" | "Неисправно" | "Ожидает" | "Пропущено";
  comment?: string;
  media?: PatrolMediaAttachment[];
}

export interface PatrolMediaAttachment {
  id: string;
  type: "Фото" | "Видео";
  label: string;
  createdAt?: string;
}

export interface PatrolResult {
  id: string;
  status: "Подтверждено" | "Замечание" | "Просрочено" | "Не подтверждено";
  point: string;
  pointId: string;
  employee: string;
  employeeId: string;
  route: string;
  territory: string;
  shift: "День" | "Ночь";
  plannedAt: string;
  actualAt: string;
  deviation: string;
  comment: string;
  photos: number;
  issueType: string;
  severity: "Низкая" | "Средняя" | "Высокая" | "-";
  chronology: string[];
}

export interface ServiceRequest {
  id: string;
  requestKind: "patrol-assignment";
  title: string;
  status: "Новая" | "В работе" | "Назначена" | "Закрыта";
  priority: "Низкий" | "Средний" | "Высокий" | "Критический";
  sourceResultId: string;
  source: string;
  route: string;
  point: string;
  employee: string;
  scheduledDate: string;
  scheduledTime: string;
  notifyEmployee: boolean;
  notificationText: string;
  createdAt: string;
  dueAt: string;
  responsible: string;
  description: string;
  timeline: string[];
}

export interface CreateServiceRequestPayload {
  employee: string;
  route: string;
  scheduledDate: string;
  scheduledTime: string;
  notifyEmployee: boolean;
  notificationText: string;
  description: string;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  zone: string;
  shift: "День" | "Ночь";
  status: "Свободен" | "В обходе" | "Перерыв" | "Нет связи";
  activity: string;
}

export interface EmployeeDirectoryItem {
  id: string;
  fullName: string;
  initials: string;
  personnelNo: string;
  position: string;
  department: string;
  zone: string;
  status: "Активен" | "На смене" | "Офлайн" | "Отпуск";
  routesDone: number;
  routesTotal: number;
  mobileStatus: "Привязан" | "Не привязан";
  lastSeen: string;
  phone: string;
  hiredAt: string;
  brigade: string;
  shift: string;
  leader: string;
  email: string;
}

export interface EmployeeFormPayload {
  fullName: string;
  personnelNo: string;
  position: string;
  department: string;
  status: EmployeeDirectoryItem["status"];
  shift: string;
  hasMobileAccount: boolean;
}

export interface SiteUser {
  id: string;
  login: string;
  fullName: string;
  role: "Администратор" | "Оператор" | "Руководитель" | "Аудитор";
  status: "Активен" | "Неактивен" | "Заблокирован";
  lastLogin: string;
  createdAt: string;
  access: string[];
  recentSessions: string[];
}

export interface RouteOption {
  id: string;
  name: string;
  zone: string;
  duration: string;
  distance: string;
  points: number;
  controlPoints: number;
  priority: "Высокий" | "Средний" | "Обычный";
  requiredEmployees: number;
  loadedEmployees: number;
}

export interface MobileAccount {
  id: string;
  login: string;
  password: string;
  employee: string;
  employeeScope: "selected" | "all";
  boundEmployees: string[];
  role: string;
  status: "Активен" | "Не привязан" | "Заблокирован";
  session: "Онлайн" | "Офлайн" | "-";
  lastSeen: string;
  device: string;
  version: string;
}

export interface CreateMobileAccountPayload {
  employee: string;
  employeeScope: MobileAccount["employeeScope"];
  login: string;
  role: string;
  bindEmployee: boolean;
  restrictToBoundDevice: boolean;
  temporaryPassword: boolean;
}

export interface RoutePoint {
  id: string;
  order: number;
  name: string;
  zone: string;
  type: "NFC" | "QR-код" | "Ручной контроль";
  tag: string;
  interval: string;
  expectedTime: string;
  status: "Активна" | "Повтор метки" | "Черновик";
  requiresPhoto: boolean;
}

export interface RouteDirectoryItem {
  id: string;
  name: string;
  territory: string;
  status: "Активен" | "Черновик" | "Архив";
  description: string;
  duration: string;
  distance: string;
  periodicity: string;
  points: RoutePoint[];
}

export interface RouteFormPayload {
  name: string;
  territory: string;
  status: RouteDirectoryItem["status"];
  description: string;
  duration: string;
  distance: string;
  periodicity: string;
}

export interface RoutePointFormPayload {
  name: string;
  zone: string;
  type: RoutePoint["type"];
  tag: string;
  interval: string;
  expectedTime: string;
  status: RoutePoint["status"];
  requiresPhoto: boolean;
}

export interface ScheduleCell {
  id: string;
  employee: string;
  employeeId: string;
  shift: "Дневная" | "Ночная";
  day: string;
  route: string;
  zone: string;
  state: "planned" | "alternate" | "transfer" | "vacation" | "sick" | "empty";
}
