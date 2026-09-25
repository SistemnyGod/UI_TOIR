import type { PpeIssueDocumentSummaryDto } from "./contracts";

export type PpeIssueJournalQuery = { employeeId?: string; query?: string; department?: string; from?: string; to?: string; status?: string; page?: number; pageSize?: number };
export type PpeIssueJournalPage = {
  items: PpeIssueDocumentSummaryDto[]; total: number; page: number; pageSize: number; pageCount: number;
  summary: { total: number; confirmed: number; draft: number; cancelled: number; overdue: number };
  departments: string[];
};
