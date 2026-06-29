import { ApiClient } from "../api/client";
import type {
  EmuAddFavoriteEmployeeDto,
  EmuAddWorkSessionEmployeeDto,
  EmuApprovePlanTaskDto,
  EmuApproveWeekDto,
  EmuAuditEventDto,
  EmuCompleteWorkSessionDto,
  EmuCarryOverWorkSessionDto,
  EmuCreateReferenceDto,
  EmuCreateWorkSessionDto,
  EmuCreateWorkTemplateDto,
  EmuDashboardDto,
  EmuDecisionDto,
  EmuDeleteWorkSessionDto,
  EmuFavoriteEmployeeDto,
  EmuFinishWorkSessionEmployeeDto,
  EmuEmployeeShiftDto,
  EmuEmployeeMonthSummaryDto,
  EmuEmployeeShiftSummaryDto,
  EmuEmployeeWorkHistoryReportDto,
  EmuListResponseDto,
  EmuMarkMistakenWorkSessionEmployeeDto,
  EmuPauseWorkSessionDto,
  EmuPlanTaskChangesDto,
  EmuPlanTaskDto,
  EmuReferenceDto,
  EmuResolveDecisionDto,
  EmuReschedulePlanTaskDto,
  EmuResumeWorkSessionDto,
  EmuSettingsDto,
  EmuShiftTemplateDto,
  EmuUpdateEmployeeShiftDto,
  EmuUpdateReferenceDto,
  EmuUpdateWorkSessionDto,
  EmuUpdateWorkTemplateDto,
  EmuUpsertPlanTaskDto,
  EmuWorkSessionChangesDto,
  EmuWorkSessionDto,
  EmuWorkHistoryReportDto,
  EmuWorkTemplateDto,
} from "../api/contracts";

export type EmuWorkSessionParams = {
  dateFrom?: string;
  dateTo?: string;
  employeeSearch?: string;
  employeeId?: string;
  includeDeleted?: boolean;
  manualCorrectionsOnly?: boolean;
  notCompletedReasonId?: string;
  operationalStatus?: string;
  page?: number;
  pageSize?: number;
  problemOnly?: boolean;
  resultStatus?: string;
  sectionId?: string;
  shiftType?: "day" | "night" | "";
  sortBy?: string;
  status?: string;
  waitReasonId?: string;
};

export type EmuDecisionParams = {
  date?: string;
  employeeId?: string;
  status?: string;
};

export function createEmuRepository({ baseUrl }: { baseUrl?: string } = {}) {
  const client = new ApiClient({ baseUrl });

  return {
    getDashboard() {
      return client.get<EmuDashboardDto>("/api/v1/emu/dashboard");
    },

    getSettings() {
      return client.get<EmuSettingsDto>("/api/v1/emu/settings");
    },

    createSection(payload: EmuCreateReferenceDto) {
      return client.post<EmuReferenceDto, EmuCreateReferenceDto>("/api/v1/emu/sections", payload);
    },

    updateSection(id: string, payload: EmuUpdateReferenceDto) {
      return client.patch<EmuReferenceDto, EmuUpdateReferenceDto>(`/api/v1/emu/sections/${id}`, payload);
    },

    createWaitReason(payload: EmuCreateReferenceDto) {
      return client.post<EmuReferenceDto, EmuCreateReferenceDto>("/api/v1/emu/wait-reasons", payload);
    },

    updateWaitReason(id: string, payload: EmuUpdateReferenceDto) {
      return client.patch<EmuReferenceDto, EmuUpdateReferenceDto>(`/api/v1/emu/wait-reasons/${id}`, payload);
    },

    createNotCompletedReason(payload: EmuCreateReferenceDto) {
      return client.post<EmuReferenceDto, EmuCreateReferenceDto>("/api/v1/emu/not-completed-reasons", payload);
    },

    updateNotCompletedReason(id: string, payload: EmuUpdateReferenceDto) {
      return client.patch<EmuReferenceDto, EmuUpdateReferenceDto>(`/api/v1/emu/not-completed-reasons/${id}`, payload);
    },

    createWorkTemplate(payload: EmuCreateWorkTemplateDto) {
      return client.post<EmuWorkTemplateDto, EmuCreateWorkTemplateDto>("/api/v1/emu/work-templates", payload);
    },

    updateWorkTemplate(id: string, payload: EmuUpdateWorkTemplateDto) {
      return client.patch<EmuWorkTemplateDto, EmuUpdateWorkTemplateDto>(`/api/v1/emu/work-templates/${id}`, payload);
    },

    getFavoriteEmployees() {
      return client.get<EmuFavoriteEmployeeDto[]>("/api/v1/emu/favorite-employees");
    },

    getShiftTemplates() {
      return client.get<EmuShiftTemplateDto[]>("/api/v1/emu/shift-templates");
    },

    getEmployeeShifts(params: { date: string; employeeId?: string }) {
      return client.get<EmuEmployeeShiftDto[]>(`/api/v1/emu/employee-shifts${toQueryString(params)}`);
    },

    getEmployeeShiftSummary(employeeId: string, date: string) {
      return client.get<EmuEmployeeShiftSummaryDto>(`/api/v1/emu/employees/${employeeId}/shift-summary${toQueryString({ date })}`);
    },

    getEmployeeMonthSummary(employeeId: string, month: string) {
      return client.get<EmuEmployeeMonthSummaryDto>(`/api/v1/emu/employees/${employeeId}/month-summary${toQueryString({ month })}`);
    },

    updateEmployeeShift(id: string, payload: EmuUpdateEmployeeShiftDto) {
      return client.patch<EmuEmployeeShiftDto, EmuUpdateEmployeeShiftDto>(`/api/v1/emu/employee-shifts/${id}`, payload);
    },

    getDecisions(params: EmuDecisionParams = {}) {
      return client.get<EmuDecisionDto[]>(`/api/v1/emu/decisions${toQueryString(params)}`);
    },

    resolveDecision(id: string, payload: EmuResolveDecisionDto) {
      return client.post<EmuDecisionDto, EmuResolveDecisionDto>(`/api/v1/emu/decisions/${id}/resolve`, payload);
    },

    addFavoriteEmployee(payload: EmuAddFavoriteEmployeeDto) {
      return client.post<EmuFavoriteEmployeeDto, EmuAddFavoriteEmployeeDto>("/api/v1/emu/favorite-employees", payload);
    },

    removeFavoriteEmployee(employeeId: string) {
      return client.delete<EmuFavoriteEmployeeDto>(`/api/v1/emu/favorite-employees/${employeeId}`);
    },

    getWorkSessions(params: EmuWorkSessionParams = {}) {
      return client.get<EmuListResponseDto<EmuWorkSessionDto>>(`/api/v1/emu/work-sessions${toQueryString(params)}`);
    },

    getWorkHistoryReport(params: EmuWorkSessionParams = {}) {
      return client.get<EmuWorkHistoryReportDto>(`/api/v1/emu/reports/work-history${toQueryString(params)}`);
    },

    getEmployeeWorkHistoryReport(employeeId: string, params: EmuWorkSessionParams = {}) {
      return client.get<EmuEmployeeWorkHistoryReportDto>(`/api/v1/emu/reports/work-history/employees/${employeeId}${toQueryString(params)}`);
    },

    exportWorkSessions(params: EmuWorkSessionParams = {}) {
      return client.download(`/api/v1/emu/work-sessions/export${toQueryString(params)}`);
    },

    getWorkSessionChanges(since: string) {
      return client.get<EmuWorkSessionChangesDto>(`/api/v1/emu/work-sessions/changes${toQueryString({ since })}`);
    },

    getWorkSession(id: string) {
      return client.get<EmuWorkSessionDto>(`/api/v1/emu/work-sessions/${id}`);
    },

    createWorkSession(payload: EmuCreateWorkSessionDto) {
      return client.post<EmuWorkSessionDto, EmuCreateWorkSessionDto>("/api/v1/emu/work-sessions", payload);
    },

    updateWorkSession(id: string, payload: EmuUpdateWorkSessionDto) {
      return client.patch<EmuWorkSessionDto, EmuUpdateWorkSessionDto>(`/api/v1/emu/work-sessions/${id}`, payload);
    },

    addWorkSessionEmployee(id: string, payload: EmuAddWorkSessionEmployeeDto) {
      return client.post<EmuWorkSessionDto, EmuAddWorkSessionEmployeeDto>(`/api/v1/emu/work-sessions/${id}/employees`, payload);
    },

    deleteWorkSession(id: string, payload: EmuDeleteWorkSessionDto) {
      return client.delete<EmuWorkSessionDto, EmuDeleteWorkSessionDto>(`/api/v1/emu/work-sessions/${id}`, payload);
    },

    pauseWorkSession(id: string, payload: EmuPauseWorkSessionDto) {
      return client.post<EmuWorkSessionDto, EmuPauseWorkSessionDto>(`/api/v1/emu/work-sessions/${id}/pause`, payload);
    },

    resumeWorkSession(id: string, payload: EmuResumeWorkSessionDto) {
      return client.post<EmuWorkSessionDto, EmuResumeWorkSessionDto>(`/api/v1/emu/work-sessions/${id}/resume`, payload);
    },

    completeWorkSession(id: string, payload: EmuCompleteWorkSessionDto) {
      return client.post<EmuWorkSessionDto, EmuCompleteWorkSessionDto>(`/api/v1/emu/work-sessions/${id}/complete`, payload);
    },

    carryOverWorkSession(id: string, payload: EmuCarryOverWorkSessionDto) {
      return client.post<EmuWorkSessionDto, EmuCarryOverWorkSessionDto>(`/api/v1/emu/work-sessions/${id}/carry-over`, payload);
    },

    finishWorkSessionEmployee(id: string, employeeId: string, payload: EmuFinishWorkSessionEmployeeDto) {
      return client.post<EmuWorkSessionDto, EmuFinishWorkSessionEmployeeDto>(`/api/v1/emu/work-sessions/${id}/employees/${employeeId}/finish`, payload);
    },

    markWorkSessionEmployeeMistaken(id: string, employeeId: string, payload: EmuMarkMistakenWorkSessionEmployeeDto) {
      return client.post<EmuWorkSessionDto, EmuMarkMistakenWorkSessionEmployeeDto>(`/api/v1/emu/work-sessions/${id}/employees/${employeeId}/mark-mistaken`, payload);
    },

    getWorkSessionAudit(id: string, params: { page?: number; pageSize?: number } = {}) {
      return client.get<EmuListResponseDto<EmuAuditEventDto>>(`/api/v1/emu/work-sessions/${id}/audit${toQueryString(params)}`);
    },

    getPlanTasks(weekStart?: string) {
      return client.get<EmuListResponseDto<EmuPlanTaskDto>>(`/api/v1/emu/plan-tasks${toQueryString({ weekStart })}`);
    },

    getPlanTaskChanges(since: string) {
      return client.get<EmuPlanTaskChangesDto>(`/api/v1/emu/plan-tasks/changes${toQueryString({ since })}`);
    },

    createPlanTask(payload: EmuUpsertPlanTaskDto) {
      return client.post<EmuPlanTaskDto, EmuUpsertPlanTaskDto>("/api/v1/emu/plan-tasks", payload);
    },

    updatePlanTask(id: string, payload: EmuUpsertPlanTaskDto) {
      return client.patch<EmuPlanTaskDto, EmuUpsertPlanTaskDto>(`/api/v1/emu/plan-tasks/${id}`, payload);
    },

    reschedulePlanTask(id: string, payload: EmuReschedulePlanTaskDto) {
      return client.post<EmuPlanTaskDto, EmuReschedulePlanTaskDto>(`/api/v1/emu/plan-tasks/${id}/reschedule`, payload);
    },

    approvePlanTask(id: string, payload: EmuApprovePlanTaskDto) {
      return client.post<EmuPlanTaskDto, EmuApprovePlanTaskDto>(`/api/v1/emu/plan-tasks/${id}/approve`, payload);
    },

    approveWeek(payload: EmuApproveWeekDto) {
      return client.post<EmuPlanTaskDto[], EmuApproveWeekDto>("/api/v1/emu/plan-tasks/approve-week", payload);
    },
  };
}

function toQueryString(params: Record<string, unknown>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      query.set(key, String(value));
    }
  }

  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}
