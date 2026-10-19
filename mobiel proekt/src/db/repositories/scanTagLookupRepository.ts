import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import { getDatabase } from "@/db/database";
import { getNfcCodeCandidates } from "@/services/nfcService";
import { normalizeQrValue } from "@/services/qrScannerService";

export type ScanTagOwner =
  | { kind: "routePoint"; point: { pointId: string; name: string; orderIndex: number } }
  | { kind: "otherRoute"; routeName: string | null }
  | { kind: "unknown" };

type PointCodeRow = {
  assignmentId: string;
  pointId: string;
  name: string;
  orderIndex: number;
  nfcUidHash: string | null;
  qrCodeHash: string | null;
  routeName: string | null;
};

/**
 * Read-only explanation for a code the scan did not accept: which point of the open
 * route carries it, or whether another of this owner's routes on the phone does.
 * Never writes, so asking cannot confirm any point.
 */
export async function findScanTagOwner(assignmentId: string, method: "nfc" | "qr", codes: string[]): Promise<ScanTagOwner> {
  const ownerUserId = await getStoredOwnerUserId();
  const matches = createCodeMatcher(method, codes);
  if (!ownerUserId || !matches) {
    return { kind: "unknown" };
  }

  const db = await getDatabase();
  const rows = await db.getAllAsync<PointCodeRow>(
    `
      SELECT
        assignment.assignment_id AS assignmentId,
        point.point_id AS pointId,
        point.name,
        point.order_index AS orderIndex,
        point.nfc_uid_hash AS nfcUidHash,
        point.qr_code_hash AS qrCodeHash,
        NULLIF(COALESCE(route.name, request.route_name, ''), '') AS routeName
      FROM patrol_assignments assignment
      JOIN assignment_route_points point
        ON point.assignment_id = assignment.assignment_id
       AND point.route_id = assignment.route_id
      LEFT JOIN routes route ON route.route_id = assignment.route_id
      LEFT JOIN patrol_request_board request ON request.request_id = assignment.request_id
      WHERE assignment.owner_user_id = ?
        AND assignment.contour_id = ?
      ORDER BY CASE WHEN assignment.assignment_id = ? THEN 0 ELSE 1 END, point.order_index ASC
    `,
    [ownerUserId, currentContourId, assignmentId]
  );

  const own = rows.find((row) => row.assignmentId === assignmentId && matches(row));
  if (own) {
    return { kind: "routePoint", point: { pointId: own.pointId, name: own.name, orderIndex: own.orderIndex } };
  }

  const foreign = rows.find((row) => row.assignmentId !== assignmentId && matches(row));
  if (foreign) {
    return { kind: "otherRoute", routeName: foreign.routeName };
  }

  return { kind: "unknown" };
}

function createCodeMatcher(method: "nfc" | "qr", codes: string[]) {
  if (method === "qr") {
    const scanned = new Set(codes.map(normalizeQrValue).filter(Boolean));
    if (scanned.size === 0) return null;
    return (row: PointCodeRow) => !!row.qrCodeHash && scanned.has(normalizeQrValue(row.qrCodeHash));
  }

  const scanned = new Set(codes.flatMap(getNfcCodeCandidates));
  if (scanned.size === 0) return null;
  return (row: PointCodeRow) => !!row.nfcUidHash && getNfcCodeCandidates(row.nfcUidHash).some((candidate) => scanned.has(candidate));
}
