import { z } from "zod";
import { mobileRequest } from "@/api/httpClient";
import type { TransferCandidate } from "@/domain/patrol/patrolTransferPolicy";

const candidateSchema = z.object({
  employeeId: z.string().min(1),
  fullName: z.string(),
  position: z.string().nullable().optional(),
  sameAccount: z.boolean(),
  hasPatrolInProgress: z.boolean()
}).passthrough();

const candidatesSchema = z.array(candidateSchema);

/** Colleagues of the shift on every phone; requires a connection. */
export async function getPatrolTransferCandidates(): Promise<TransferCandidate[]> {
  const rows = await mobileRequest("/api/v1/mobile/patrol/transfer-candidates", candidatesSchema);
  return rows.map((row) => ({
    employeeId: row.employeeId,
    fullName: row.fullName,
    position: row.position ?? null,
    sameAccount: row.sameAccount,
    hasPatrolInProgress: row.hasPatrolInProgress
  }));
}
