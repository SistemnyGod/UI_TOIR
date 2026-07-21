import * as Crypto from "expo-crypto";

import { currentContourId } from "@/core/environments";
import { getDatabase } from "@/db/database";

export async function enqueueLogoutIntent(ownerUserId: string | null) {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO mobile_logout_queue (id, owner_user_id, contour_id, created_at_local, status) " +
    "VALUES (?, ?, ?, ?, 'pending')",
    [Crypto.randomUUID(), ownerUserId, currentContourId, new Date().toISOString()]
  );
}

export async function getPendingLogoutContourId(): Promise<string | null | undefined> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ contour_id: string | null }>(
    "SELECT contour_id FROM mobile_logout_queue WHERE status = 'pending' ORDER BY created_at_local ASC LIMIT 1"
  );
  return row === null ? undefined : row.contour_id;
}

export async function hasPendingLogoutIntent() {
  return (await getPendingLogoutContourId()) === currentContourId;
}

export async function completePendingLogoutIntents() {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM mobile_logout_queue WHERE contour_id = ? AND status = 'pending'",
    [currentContourId]
  );
}
