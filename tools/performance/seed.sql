DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM inventory.categories)
     OR NOT EXISTS (SELECT 1 FROM inventory.units)
     OR NOT EXISTS (SELECT 1 FROM inventory.warehouses)
     OR NOT EXISTS (SELECT 1 FROM employees)
     OR NOT EXISTS (SELECT 1 FROM routes)
     OR NOT EXISTS (SELECT 1 FROM emu_work_sections)
     OR NOT EXISTS (SELECT 1 FROM emu_wait_reasons) THEN
    RAISE EXCEPTION 'Run application migrations and seed reference data before the performance dataset';
  END IF;
END $$;

INSERT INTO inventory.items (
  id, legacy_id, name, sku, category_id, unit_id, item_kind, norm_item_name,
  actual_item_name, brand_name, model_name, article, protection_class,
  clothing_size, height_size, shoe_size, head_size, glove_size, respirator_size,
  default_life_months, default_unit_price_minor, min_stock_qty, is_consumable,
  track_life, tracking_type, comment, is_active, created_at)
SELECT
  md5('perf-item-' || n)::uuid, 900000 + n,
  'perf-item-' || lpad(n::text, 5, '0'),
  'PERF-' || lpad(n::text, 7, '0'),
  (SELECT id FROM inventory.categories ORDER BY id LIMIT 1),
  (SELECT id FROM inventory.units ORDER BY id LIMIT 1),
  CASE WHEN n % 4 = 0 THEN 'СИЗ' ELSE 'Номенклатура' END,
  CASE WHEN n % 4 = 0 THEN 'Ботинки зимние' ELSE 'Перчатки защитные' END,
  'Синтетическая позиция ' || n, 'ATOM', 'PERF-MODEL', 'PERF-ARTICLE-' || n,
  CASE WHEN n % 4 = 0 THEN 'Зимняя' ELSE 'Общая' END,
  '', '', CASE WHEN n % 4 = 0 THEN '42' ELSE '' END, '', '', '',
  12, 100000 + n, 10, false, false, 'quantity', 'perf synthetic', true, now()
FROM generate_series(1, 50000) AS numbers(n)
ON CONFLICT (id) DO NOTHING;

INSERT INTO inventory.stock_moves (
  id, legacy_id, item_id, warehouse_id, qty_delta, moved_at, employee_id,
  move_type, reference_type, reference_id)
SELECT
  md5('perf-move-' || n)::uuid, 950000 + n,
  md5('perf-item-' || (((n - 1) % 50000) + 1))::uuid,
  (SELECT id FROM inventory.warehouses ORDER BY id LIMIT 1),
  CASE WHEN n % 10 = 0 THEN -1 ELSE 2 END,
  now() - ((n % 365) || ' days')::interval,
  (SELECT id FROM employees ORDER BY id LIMIT 1),
  CASE WHEN n % 10 = 0 THEN 'reservation' ELSE 'receipt' END,
  'performance', md5('perf-reference-' || n)::uuid
FROM generate_series(1, 500000) AS numbers(n)
ON CONFLICT (id) DO NOTHING;

INSERT INTO patrol_requests (
  id, number, employee_id, employee_name, route_id, route_name, scheduled_date,
  scheduled_time, notify_employee, notification_text, status, status_code,
  created_at, description)
SELECT
  md5('perf-request-' || n)::uuid,
  'PERF-REQ-' || lpad(n::text, 7, '0'),
  employee.id, employee.full_name, route.id, route.name,
  current_date - (n % 365), time '08:00', false, '', 'Назначено', 'assigned',
  now() - ((n % 365) || ' days')::interval, 'perf synthetic request'
FROM generate_series(1, 100000) AS numbers(n)
CROSS JOIN LATERAL (SELECT id, full_name FROM employees ORDER BY id LIMIT 1) AS employee
CROSS JOIN LATERAL (SELECT id, name FROM routes ORDER BY id LIMIT 1) AS route
ON CONFLICT (id) DO NOTHING;

INSERT INTO assignments (
  id, patrol_request_id, route_id, route_version_no, route_revision_id,
  employee_id, shift, status, status_code, planned_at, started_at, finished_at,
  progress_percent, lock_version)
SELECT
  md5('perf-assignment-' || n)::uuid,
  md5('perf-request-' || n)::uuid,
  route.id, route.version_no, NULL, employee.id, 'День', 'Завершено', 'completed',
  now() - ((n % 365) || ' days')::interval,
  now() - ((n % 365) || ' days')::interval,
  now() - ((n % 365) || ' days')::interval, 100, 1
FROM generate_series(1, 100000) AS numbers(n)
CROSS JOIN LATERAL (SELECT id FROM employees ORDER BY id LIMIT 1) AS employee
CROSS JOIN LATERAL (SELECT id, version_no FROM routes ORDER BY id LIMIT 1) AS route
ON CONFLICT (id) DO NOTHING;

INSERT INTO patrol_results (
  id, assignment_id, route_id, employee_id, route_point_id, status, status_code,
  point_name, employee_name, route_name, territory, shift, planned_at, actual_at,
  deviation, comment, issue_type, severity, photos, created_at)
SELECT
  md5('perf-result-' || n)::uuid, md5('perf-assignment-' || n)::uuid,
  route.id, employee.id, NULL, 'Исправно', 'ok', 'perf point', employee.full_name,
  route.name, route.territory, 'День', now() - ((n % 365) || ' days')::interval,
  now() - ((n % 365) || ' days')::interval, '0', '', '', '', 0,
  now() - ((n % 365) || ' days')::interval
FROM generate_series(1, 100000) AS numbers(n)
CROSS JOIN LATERAL (SELECT id, full_name FROM employees ORDER BY id LIMIT 1) AS employee
CROSS JOIN LATERAL (SELECT id, name, territory FROM routes ORDER BY id LIMIT 1) AS route
ON CONFLICT (id) DO NOTHING;

INSERT INTO emu_work_sessions (
  id, work_number, work_date, section_id, plan_task_id, task_description, status,
  result_status, result_comment, not_completed_reason_id, arrived_at, completed_at,
  created_at, updated_at, source, created_by_user_id, deleted_at, deleted_by_user_id,
  delete_reason, work_minutes, waiting_minutes, other_work_minutes, row_version,
  is_carried_over)
SELECT
  md5('perf-emu-session-' || n)::uuid, 'PERF-EMU-' || lpad(n::text, 7, '0'),
  current_date - (n % 365), section.id, NULL, 'perf synthetic work', 'Завершена',
  'Выполнено', '', NULL,
  now() - ((n % 365) || ' days')::interval,
  now() - ((n % 365) || ' days')::interval,
  now() - ((n % 365) || ' days')::interval,
  now() - ((n % 365) || ' days')::interval, 'performance', NULL, NULL, NULL, '',
  60, 0, 0, 1, false
FROM generate_series(1, 100000) AS numbers(n)
CROSS JOIN LATERAL (SELECT id FROM emu_work_sections ORDER BY id LIMIT 1) AS section
ON CONFLICT (id) DO NOTHING;

INSERT INTO emu_work_session_employees (
  id, work_session_id, employee_id, full_name_snapshot, position_snapshot, status,
  arrived_at, finished_at, work_minutes, waiting_minutes, other_work_minutes)
SELECT
  md5('perf-emu-participant-' || n)::uuid, md5('perf-emu-session-' || n)::uuid,
  employee.id, employee.full_name, employee.position, 'Завершил',
  now() - ((n % 365) || ' days')::interval,
  now() - ((n % 365) || ' days')::interval, 60, 0, 0
FROM generate_series(1, 100000) AS numbers(n)
CROSS JOIN LATERAL (SELECT id, full_name, position FROM employees ORDER BY id LIMIT 1) AS employee
ON CONFLICT (id) DO NOTHING;

INSERT INTO emu_work_pauses (
  id, work_session_id, wait_reason_id, started_at, ended_at, comment, is_other_work)
SELECT
  md5('perf-emu-pause-' || n)::uuid, md5('perf-emu-session-' || n)::uuid,
  reason.id, now() - interval '2 days', now() - interval '2 days' + interval '5 minutes',
  'perf synthetic pause', false
FROM generate_series(1, 100000) AS numbers(n)
CROSS JOIN LATERAL (SELECT id FROM emu_wait_reasons ORDER BY id LIMIT 1) AS reason
ON CONFLICT (id) DO NOTHING;

INSERT INTO emu_work_pause_employees (id, pause_id, employee_id)
SELECT md5('perf-emu-pause-employee-' || n)::uuid,
       md5('perf-emu-pause-' || n)::uuid,
       employee.id
FROM generate_series(1, 100000) AS numbers(n)
CROSS JOIN LATERAL (SELECT id FROM employees ORDER BY id LIMIT 1) AS employee
ON CONFLICT (id) DO NOTHING;

INSERT INTO emu_work_audit_events (
  id, work_session_id, plan_task_id, event_type, from_status, to_status, comment,
  actor_user_id, actor, created_at)
SELECT
  md5('perf-emu-audit-' || n)::uuid, md5('perf-emu-session-' || n)::uuid, NULL,
  'completed', 'В работе', 'Завершена', 'perf synthetic audit', NULL, 'performance',
  now() - ((n % 365) || ' days')::interval
FROM generate_series(1, 100000) AS numbers(n)
ON CONFLICT (id) DO NOTHING;

-- The PERCo part deliberately uses 1,000 employees and 1,000 events per employee.
-- It exercises targeted recalculation without using any production identifiers.
INSERT INTO employees (
  id, full_name, personnel_no, position, department, employee_group,
  emu_shift_report_category, hired_at, birth_date, status, shift,
  has_mobile_account, last_seen_at)
SELECT
  md5('perf-perco-employee-' || n)::uuid,
  'PERF PERCo employee ' || lpad(n::text, 4, '0'),
  'PERF-PERCO-' || lpad(n::text, 4, '0'),
  'Оператор', 'PERF', 'PERF', NULL,
  current_date - interval '2 years', NULL, 'Активен', 'День', false, now()
FROM generate_series(1, 1000) AS numbers(n)
ON CONFLICT (id) DO NOTHING;

INSERT INTO perco_employee_links (
  id, perco_employee_id, employee_id, full_name, personnel_no, card_number,
  department, matched_by_user_id, matched_at, match_status, created_at, updated_at)
SELECT
  md5('perf-perco-link-' || n)::uuid,
  'perf-perco-' || lpad(n::text, 4, '0'),
  md5('perf-perco-employee-' || n)::uuid,
  'PERF PERCo employee ' || lpad(n::text, 4, '0'),
  'PERF-PERCO-' || lpad(n::text, 4, '0'),
  'PERF-CARD-' || lpad(n::text, 4, '0'),
  'PERF', NULL, now(), 'MATCHED', now(), now()
FROM generate_series(1, 1000) AS numbers(n)
ON CONFLICT (perco_employee_id) DO NOTHING;

INSERT INTO perco_access_events (
  id, perco_event_id, perco_employee_id, employee_id, device_id, device_name,
  direction, event_at, raw_payload, created_at)
SELECT
  md5('perf-perco-event-' || n)::uuid,
  'perf-perco-event-' || n,
  'perf-perco-' || lpad((((n - 1) % 1000) + 1)::text, 4, '0'),
  md5('perf-perco-employee-' || (((n - 1) % 1000) + 1))::uuid,
  'perf-gate-01', 'PERF проходная',
  CASE WHEN n % 2 = 0 THEN 'OUT' ELSE 'IN' END,
  now() - ((1000000 - n) * interval '30 seconds'),
  jsonb_build_object('performance', true, 'event', n),
  now()
FROM generate_series(1, 1000000) AS numbers(n)
ON CONFLICT (perco_event_id) DO NOTHING;

-- The files are metadata-only: their bytes are supplied by the isolated k6
-- recovery scenario. They exercise list/index plans without putting blobs in SQL.
WITH accounts AS (
  SELECT id, row_number() OVER (ORDER BY id) AS sequence_no
  FROM mobile_accounts
), account_count AS (
  SELECT greatest(count(*), 1) AS value FROM accounts
)
INSERT INTO mobile_uploaded_files (
  id, mobile_account_id, client_file_id, assignment_id, point_id, remark_id,
  work_task_id, linked_at, storage_file_name, original_file_name, content_type,
  sha256, size_bytes, captured_at_local, uploaded_at)
SELECT
  md5('perf-emu-attachment-' || n)::uuid,
  account.id,
  'perf-emu-file-' || n,
  NULL, NULL, NULL, md5('perf-emu-session-' || (((n - 1) % 100000) + 1))::uuid,
  now(), 'perf-emu-file-' || n || '.jpg', 'perf-photo.jpg', 'image/jpeg',
  repeat('0', 64), 1048576, now(), now()
FROM generate_series(1, 20000) AS numbers(n)
CROSS JOIN account_count
JOIN accounts AS account ON account.sequence_no = (((n - 1) % account_count.value) + 1)
ON CONFLICT (mobile_account_id, client_file_id) DO NOTHING;

ANALYZE inventory.items;
ANALYZE inventory.stock_moves;
ANALYZE patrol_requests;
ANALYZE assignments;
ANALYZE patrol_results;
ANALYZE emu_work_sessions;
ANALYZE emu_work_session_employees;
ANALYZE emu_work_pauses;
ANALYZE emu_work_audit_events;
ANALYZE employees;
ANALYZE perco_employee_links;
ANALYZE perco_access_events;
ANALYZE mobile_uploaded_files;
