import { ApiClient } from "../api/client";
import type { ApiRequestOptions } from "../api/client";
import type { EmuAddFavoriteEmployeeDto, EmuFavoriteEmployeeDto } from "../api/contracts";
import type { EmuCreateShiftReportDto, EmuSetShiftReportEmployeeCategoryDto, EmuShiftReportDetailDto, EmuShiftReportEmployeeOptionDto, EmuShiftReportListResponseDto, EmuShiftReportOptionsDto, EmuShiftReportQuery } from "../api/emuShiftReportContracts";

function queryString(params: EmuShiftReportQuery) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "" && value !== false) query.set(key, String(value)); });
  const value = query.toString();
  return value ? `?${value}` : "";
}

export function createEmuShiftReportsRepository({ baseUrl }: { baseUrl?: string } = {}) {
  const client = new ApiClient({ baseUrl });
  return {
    getOptions: () => client.get<EmuShiftReportOptionsDto>("/api/v1/emu/shift-reports/options"),
    getFavoriteEmployees: () => client.get<EmuFavoriteEmployeeDto[]>("/api/v1/emu/favorite-employees"),
    setEmployeeCategory: (employeeId: string, payload: EmuSetShiftReportEmployeeCategoryDto) => client.put<EmuShiftReportEmployeeOptionDto, EmuSetShiftReportEmployeeCategoryDto>(`/api/v1/emu/shift-reports/employee-categories/${employeeId}`, payload),
    addFavoriteEmployee: (payload: EmuAddFavoriteEmployeeDto) => client.post<EmuFavoriteEmployeeDto, EmuAddFavoriteEmployeeDto>("/api/v1/emu/favorite-employees", payload),
    removeFavoriteEmployee: (employeeId: string) => client.delete<EmuFavoriteEmployeeDto>(`/api/v1/emu/favorite-employees/${employeeId}`),
    create: (payload: EmuCreateShiftReportDto) => client.post<EmuShiftReportDetailDto, EmuCreateShiftReportDto>("/api/v1/emu/shift-reports", payload),
    getList: (params: EmuShiftReportQuery, options?: ApiRequestOptions) => client.get<EmuShiftReportListResponseDto>(`/api/v1/emu/shift-reports${queryString(params)}`, options),
    getDetail: (id: string, options?: ApiRequestOptions) => client.get<EmuShiftReportDetailDto>(`/api/v1/emu/shift-reports/${id}`, options),
  };
}
