import { ApiClient } from "../api/client";
import type { EmuCreateShiftReportDto, EmuShiftReportDetailDto, EmuShiftReportListResponseDto, EmuShiftReportOptionsDto, EmuShiftReportQuery } from "../api/emuShiftReportContracts";

function queryString(params: EmuShiftReportQuery) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") query.set(key, String(value)); });
  const value = query.toString();
  return value ? `?${value}` : "";
}

export function createEmuShiftReportsRepository({ baseUrl }: { baseUrl?: string } = {}) {
  const client = new ApiClient({ baseUrl });
  return {
    getOptions: () => client.get<EmuShiftReportOptionsDto>("/api/v1/emu/shift-reports/options"),
    create: (payload: EmuCreateShiftReportDto) => client.post<EmuShiftReportDetailDto, EmuCreateShiftReportDto>("/api/v1/emu/shift-reports", payload),
    getList: (params: EmuShiftReportQuery) => client.get<EmuShiftReportListResponseDto>(`/api/v1/emu/shift-reports${queryString(params)}`),
    getDetail: (id: string) => client.get<EmuShiftReportDetailDto>(`/api/v1/emu/shift-reports/${id}`),
  };
}
