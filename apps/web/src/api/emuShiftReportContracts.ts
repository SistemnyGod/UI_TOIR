export type EmuShiftType = "day" | "night";
export type EmuShiftReportCategory = "mechanic" | "electrician";

export interface EmuShiftReportEmployeeOptionDto { id: string; fullName: string; personnelNo: string; position: string; department: string; workerCategory: EmuShiftReportCategory; }
export interface EmuShiftReportSectionDto { id: string; name: string; code: string; isActive: boolean; sortOrder: number; }
export interface EmuShiftReportShiftOptionDto { shiftType: EmuShiftType; name: string; startTime: string; endTime: string; crossesMidnight: boolean; }
export interface EmuShiftReportOptionsDto { employees: EmuShiftReportEmployeeOptionDto[]; sections: EmuShiftReportSectionDto[]; shifts: EmuShiftReportShiftOptionDto[]; }
export interface EmuCreateShiftReportLineDto { workDescription: string; durationMinutes: number; sectionId?: string | null; note?: string | null; }
export interface EmuCreateShiftReportDto { reportDate: string; shiftType: EmuShiftType; workerCategory: EmuShiftReportCategory; employeeId: string; lines: EmuCreateShiftReportLineDto[]; }
export interface EmuShiftReportLineDto extends EmuCreateShiftReportLineDto { id: string; sequenceNo: number; sectionName: string; }
export interface EmuShiftReportSummaryDto { id: string; reportDate: string; shiftType: EmuShiftType; workerCategory: EmuShiftReportCategory; employeeId: string; employeeName: string; personnelNo: string; position: string; department: string; status: string; workCount: number; totalDurationMinutes: number; createdByUserId: string | null; createdByName: string; submittedAt: string; }
export interface EmuShiftReportDetailDto extends EmuShiftReportSummaryDto { lines: EmuShiftReportLineDto[]; }
export interface EmuShiftReportListResponseDto { rows: EmuShiftReportSummaryDto[]; total: number; page: number; pageSize: number; pageCount: number; }
export interface EmuShiftReportQuery { date?: string; shiftType?: EmuShiftType | ""; workerCategory?: EmuShiftReportCategory | ""; employeeId?: string; search?: string; page?: number; pageSize?: number; }
