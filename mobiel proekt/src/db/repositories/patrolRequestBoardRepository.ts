import { getStoredOwnerUserId } from "@/auth/tokenStorage";

import { getDatabase } from "@/db/database";

import type { RequestBoardItem } from './patrolRepositoryTypes';
async function requireOwnerUserId() { const owner = await getStoredOwnerUserId(); if (!owner) throw new Error('Не удалось определить пользователя устройства.'); return owner; }

export async function listRequestBoard() {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();

  return db.getAllAsync<RequestBoardItem>(
    `
      SELECT
        request_id AS requestId,
        display_number AS displayNumber,
        route_id AS routeId,
        route_name AS routeName,
        planned_start_at AS plannedStartAt,
        assigned_full_name AS assignedFullName,
        assigned_employee_id AS assignedEmployeeId,
        performer_selection_available AS performerSelectionAvailable,
        status,
        revision
      FROM patrol_request_board
      WHERE owner_user_id = ?
      ORDER BY julianday(planned_start_at) DESC, request_id ASC
    `,
    [ownerUserId]
  );
}

export async function getRequestBoardItem(requestId: string) {
  const db = await getDatabase();
  const ownerUserId = await requireOwnerUserId();

  return db.getFirstAsync<RequestBoardItem>(
    `
      SELECT
        request_id AS requestId,
        display_number AS displayNumber,
        route_id AS routeId,
        route_name AS routeName,
        planned_start_at AS plannedStartAt,
        assigned_full_name AS assignedFullName,
        assigned_employee_id AS assignedEmployeeId,
        performer_selection_available AS performerSelectionAvailable,
        status,
        revision
      FROM patrol_request_board
      WHERE owner_user_id = ?
        AND request_id = ?
    `,
    [ownerUserId, requestId]
  );
}
