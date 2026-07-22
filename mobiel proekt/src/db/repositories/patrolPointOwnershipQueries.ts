export const listAssignmentPointsOwnedSql = `
  SELECT
    point.point_id AS pointId,
    point.route_id AS routeId,
    point.name,
    point.description,
    point.instruction,
    point.order_index AS orderIndex,
    point.required AS required,
    point.requires_photo AS requiresPhoto,
    COALESCE(result.status, 'pending') AS status,
    result.comment AS comment,
    result.issue_type_id AS issueTypeId,
    result.confirmation_type AS confirmationType,
    result.photo_client_file_ids_json AS photoClientFileIdsJson
  FROM patrol_assignments assignment
  JOIN assignment_route_points point ON point.assignment_id = assignment.assignment_id
  LEFT JOIN point_results result
    ON result.owner_user_id = assignment.owner_user_id
   AND result.contour_id = assignment.contour_id
   AND result.assignment_id = assignment.assignment_id
   AND result.point_id = point.point_id
  WHERE assignment.assignment_id = ?
    AND assignment.owner_user_id = ?
    AND assignment.contour_id = ?
  ORDER BY point.order_index ASC
`;

export const getPointForFillOwnedSql = `
  SELECT
    assignment.assignment_id AS assignmentId,
    point.point_id AS pointId,
    point.route_id AS routeId,
    point.name,
    point.description,
    point.instruction,
    point.order_index AS orderIndex,
    point.required AS required,
    point.requires_photo AS requiresPhoto,
    point.nfc_uid_hash AS nfcUidHash,
    point.qr_code_hash AS qrCodeHash,
    result.status AS status,
    result.comment AS comment,
    result.confirmation_type AS confirmationType,
    result.scanned_at_local AS scannedAtLocal,
    result.completed_at_local AS completedAtLocal,
    result.issue_type_id AS issueTypeId,
    result.deferred_reason AS deferredReason,
    result.photo_client_file_ids_json AS photoClientFileIdsJson
  FROM patrol_assignments assignment
  JOIN assignment_route_points point ON point.assignment_id = assignment.assignment_id
  LEFT JOIN point_results result
    ON result.owner_user_id = assignment.owner_user_id
   AND result.contour_id = assignment.contour_id
   AND result.assignment_id = assignment.assignment_id
   AND result.point_id = point.point_id
  WHERE assignment.assignment_id = ?
    AND point.point_id = ?
    AND assignment.owner_user_id = ?
    AND assignment.contour_id = ?
  LIMIT 1
`;
