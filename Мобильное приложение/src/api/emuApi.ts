import { mobileRequest } from "@/api/httpClient";
import { WorkItemDto, WorkTaskDto } from "@/domain/emu/emuTypes";

export function getWorkTasks() {
  return mobileRequest<WorkTaskDto[]>("/api/v1/mobile/work-tasks");
}

export function getWorkItemsV2() {
  return mobileRequest<WorkItemDto[]>("/api/v2/mobile/work-items").then((items) => items.map((item) => {
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
