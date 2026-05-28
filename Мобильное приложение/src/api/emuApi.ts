import { mobileRequest } from "@/api/httpClient";
import { WorkTaskDto } from "@/domain/emu/emuTypes";

export function getWorkTasks() {
  return mobileRequest<WorkTaskDto[]>("/api/v1/mobile/work-tasks");
}
