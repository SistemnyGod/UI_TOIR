import type { LocalMobileFile } from "./fileTypes";

export function canReclaimLocalMedia(status: LocalMobileFile["status"]) {
  return status === "linked";
}
