export type WorkTaskStatus =
  | "new"
  | "accepted"
  | "inProgress"
  | "paused"
  | "completedLocal"
  | "completedServer"
  | "cancelled"
  | "conflict";

export type WorkTaskDto = {
  taskId: string;
  title: string;
  status: WorkTaskStatus;
  plannedAt: string | null;
  revision: number;
  completedAtLocal: string | null;
  sectionId: string | null;
  sectionName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  createdAtLocal: string;
  syncStatus: string;
};

export type MobileEmployeeDto = {
  employeeId: string;
  fullName: string;
  position: string | null;
  department: string | null;
};

export type MobileEmuSectionDto = {
  sectionId: string;
  name: string;
  sortOrder: number;
};
