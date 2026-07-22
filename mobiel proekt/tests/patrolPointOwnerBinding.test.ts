import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  getPointForFillOwnedSql,
  listAssignmentPointsOwnedSql
} from "../src/db/repositories/patrolPointOwnershipQueries.ts";

test("point metadata and results are hidden from another local owner", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE users (
      server_user_id TEXT PRIMARY KEY,
      contour_id TEXT NOT NULL
    );
    CREATE TABLE patrol_assignments (
      assignment_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      contour_id TEXT NOT NULL
    );
    CREATE TABLE assignment_route_points (
      assignment_id TEXT NOT NULL,
      point_id TEXT NOT NULL,
      route_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      instruction TEXT,
      order_index INTEGER NOT NULL,
      required INTEGER NOT NULL,
      requires_photo INTEGER NOT NULL,
      nfc_uid_hash TEXT,
      qr_code_hash TEXT
    );
    CREATE TABLE point_results (
      owner_user_id TEXT NOT NULL,
      contour_id TEXT NOT NULL,
      assignment_id TEXT NOT NULL,
      point_id TEXT NOT NULL,
      status TEXT,
      comment TEXT,
      issue_type_id TEXT,
      confirmation_type TEXT,
      scanned_at_local TEXT,
      completed_at_local TEXT,
      deferred_reason TEXT,
      photo_client_file_ids_json TEXT
    );

    INSERT INTO users VALUES ('user-a', 'patrol360-test');
    INSERT INTO users VALUES ('user-b', 'patrol360-test');
    INSERT INTO patrol_assignments VALUES ('assignment-a', 'user-a', 'patrol360-test');
    INSERT INTO assignment_route_points VALUES (
      'assignment-a', 'point-a', 'route-a', '???????? ?????', 'metadata', 'instruction',
      1, 1, 0, 'nfc-secret', 'qr-secret'
    );
    INSERT INTO point_results VALUES (
      'user-a', 'patrol360-test', 'assignment-a', 'point-a', 'issue', 'private result',
      'issue-a', 'nfc', '2026-07-22T10:00:00Z', '2026-07-22T10:01:00Z', NULL, '[]'
    );
  `);

  const ownList = db.prepare(listAssignmentPointsOwnedSql).all("assignment-a", "user-a", "patrol360-test");
  const foreignList = db.prepare(listAssignmentPointsOwnedSql).all("assignment-a", "user-b", "patrol360-test");
  const foreignPoint = db.prepare(getPointForFillOwnedSql).get("assignment-a", "point-a", "user-b", "patrol360-test");

  assert.equal(ownList.length, 1, "fixture must be readable by its owner");
  assert.deepEqual(foreignList, []);
  assert.equal(foreignPoint, undefined);

  db.close();
});
