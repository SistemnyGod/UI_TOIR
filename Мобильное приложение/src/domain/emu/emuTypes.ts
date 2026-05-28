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
};
