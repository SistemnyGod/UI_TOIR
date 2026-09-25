// Diagnostic only: loads current application functions; SQLite is in memory.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
const root = new URL('../mobiel%20proekt/', import.meta.url);
const ts = createRequire(new URL('package.json', root))('typescript');
const source = path => readFileSync(new URL(path, root), 'utf8');
function load(path, deps = {}, privateExport = '') {
  const code = ts.transpileModule(source(path) + (privateExport ? `\nexport { ${privateExport} };` : ''),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => deps[name] ?? {}, module, module.exports);
  return module.exports;
}
const observations = [];
const tick = () => new Promise(resolve => setImmediate(resolve));
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE outbox_commands (client_operation_id TEXT PRIMARY KEY, owner_user_id TEXT, contour_id TEXT,
      command_type TEXT, entity_type TEXT, entity_local_id TEXT, entity_server_id TEXT, payload_json TEXT,
      created_at_local TEXT, updated_at_local TEXT, aggregate_key TEXT, sequence_no INTEGER, attempt_count INTEGER,
      status TEXT, last_error TEXT, retry_reason TEXT, next_attempt_at TEXT);
    CREATE TABLE patrol_assignments (assignment_id TEXT PRIMARY KEY, owner_user_id TEXT, contour_id TEXT,
      request_id TEXT, route_id TEXT, employee_id TEXT, status TEXT, started_at_local TEXT, completed_at_local TEXT,
      local_report_present INTEGER DEFAULT 0, local_report_needs_review INTEGER DEFAULT 0, revision INTEGER DEFAULT 1, route_version_no INTEGER DEFAULT 1,
      snapshot_version INTEGER DEFAULT 1, snapshot_created_at TEXT, snapshot_source TEXT,
      snapshot_allow_free_order INTEGER, snapshot_nfc_enabled INTEGER, snapshot_qr_fallback_enabled INTEGER);
    CREATE TABLE patrol_request_board (request_id TEXT, owner_user_id TEXT, status TEXT);
    CREATE TABLE sync_conflicts (conflict_id TEXT, owner_user_id TEXT, contour_id TEXT, status TEXT,
      resolution_status TEXT, resolved_at TEXT, resolution_reason TEXT, client_operation_id TEXT, payload_snapshot_json TEXT);
    CREATE TABLE point_results (assignment_id TEXT, owner_user_id TEXT);
    CREATE TABLE files (assignment_id TEXT, owner_user_id TEXT, contour_id TEXT);
    CREATE TABLE assignment_route_points (assignment_id TEXT, point_id TEXT, route_id TEXT, name TEXT, description TEXT,
      instruction TEXT, order_index INTEGER, nfc_uid_hash TEXT, qr_code_hash TEXT, required INTEGER, requires_photo INTEGER, revision INTEGER);
    CREATE TABLE patrol_report_cache (owner_user_id TEXT, contour_id TEXT, assignment_id TEXT, route_name TEXT,
      employee_name TEXT, completed_at TEXT, cached_at TEXT);
    CREATE TABLE patrol_report_detail_cache (owner_user_id TEXT, contour_id TEXT, assignment_id TEXT, points_json TEXT, cached_at TEXT);
    CREATE TABLE patrol_device_context (owner_user_id TEXT, contour_id TEXT, assignment_id TEXT);
    CREATE TABLE mobile_capabilities (owner_user_id TEXT, contour_id TEXT, patrol_appeals INTEGER,
      patrol_appeals_paging INTEGER, patrol_appeals_assignment_paging INTEGER);
    CREATE TABLE patrol_appeal_cursors (owner_user_id TEXT, contour_id TEXT, scope_key TEXT, next_cursor TEXT,
      updated_at TEXT, PRIMARY KEY(owner_user_id, contour_id, scope_key));
    CREATE TABLE patrol_appeals (id TEXT, owner_user_id TEXT, contour_id TEXT, assignment_id TEXT, kind TEXT, message TEXT,
      status TEXT, reply TEXT, created_at TEXT, version INTEGER, PRIMARY KEY(id, owner_user_id, contour_id));
  `);
  const tx = {
    getAllAsync: async (sql, args = []) => db.prepare(sql).all(...args),
    getFirstAsync: async (sql, args = []) => db.prepare(sql).get(...args),
    runAsync: async (sql, args = []) => db.prepare(sql).run(...args)
  };
  const dbModule = { getDatabase: async () => tx, withProtectedExclusiveTransactionAsync: async (_, action) => {
    db.exec('BEGIN');
    try { const result = await action(tx); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  } };
  return { db, tx, dbModule };
}
const common = { '@/core/environments': { currentContourId: 'test' } };
const outboxSql = load('src/db/repositories/outboxSql.ts', { ...common,
  '@/sync/outboxOrderingPolicy': { getCommandAggregateKey: c => `patrolAssignment:${c.payload.assignmentId}` } });
const command = (id, type, payload, status = 'pending') => ({ clientOperationId: id, ownerUserId: 'u', contourId: 'test',
  commandType: type, entityType: 'patrolAssignment', entityLocalId: payload.assignmentId, payload,
  createdAtLocal: '2026-09-22T00:00:00Z', attemptCount: 0, status });

// A second bootstrap after a definitive failure bypasses the explicit Continue B action.
{
  const { db, tx } = database();
  const cancellation = load('src/db/repositories/patrolCancellationRepository.ts', { ...common,
    '@/db/repositories/patrolCancellationPolicy': load('src/db/repositories/patrolCancellationPolicy.ts') });
  await outboxSql.insertOutboxCommandInTransaction(tx, command('switch', 'switchPatrolAssignment', { assignmentId: 'b', sourceAssignmentId: 'a' }, 'sending'));
  await outboxSql.insertOutboxCommandInTransaction(tx, command('result', 'savePatrolPointResult', { assignmentId: 'b', dependencies: ['photo'] }));
  const deps = JSON.parse(db.prepare("SELECT payload_json FROM outbox_commands WHERE client_operation_id='result'").get().payload_json).dependencies;
  assert.deepEqual(deps, ['photo', 'switch']);
  observations.push({ case: 'Existing dependency preserved with switch barrier', actual: deps });
  await cancellation.finalizeCancelledAssignmentInTransaction(tx, 'u', 'a');
  assert.equal(db.prepare("SELECT status FROM outbox_commands WHERE client_operation_id='switch'").get().status, 'retryLater');
  db.exec("UPDATE outbox_commands SET status='conflict' WHERE client_operation_id='switch'");
  await cancellation.finalizeCancelledAssignmentInTransaction(tx, 'u', 'a');
  const sql = [...source('src/db/repositories/outboxRepository.ts').matchAll(/`([^`]+)`/gs)]
    .map(m => m[1]).find(s => s.includes('SELECT candidate.*')).replace('${aggregateFilter}', '');
  const ready = db.prepare(sql).all('u', 'test', '2026-09-22T01:00:00Z', 25).map(r => r.client_operation_id);
  assert.deepEqual(ready, []);
  observations.push({ case: 'Cancellation after switch conflict keeps barrier', switchStatus: 'conflict', readyWithoutContinue: ready });
  db.close();
}

// Continue B never rewrites an attempted command and is idempotent after a
// continuation has been created.
{
  const { db, tx, dbModule } = database();
  db.exec("INSERT INTO patrol_assignments (assignment_id,owner_user_id,contour_id,request_id,status,employee_id) VALUES ('b','u','test','req','syncError','e')");
  await outboxSql.insertOutboxCommandInTransaction(tx, command('switch', 'switchPatrolAssignment', { assignmentId: 'b', sourceAssignmentId: 'a', targetStatusBefore: 'accepted' }, 'conflict'));
  await outboxSql.insertOutboxCommandInTransaction(tx, { ...command('attempted-result', 'savePatrolPointResult', { assignmentId: 'b' }, 'retryLater'), attemptCount: 1 });
  const before = db.prepare("SELECT payload_json FROM outbox_commands WHERE client_operation_id='attempted-result'").get().payload_json;
  const repo = load('src/db/repositories/patrolSwitchRepository.ts', { ...common,
    'expo-crypto': { randomUUID: () => 'continue' }, '@/db/database': dbModule,
    '@/db/sqliteBusyRetry': { withSqliteBusyRetry: f => f() }, '@/db/repositories/outboxSql': outboxSql,
    '@/db/repositories/patrolContextRepository': { setPatrolDeviceContextInTransaction: async () => {} },
    '@/sync/mutationSyncRequest': { requestSyncAfterMutation: () => {} } });
  await assert.rejects(() => repo.continuePatrolAfterSwitchConflict('u', 'switch'), /Ожидаем подтверждение/);
  const after = db.prepare("SELECT payload_json FROM outbox_commands WHERE client_operation_id='attempted-result'").get().payload_json;
  assert.equal(before, after);
  db.prepare("DELETE FROM outbox_commands WHERE client_operation_id='attempted-result'").run();
  await repo.continuePatrolAfterSwitchConflict('u', 'switch');
  const repeated = await repo.continuePatrolAfterSwitchConflict('u', 'switch');
  assert.equal(repeated, 'continue');
  observations.push({ case: 'Continue B preserves attempted command and is idempotent', unchanged: before === after, repeated });
  db.close();
}

// Run the actual ID remapper against SQLite, retaining a completed local report.
{
  const { db, tx } = database();
  db.exec("INSERT INTO patrol_assignments (assignment_id,owner_user_id,contour_id,status,local_report_present,completed_at_local) VALUES ('local','u','test','completedLocal',1,'2026-09-22'),('server','u','test','accepted',0,NULL)");
  const repo = load('src/db/repositories/outboxRepository.ts', { ...common,
    '@/domain/patrol/assignmentIdentityPolicy': load('src/domain/patrol/assignmentIdentityPolicy.ts')
  }, 'remapAssignmentIdentityInTransaction');
  await repo.remapAssignmentIdentityInTransaction(tx, 'u', 'local', 'server');
  const row = db.prepare('SELECT assignment_id,status,local_report_present,completed_at_local FROM patrol_assignments').get();
  assert.equal(row.local_report_present, 1);
  observations.push({ case: 'ID merge preserves local report presence', actual: row });
  // Execute the migration SQL from application source on a draft with an error.
  db.exec("INSERT INTO patrol_assignments (assignment_id,owner_user_id,contour_id,status) VALUES ('draft','u','test','syncError')");
  const migration = [...source('src/db/database.ts').matchAll(/`([^`]+)`/gs)].map(m => m[1])
    .find(s => s.includes('SET local_report_present = 1'));
  db.exec(migration);
  assert.equal(db.prepare("SELECT local_report_present FROM patrol_assignments WHERE assignment_id='draft'").get().local_report_present, 0);
  db.exec("UPDATE patrol_assignments SET local_report_present = 1 WHERE assignment_id='draft'");
  const reviewMigration = [...source('src/db/database.ts').matchAll(/`([^`]+)`/gs)].map(m => m[1])
    .find(s => s.includes('SET local_report_needs_review = 1'));
  db.exec(reviewMigration);
  assert.equal(db.prepare("SELECT local_report_needs_review FROM patrol_assignments WHERE assignment_id='draft'").get().local_report_needs_review, 1);
  observations.push({ case: 'Ambiguous draft is retained with review marker', present: 1, needsReview: 1 });
  db.close();
}

function reportsHarness() {
  const values = []; let focus; const cache = new Map(); let remoteCalls = 0;
  const initial = Array.from({ length: 150 }, (_, i) => ({ assignmentId: `old-${i}`, serverConfirmed: 1 }));
  const recent = Array.from({ length: 40 }, (_, i) => ({ assignmentId: `new-${i}`, serverConfirmed: 1 }));
  let inserted = false, fail = false, gate = null;
  const hook = load('src/features/patrol/usePatrolReports.ts', {
    react: { useRef: value => ({ current: value }), useCallback: f => f,
      useState: value => { const i = values.push(value) - 1; return [value, next => { values[i] = next; }]; } },
    'expo-router': { useFocusEffect: callback => { focus = callback; } },
    '@/sync/syncEvents': { subscribeToSyncEvents: () => () => {} },
    '@/db/repositories/patrolReportRepository': {
      getReportScope: async () => ({ ownerUserId: 'u', contourId: 'test' }),
      listPatrolReports: async (_, limit) => ({ rows: [...(inserted ? recent : []), ...initial].filter(r => cache.has(r.assignmentId)).slice(0, limit), hasMore: cache.size > limit }),
      fetchPatrolReportPage: async (_, position) => {
        remoteCalls++;
        if (gate) await gate;
        if (fail && position.cursor === 'new-24') { fail = false; throw Error('Interrupted second head page'); }
        const all = inserted ? [...recent, ...initial] : initial;
        const offset = position.cursor ? all.findIndex(r => r.assignmentId === position.cursor) + 1 : 0;
        const items = all.slice(offset, offset + 25); items.forEach(r => cache.set(r.assignmentId, r));
        return { items, page: position.page + 1, cursor: items.at(-1)?.assignmentId ?? null, hasMore: offset + 25 < all.length };
      }
    }
  });
  const feed = hook.usePatrolReports();
  return { feed, values, cache, recent, focus: () => focus(), calls: () => remoteCalls,
    insert: () => { inserted = true; fail = true; }, gate: promise => { gate = promise; } };
}
async function settle(h) { for (let i = 0; i < 100 && h.values[1]; i++) await tick(); assert.equal(h.values[1], false); }
{
  const h = reportsHarness(); const blur = h.focus(); await settle(h);
  h.feed.loadMore(); await settle(h); h.feed.loadMore(); await settle(h);
  h.insert(); h.feed.refresh(); await settle(h); h.feed.refresh(); await settle(h);
  const missing = h.recent.filter(r => !h.cache.has(r.assignmentId)).length;
  assert.equal(missing, 0);
  observations.push({ case: 'Interrupted refresh of 40 new reports, then retry', missing });
  blur();
}
{
  const h = reportsHarness(); let release;
  h.gate(new Promise(resolve => { release = resolve; }));
  const blur = h.focus(); await tick(); blur(); release(); await tick();
  const before = h.calls(); h.focus(); await tick(); h.feed.refresh(); await tick();
  assert.ok(h.calls() > before); assert.equal(h.values[1], false);
  observations.push({ case: 'Leave reports during request, return after response', stuckBusy: h.values[1], newRequests: h.calls() - before });
}

// Exercise the real subscription adapter as well as the monitor.
{
  const events = load('src/core/connectionStateEvents.ts');
  let netListener, settingsListener, unsubscribe;
  const connection = load('src/core/connectionStatus.ts', {
    '@react-native-community/netinfo': { __esModule: true, default: { addEventListener: cb => { netListener = cb; return () => {}; } } },
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    react: { useSyncExternalStore: (subscribe, snapshot) => { unsubscribe ??= subscribe(() => {}); return snapshot(); } },
    '@/api/serverHealthApi': { checkServerConnection: async () => ({ ok: true }), invalidateServerHealthCache() {} },
    '@/core/networkPolicy': load('src/core/networkPolicy.ts'), '@/core/connectionStateEvents': events,
    '@/core/serverSettings': { subscribeToServerSettings: cb => { settingsListener = cb; return () => {}; } },
    '@/core/connectionMonitor': load('src/core/connectionMonitor.ts')
  });
  connection.useConnectionStatus(); netListener({ isConnected: true }); await tick();
  events.recordMobileConnectionOutcome('authorizationRequired');
  events.invalidateMobileConnectionContext(); // exactly what beginAuthTransition does
  events.recordMobileConnectionOutcome('authorizationRecovered');
  assert.equal(connection.useConnectionStatus(), 'connected');
  observations.push({ case: 'Auth transition updates subscribed monitor generation', actual: connection.useConnectionStatus() });
  settingsListener(); await tick();
  assert.equal(connection.useConnectionStatus(), 'connected');
  observations.push({ case: 'Settings reset keeps the current authenticated context', actual: connection.useConnectionStatus() });
  unsubscribe();
}

{
  const { db, tx, dbModule } = database();
  db.exec("INSERT INTO mobile_capabilities VALUES ('u','test',1,1,1)");
  const items = Array.from({ length: 60 }, (_, i) => ({ id: `appeal-${i}`, assignmentId: 'route', kind: 'message', message: 'm', status: 'closed', reply: null, createdAt: '2026-09-22', version: 1 }));
  let calls = 0;
  const repo = load('src/db/repositories/patrolAppealRepository.ts', { ...common,
    '@/db/database': dbModule, '@/auth/tokenStorage': { getStoredOwnerUserId: async () => 'u' },
    '@/api/mobileApi': { getPatrolAppealsPage: async (size, cursor) => {
      calls++; const start = Number(cursor ?? 0);
      return { items: items.slice(start, start + size), nextCursor: start + size < items.length ? String(start + size) : null };
    } }
  });
  const opened = await repo.loadPatrolAppeals('route');
  assert.equal(opened.items.length, 25);
  await repo.loadPatrolAppeals('route');
  observations.push({ case: 'Open route with 60 appeals, then sync reload', visible: opened.items.length, total: items.length, networkRequests: calls });
  db.close();
}
console.log(JSON.stringify({ applicationCodeModified: true, observations }, null, 2));
