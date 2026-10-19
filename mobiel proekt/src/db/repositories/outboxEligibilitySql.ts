// Both dispatch and retry scheduling must respect the same acknowledgement
// barriers. Otherwise a blocked command repeatedly wakes an idle sync worker.
// Callers use the fixed SQL alias `candidate`; no user values are interpolated.
export const outboxAcknowledgementBarriersSql = `
  AND NOT EXISTS (
    SELECT 1 FROM json_each(CASE WHEN json_valid(candidate.payload_json) THEN candidate.payload_json ELSE '{}' END, '$.dependencies') dependency
    WHERE NOT EXISTS (SELECT 1 FROM outbox_commands acknowledged
      WHERE acknowledged.owner_user_id = candidate.owner_user_id AND acknowledged.contour_id = candidate.contour_id
        AND acknowledged.client_operation_id = dependency.value
        AND acknowledged.status IN ('accepted', 'duplicate', 'superseded', 'cancelled', 'cancelledLocal'))
  )
  AND NOT EXISTS (
    SELECT 1 FROM outbox_commands previous
    WHERE previous.owner_user_id = candidate.owner_user_id
      AND previous.contour_id = candidate.contour_id
      AND previous.aggregate_key = candidate.aggregate_key
      AND previous.sequence_no < candidate.sequence_no
      AND previous.status NOT IN ('accepted', 'duplicate', 'superseded', 'cancelled', 'cancelledLocal')
  )
`;
