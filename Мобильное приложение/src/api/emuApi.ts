import { mobileRequest } from "@/api/httpClient";
import { workItemListResponseSchema, workTaskListResponseSchema } from "@/api/schemas";
import { WorkTaskDto } from "@/domain/emu/emuTypes";

export function getWorkTasks() {
  return mobileRequest<WorkTaskDto[]>("/api/v1/mobile/work-tasks", workTaskListResponseSchema);
}

export function getWorkItemsV2() {
  return mobileRequest("/api/v2/mobile/work-items", workItemListResponseSchema).then((items) => items.map((item) => {
    const currentEmployee = item.actualParticipants.find((employee) => employee.isCurrentMobileEmployee)
      ?? item.assignedEmployees.find((employee) => employee.isCurrentMobileEmployee)
      ?? null;
    return {
      ...item,
      attachments: item.attachments ?? [],
      taskId: item.workSessionId ?? item.itemId,
      employeeId: currentEmployee?.employeeId ?? null,
      employeeName: currentEmployee?.fullName ?? null,
      createdAtLocal: item.plannedAt ?? new Date().toISOString(),
      completedAtLocal: item.status === "completedServer" ? item.plannedAt : null,
      syncStatus: "synced"
    };
  }));
}
