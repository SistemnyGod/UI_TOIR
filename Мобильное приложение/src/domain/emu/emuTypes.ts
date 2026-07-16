export type WorkTaskStatus =
  | "available"
  | "assigned"
  | "new"
  | "accepted"
  | "inProgress"
  | "paused"
  | "completedLocal"
  | "completedServer"
  | "cancelled"
  | "conflict";

export type WorkParticipantDto = {
  employeeId: string;
  fullName: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  isCurrentMobileEmployee: boolean;
};

export type WorkItemCapabilitiesDto = {
  canStart: boolean;
  canJoin: boolean;
  canReplace: boolean;
  canPause: boolean;
  canResume: boolean;
  canComplete: boolean;
};

export type WorkAttachmentDto = {
  fileId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
};

export type WorkItemDto = {
  taskId: string;
  itemId: string;
  kind: "planTask" | "workSession";
  workSessionId: string | null;
  planTaskId: string | null;
  description: string;
  title: string;
  sectionId: string | null;
  sectionName: string;
  plannedAt: string | null;
  status: WorkTaskStatus;
  approvalStatus: string;
  revision: number;
  source: "mobile" | "web" | string;
  assignedEmployees: WorkParticipantDto[];
  actualParticipants: WorkParticipantDto[];
  attachments: WorkAttachmentDto[];
  localAttachmentCount?: number;
  localPhotoCount?: number;
  localVideoCount?: number;
  capabilities: WorkItemCapabilitiesDto;
  employeeId: string | null;
  employeeName: string | null;
  createdAtLocal: string;
  completedAtLocal: string | null;
  syncStatus: string;
};

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
