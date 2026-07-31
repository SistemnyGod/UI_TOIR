import type { EmuShiftReportCategory, EmuShiftType } from '../../../api/emuShiftReportContracts';
import { createClientUuid } from '../../../shared/clientUuid';

export type WorkRow = {
  id: string;
  description: string;
  hours: string;
  minutes: string;
  sectionId: string;
  note: string;
};

export const draftPrefix = 'patrol360.emu.shift-report.draft.v1';
export const categoryLabels: Record<EmuShiftReportCategory, string> = {
  mechanic: 'Слесари',
  electrician: 'Электрики',
};
export const shiftLabels: Record<EmuShiftType, string> = {
  day: 'Дневная',
  night: 'Ночная',
};

export function createWorkRow(): WorkRow {
  return {
    id: createClientUuid(),
    description: '',
    hours: '',
    minutes: '',
    sectionId: '',
    note: '',
  };
}

export function createEmptyRows() {
  return Array.from({ length: 5 }, createWorkRow);
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getDurationMinutes(value: WorkRow) {
  return (Number(value.hours) || 0) * 60 + (Number(value.minutes) || 0);
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} ч` : '', rest ? `${rest} мин` : ''].filter(Boolean).join(' ') || '0 мин';
}

export function isWorkRowUsed(value: WorkRow) {
  return Boolean(value.description.trim() || value.hours || value.minutes || value.sectionId || value.note.trim());
}

export function getDraftKey(category: EmuShiftReportCategory, employeeId: string, reportDate: string, shiftType: EmuShiftType, userId?: string) {
  const ownerPrefix = userId ? `${draftPrefix}.user.${userId}` : draftPrefix;
  return `${ownerPrefix}.${category}.${employeeId || '_'}.${reportDate}.${shiftType}`;
}
