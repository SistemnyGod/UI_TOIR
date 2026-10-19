import type { EmuAuditEventDto, EmuListResponseDto } from "../api/contracts";
import { toEmuList } from "./emuLists";

export function pageEmuWorkAudit(events: EmuAuditEventDto[], workId: string, params: { page?: number; pageSize?: number } = {}): EmuListResponseDto<EmuAuditEventDto> {
  const rows = events.filter(event => event.workSessionId === workId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? Math.max(1, rows.length);
  return toEmuList(rows.slice((page - 1) * pageSize, page * pageSize), rows.length, page, pageSize);
}
