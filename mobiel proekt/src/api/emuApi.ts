import { mobileRequest } from "@/api/httpClient";
import { workItemListResponseSchema, workTaskListResponseSchema } from "@/api/schemas";
import { WorkTaskDto } from "@/domain/emu/emuTypes";
import type { z } from "zod";

type RawWorkItem = z.infer<typeof workItemListResponseSchema>[number];

export function getWorkTasks() {
  return mobileRequest<WorkTaskDto[]>("/api/v1/mobile/work-tasks", workTaskListResponseSchema);
}

export function normalizeWorkItems(items: RawWorkItem[]) {
  return items.map((item) => {
    const currentEmployee = item.actualParticipants.find((employee) => employee.isCurrentMobileEmployee)
      ?? item.assignedEmployees.find((employee) => employee.isCurrentMobileEmployee)
      ?? null;
    return {
      ...item,
      updatedAt: item.updatedAt ?? item.plannedAt ?? new Date(0).toISOString(),
      attachments: item.attachments ?? [],
      taskId: item.workSessionId ?? item.itemId,
      employeeId: currentEmployee?.employeeId ?? null,
      employeeName: currentEmployee?.fullName ?? null,
      createdAtLocal: item.plannedAt ?? new Date().toISOString(),
      completedAtLocal: null,
      syncStatus: "synced"
    };
  });
}

export function getWorkItemsV2() {
  return mobileRequest("/api/v2/mobile/work-items", workItemListResponseSchema).then(normalizeWorkItems);
}
