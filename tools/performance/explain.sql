\pset pager off
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, name
FROM inventory.items
WHERE search_text ILIKE ('%' || :'search' || '%') ESCAPE '\'
ORDER BY name
LIMIT 100;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, number, employee_name, route_name
FROM patrol_requests
WHERE search_text ILIKE ('%' || :'search' || '%') ESCAPE '\'
ORDER BY created_at DESC
LIMIT 100;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT a.id, a.employee_id, a.route_id, a.planned_at
FROM assignments a
LEFT JOIN employees e ON e.id = a.employee_id
LEFT JOIN routes r ON r.id = a.route_id
LEFT JOIN patrol_requests pr ON pr.id = a.patrol_request_id
WHERE e.full_name ILIKE ('%' || :'search' || '%') ESCAPE '\'
   OR r.name ILIKE ('%' || :'search' || '%') ESCAPE '\'
   OR pr.search_text ILIKE ('%' || :'search' || '%') ESCAPE '\'
ORDER BY planned_at DESC
LIMIT 100;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT count(*)
FROM emu_work_sessions s
WHERE s.deleted_at IS NULL
  AND s.completed_at >= current_date
  AND s.completed_at < current_date + interval '1 day';

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT s.id, s.work_date, s.section_id, s.completed_at
FROM emu_work_sessions s
WHERE s.deleted_at IS NULL
ORDER BY s.completed_at DESC NULLS LAST, s.updated_at DESC
LIMIT 100;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT f.id, f.work_task_id, f.client_file_id
FROM mobile_uploaded_files f
WHERE f.linked_at IS NOT NULL
  AND f.work_task_id IN (
    SELECT s.id
    FROM emu_work_sessions s
    WHERE s.deleted_at IS NULL
    ORDER BY s.completed_at DESC NULLS LAST, s.updated_at DESC
    LIMIT 100
  );

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, perco_event_id, event_at, direction
FROM perco_access_events
WHERE employee_id = md5('perf-perco-employee-1')::uuid
ORDER BY event_at;
