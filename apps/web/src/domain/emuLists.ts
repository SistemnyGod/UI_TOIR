import type { EmuListResponseDto } from "../api/contracts";

export function toEmuList<T>(rows: T[], total: number, page = 1, pageSize = 100): EmuListResponseDto<T> {
  const safePageSize = Math.max(1, pageSize);
  return { page, pageCount: Math.max(1, Math.ceil(total / safePageSize)), pageSize: safePageSize, rows, total };
}
