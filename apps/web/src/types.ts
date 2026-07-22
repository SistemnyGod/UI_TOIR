export type PatrolScreenId = "dashboard" | "results" | "assign" | "employees" | "schedule" | "accounts" | "routes";
export type InventoryScreenId =
  | "inventory-overview"
  | "inventory-employees"
  | "inventory-items"
  | "inventory-issue"
  | "inventory-operations"
  | "inventory-custody"
  | "inventory-ppe"
  | "inventory-ppe-history"
  | "inventory-ppe-create"
  | "inventory-history"
  | "inventory-reports"
  | "inventory-users"
  | "inventory-settings"
  | "inventory-system-log";
export type EmuScreenId = "emu-dashboard" | "emu-work-accounting" | "emu-completed-work-history";
export type IntegrationScreenId = "perco-integration";
export type ScreenId = PatrolScreenId | InventoryScreenId | EmuScreenId | IntegrationScreenId | "users";

export type ResultMode = "all" | "issues" | "late" | "photos" | "noPhotos";
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
  patrolRequestId?: string;
  employee: string;
  employeeId: string;
  routeId?: string;
  route: string;
  zone: string;
  shift: "День" | "Ночь";
  currentPoint: string;
  status: "В пути" | "Задержка" | "Нет связи" | "Завершает" | "Ожидает" | "Запланирован" | "Завершено" | "Отменено";
  progress: number;
  eta: string;
  deviation: string;
  plannedAt?: string;
  plannedAtIso?: string;
  startedAt?: string;
  startedAtIso?: string;
  finishedAt?: string;
  finishedAtIso?: string;
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

export interface PatrolCompletionPhotoPayload {
  fileName: string;
  contentType: string;
  dataBase64: string;
}

export interface PatrolResultAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  downloadUrl: string;
}

export interface PatrolResult {
  id: string;
  assignmentId?: string;
  status: "Подтверждено" | "Замечание" | "Просрочено" | "Не подтверждено";
  point: string;
  pointId: string;
  employee: string;
  employeeId: string;
  routeId?: string;
  route: string;
  territory: string;
  shift: "День" | "Ночь";
  plannedAt: string;
  actualAt: string;
  startedAt?: string;
  finishedAt?: string;
  deviation: string;
  comment: string;
  photos: number;
  issueType: string;
  severity: "Низкая" | "Средняя" | "Высокая" | "-";
  chronology: string[];
  source?: "mobile" | "web";
  attachments?: PatrolResultAttachment[];
}

export interface ServiceRequest {
  id: string;
  assignmentId?: string;
  requestKind: "patrol-assignment";
  title: string;
  status: "Новая" | "В работе" | "Назначена" | "Закрыта";
  priority: "Низкий" | "Средний" | "Высокий" | "Критический";
  sourceResultId: string;
  source: string;
  employeeId?: string;
  routeId?: string;
  route: string;
  point: string;
  employee: string;
  scheduledDate: string;
  scheduledTime: string;
  shift?: string;
  notifyEmployee: boolean;
  notificationText: string;
  createdAt: string;
  dueAt: string;
  responsible: string;
  description: string;
  timeline: string[];
}

export interface CreateServiceRequestPayload {
  sourceResultId?: string;
  employeeId?: string;
  employee: string;
  routeId?: string;
  route: string;
  scheduledDate: string;
  scheduledTime: string;
  plannedAt?: string;
  shift?: string;
  notifyEmployee: boolean;
  notificationText: string;
  description: string;
}

export interface CreateAssignmentPayload {
  patrolRequestId?: string;
  employeeId?: string;
  employeeName?: string;
  routeId?: string;
  routeName?: string;
  plannedAt?: string;
  plannedEndAt?: string;
  priority?: "high" | "medium" | "low";
  shift?: string;
  notifyEmployee?: boolean;
  notificationText?: string;
  comment?: string;
}

export interface CompleteAssignmentPayload {
  actualAt?: string;
  status?: "Подтверждено" | "Замечание" | "Просрочено" | "Не подтверждено";
  routePointId?: string;
  comment?: string;
  issueType?: string;
  severity?: "Низкая" | "Средняя" | "Высокая" | "-";
  photos?: number;
  pointResults?: CompleteAssignmentPointPayload[];
  photoAttachments?: PatrolCompletionPhotoPayload[];
}

export interface CompleteAssignmentPointPayload {
  routePointId: string;
  status?: string;
  comment?: string;
  issueType?: string;
  severity?: string;
  photos?: number;
  photoAttachments?: PatrolCompletionPhotoPayload[];
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
  employeeGroup: string;
  birthDate: string;
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
  employeeGroup: string;
  hiredAt: string;
  birthDate: string;
  status: EmployeeDirectoryItem["status"];
  shift: string;
  hasMobileAccount: boolean;
}

export interface SiteUser {
  id: string;
  login: string;
  fullName: string;
  role: "Администратор" | "Оператор" | "Оператор ЭМУ" | "Руководитель" | "Аудитор";
  status: "Активен" | "Неактивен" | "Заблокирован";
  lastLogin: string;
  createdAt: string;
  access: string[];
  directPermissions?: string[];
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
  passwordState: string;
  employee: string;
  employeeScope: "selected" | "all";
  boundEmployeeIds: string[];
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
  password?: string;
  confirmPassword?: string;
  status?: MobileAccount["status"];
  language?: string;
  requirePasswordChange?: boolean;
  restrictToLinkedDevices?: boolean;
}

export interface UpdateMobileAccountPayload {
  login: string;
  role: string;
  status: MobileAccount["status"];
  password?: string;
  confirmPassword?: string;
}

export interface MobileAccountSession {
  id: string;
  accountId: string;
  status: string;
  deviceId: string;
  device: string;
  platform: string;
  appVersion: string;
  ipAddress: string;
  lastSeenAt: string;
  startedAt: string;
  endedAt?: string | null;
}

export interface MobileAccountSecurityEvent {
  id: string;
  accountId: string;
  eventType: string;
  message: string;
  createdAt: string;
  actor: string;
}

export interface MobileSyncConflict {
  clientOperationId: string;
  mobileAccountId: string;
  accountLogin: string;
  commandType: string;
  entityType: string;
  entityServerId?: string | null;
  message: string;
  payloadSnapshot?: unknown;
  responseSnapshot?: unknown;
  createdAtServer: string;
  status: "open" | "accepted" | "rejected" | "repeatRequested" | string;
  attemptCount?: number;
  operationStatus?: string;
  resolutionComment?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
}

export interface MobileDeviceHealth {
  mobileAccountId: string;
  login: string;
  deviceId?: string | null;
  deviceName?: string | null;
  appVersion?: string | null;
  lastSeenAt?: string | null;
  pushStatus: string;
  pendingOutboxCount: number;
  staleOutboxCount: number;
  lastError?: string | null;
}

export interface RoutePoint {
  id: string;
  order: number;
  name: string;
  zone: string;
  type: "NFC" | "QR-код" | "Ручной контроль";
  tag: string;
  description: string;
  instruction: string;
  interval: string;
  expectedTime: string;
  status: "Активна" | "Повтор метки" | "Черновик";
  nfcCode?: string;
  requiresPhoto: boolean;
}

export interface RouteDirectoryItem {
  id: string;
  versionNo?: number;
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
  description: string;
  instruction: string;
  interval: string;
  expectedTime: string;
  status: RoutePoint["status"];
}

export interface ScheduleCell {
  id: string;
  assignmentId?: string;
  requestId?: string;
  employee: string;
  employeeId: string;
  shift: "Дневная" | "Ночная";
  day: string;
  date: string;
  route: string;
  routeId?: string;
  zone: string;
  state: "planned" | "alternate" | "transfer" | "vacation" | "sick" | "empty";
  scheduledTime?: string;
  notificationText?: string;
  notifyEmployee?: boolean;
}
