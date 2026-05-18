export interface DashboardSummaryDto {
  activePatrols: number;
  delayedPatrols: number;
  issues: number;
  shiftCoveragePercent: number;
  completedPoints: number;
  totalPoints: number;
  onlineEmployees: number;
  totalEmployees: number;
}

export interface AssignmentDto {
  id: string;
  employeeName: string;
  routeName: string;
  shift: string;
  status: string;
  progressPercent: number;
  eta: string;
}

export interface RouteDto {
  id: string;
  name: string;
  description: string;
  territory: string;
  status: string;
  duration: string;
  distance: string;
  periodicity: string;
  versionNo: number;
  points: RoutePointDto[];
}

export interface RoutePointDto {
  id: string;
  sequenceNo: number;
  name: string;
  zone: string;
  type: string;
  tag: string;
  interval: string;
  expectedTime: string;
  status: string;
  nfcCode: string | null;
  isRequired: boolean;
  requiresPhoto: boolean;
}

export interface CreateRouteDto {
  name: string;
  description: string;
  territory: string;
  status: string;
  duration: string;
  distance: string;
  periodicity: string;
}

export type UpdateRouteDto = CreateRouteDto;

export interface CreateRoutePointDto {
  name: string;
  zone: string;
  type: string;
  tag: string;
  interval: string;
  expectedTime: string;
  status: string;
  requiresPhoto: boolean;
}

export type UpdateRoutePointDto = CreateRoutePointDto;

export interface ReorderRoutePointDto {
  sequenceNo: number;
}

export interface EmployeeDto {
  id: string;
  fullName: string;
  personnelNo: string;
  position: string;
  department: string;
  status: string;
  shift: string;
  hasMobileAccount: boolean;
  lastSeenAt: string;
}

export interface CreateEmployeeDto {
  fullName: string;
  personnelNo: string;
  position: string;
  department: string;
  status: string;
  shift: string;
  hasMobileAccount: boolean;
}

export type UpdateEmployeeDto = CreateEmployeeDto;

export interface MobileAccountDto {
  id: string;
  login: string;
  passwordState: string;
  employee: string;
  employeeScope: "selected" | "all";
  boundEmployeeIds: string[];
  boundEmployees: string[];
  role: string;
  status: string;
  session: string;
  lastSeen: string;
  device: string;
  version: string;
}

export interface MobileAccountCreatedDto {
  account: MobileAccountDto;
  temporaryPassword: string | null;
}

export interface CreateMobileAccountDto {
  employee?: string;
  employeeScope: "selected" | "all";
  login?: string;
  role: string;
  bindEmployee: boolean;
  restrictToBoundDevice: boolean;
  temporaryPassword: boolean;
}

export interface AttachMobileAccountEmployeeDto {
  employeeId?: string;
  employeeName?: string;
}

export interface ResetMobileAccountPasswordDto {
  temporaryPassword: string;
  resetAt: string;
}

export interface UpdateMobileAccountDto {
  login?: string;
  role?: string;
  status?: string;
}

export interface MobileAccountSessionDto {
  id: string;
  accountId: string;
  status: string;
  device: string;
  platform: string;
  appVersion: string;
  ipAddress: string;
  lastSeenAt: string;
}

export interface MobileAccountSecurityEventDto {
  id: string;
  accountId: string;
  eventType: string;
  message: string;
  createdAt: string;
  actor: string;
}

export interface PatrolRequestDto {
  id: string;
  number: string;
  employeeId: string | null;
  employeeName: string;
  routeId: string | null;
  routeName: string;
  scheduledDate: string;
  scheduledTime: string | null;
  notifyEmployee: boolean;
  notificationText: string;
  status: string;
  createdAt: string;
  description: string;
}

export interface CreatePatrolRequestDto {
  employeeName?: string;
  routeName?: string;
  employeeId?: string;
  routeId?: string;
  scheduledDate: string;
  scheduledTime?: string | null;
  notifyEmployee: boolean;
  notificationText?: string;
  description?: string;
}
