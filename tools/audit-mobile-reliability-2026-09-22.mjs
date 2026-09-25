// Read-only probes of application code; all database changes stay in memory.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
const mobile = new URL('../mobiel%20proekt/', import.meta.url);
const ts = createRequire(new URL('package.json', mobile))('typescript');
const source = path => readFileSync(new URL(path, mobile), 'utf8');
function load(path, dependencies = {}) {
  const code = ts.transpileModule(source(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(name in dependencies, `Unexpected import: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE outbox_commands (
 client_operation_id TEXT PRIMARY KEY, owner_user_id TEXT, contour_id TEXT, command_type TEXT,
 entity_type TEXT, entity_local_id TEXT, entity_server_id TEXT, payload_json TEXT,
 created_at_local TEXT, updated_at_local TEXT, aggregate_key TEXT, sequence_no INTEGER,
 attempt_count INTEGER, status TEXT, last_error TEXT, next_attempt_at TEXT);
 CREATE TABLE patrol_assignments (assignment_id TEXT, owner_user_id TEXT, status TEXT, request_id TEXT);
 CREATE TABLE patrol_request_board (request_id TEXT, owner_user_id TEXT, status TEXT);
 CREATE TABLE sync_conflicts (owner_user_id TEXT, contour_id TEXT, status TEXT, resolution_status TEXT,
 resolved_at TEXT, resolution_reason TEXT, client_operation_id TEXT);`);
const tx = {
 getAllAsync: async (sql, args = []) => db.prepare(sql).all(...args),
 getFirstAsync: async (sql, args = []) => db.prepare(sql).get(...args),
 runAsync: async (sql, args = []) => db.prepare(sql).run(...args)
};
const { getAssignmentCommandIds } = load('src/db/repositories/patrolCancellationPolicy.ts');
const { finalizeCancelledAssignmentInTransaction } = load('src/db/repositories/patrolCancellationRepository.ts', {
 '@/core/environments': { currentContourId: 'test' },
 '@/db/repositories/patrolCancellationPolicy': { getAssignmentCommandIds }
});
const { insertOutboxCommandInTransaction } = load('src/db/repositories/outboxSql.ts', {
 '@/core/environments': { currentContourId: 'test' },
 '@/domain/emu/workTaskRevisionPolicy': {},
 '@/sync/outboxOrderingPolicy': { getCommandAggregateKey: c => `patrolAssignment:${c.payload.assignmentId}` }
});
const command = (id, type, payload, status = 'pending') => ({ clientOperationId: id,
 ownerUserId: 'user', contourId: 'test', commandType: type, entityType: 'patrolAssignment',
 entityLocalId: payload.assignmentId, payload, createdAtLocal: '2026-09-22T00:00:00Z', attemptCount: 0, status });
const observations = [];
await insertOutboxCommandInTransaction(tx, command('switch', 'switchPatrolAssignment', { assignmentId: 'b', sourceAssignmentId: 'a' }, 'sending'));
await insertOutboxCommandInTransaction(tx, command('result-b', 'savePatrolPointResult', { assignmentId: 'b' }));
await finalizeCancelledAssignmentInTransaction(tx, 'user', 'a');
const cancellation = db.prepare('SELECT status FROM outbox_commands WHERE client_operation_id = ?').get('switch');
observations.push({ case: 'Cancellation with unknown switch receipt', expected: 'retain unresolved operation', actual: cancellation.status });
assert.equal(cancellation.status, 'superseded');

await insertOutboxCommandInTransaction(tx, { ...command('continue-b', 'startPatrolAssignment', { assignmentId: 'b', dependencies: [] }), bypassSwitchBarrier: true });
const pendingSql = [...source('src/db/repositories/outboxRepository.ts').matchAll(/`([^`]+)`/gs)]
 .map(m => m[1]).find(sql => sql.includes('SELECT candidate.*'))?.replace('${aggregateFilter}', '');
assert.ok(pendingSql);
const first = db.prepare(pendingSql).all('user', 'test', '2026-09-22T01:00:00Z', 25);
observations.push({ case: 'Continue B is ordered before B results', expected: 'continue-b', actual: first.map(row => row.client_operation_id) });
assert.equal(first[0].client_operation_id, 'result-b');

const { ConnectionMonitor } = load('src/core/connectionMonitor.ts');
const monitor = new ConnectionMonitor(async () => ({ ok: true }), () => {});
monitor.setContextGeneration(0); monitor.setNetwork(true); await monitor.check();
monitor.outcome('authorizationRequired', 0); monitor.outcome('connected', 0);
observations.push({ case: 'Earlier API success after auth failure', expected: 'authorizationRequired', actual: monitor.status });
assert.equal(monitor.status, 'connected'); monitor.dispose();

const values = []; let focus; let inserted = false; const cache = new Map();
const initial = Array.from({ length: 150 }, (_, i) => ({ assignmentId: `old-${i}` }));
const recent = Array.from({ length: 40 }, (_, i) => ({ assignmentId: `new-${i}` }));
const { usePatrolReports } = load('src/features/patrol/usePatrolReports.ts', {
 react: { useRef: value => ({ current: value }), useCallback: f => f,
   useState: value => { const i = values.push(value) - 1; return [value, next => { values[i] = next; }]; } },
 'expo-router': { useFocusEffect: callback => { focus = callback; } },
 '@/sync/syncEvents': { subscribeToSyncEvents: () => () => {} },
 '@/db/repositories/patrolReportRepository': {
  getReportScope: async () => ({ ownerUserId: 'user', contourId: 'test' }),
  listPatrolReports: async (_scope, limit) => ({ rows: [...cache.values()].slice(0, limit), hasMore: cache.size > limit }),
  fetchPatrolReportPage: async (_scope, position) => {
   const list = inserted ? [...recent, ...initial] : initial;
   const offset = position.cursor ? list.findIndex(r => r.assignmentId === position.cursor) + 1 : 0;
   const page = list.slice(offset, offset + 25); page.forEach(row => cache.set(row.assignmentId, row));
   return { page: position.page + 1, cursor: page.at(-1).assignmentId, hasMore: offset + 25 < list.length };
  }
 }
});
const feed = usePatrolReports();
async function settle() { for (let i = 0; i < 100 && values[1]; i++) await new Promise(resolve => setImmediate(resolve)); assert.equal(values[1], false); }
let blur = focus(); await settle(); feed.loadMore(); await settle(); feed.loadMore(); await settle();
blur(); inserted = true; blur = focus(); await settle(); feed.loadMore(); await settle();
const missingNew = recent.filter(r => !cache.has(r.assignmentId)).length;
observations.push({ case: '40 new reports arrive after 75 cached reports', expected: 0, missingNew });
assert.equal(missingNew, 15); blur();
db.exec(`ALTER TABLE patrol_assignments ADD COLUMN contour_id TEXT;
 ALTER TABLE patrol_assignments ADD COLUMN route_id TEXT;
 ALTER TABLE patrol_assignments ADD COLUMN started_at_local TEXT;
 ALTER TABLE patrol_assignments ADD COLUMN completed_at_local TEXT;
 ALTER TABLE patrol_assignments ADD COLUMN revision INTEGER;
 ALTER TABLE patrol_assignments ADD COLUMN route_version_no INTEGER;
 ALTER TABLE patrol_assignments ADD COLUMN snapshot_version INTEGER;
 ALTER TABLE patrol_assignments ADD COLUMN snapshot_created_at TEXT;
 ALTER TABLE patrol_assignments ADD COLUMN snapshot_source TEXT;
 ALTER TABLE patrol_assignments ADD COLUMN snapshot_allow_free_order INTEGER;
 ALTER TABLE patrol_assignments ADD COLUMN snapshot_nfc_enabled INTEGER;
 ALTER TABLE patrol_assignments ADD COLUMN snapshot_qr_fallback_enabled INTEGER;
 CREATE UNIQUE INDEX assignment_id_unique ON patrol_assignments(assignment_id);
 ALTER TABLE patrol_request_board ADD COLUMN route_name TEXT;
 ALTER TABLE patrol_request_board ADD COLUMN assigned_full_name TEXT;
 CREATE TABLE routes (route_id TEXT, name TEXT);
 CREATE TABLE patrol_report_cache (assignment_id TEXT, owner_user_id TEXT, contour_id TEXT, route_name TEXT, employee_name TEXT, completed_at TEXT);
 INSERT INTO patrol_assignments (assignment_id, owner_user_id, contour_id, status, revision)
 VALUES ('undated', 'user', 'test', 'completedLocal', 10);`);
const reportSql = source('src/db/repositories/patrolReportRepository.ts').match(/export const reportListSql = `([^`]+)`/s)[1];
const undated = db.prepare(reportSql).all('user', 'test', 'user', 'test');
observations.push({ case: 'Completed report with unrecoverable timestamp remains visible', expected: 1, actual: undated.length });
assert.equal(undated.length, 0);
const bootstrapSql = [...source('src/db/repositories/bootstrapRepository.ts').matchAll(/`([^`]+)`/gs)]
 .map(m => m[1]).find(sql => sql.includes('INSERT INTO patrol_assignments (') && sql.includes('completed_at_local = CASE'));
db.prepare(bootstrapSql).run('undated', 'user', 'test', 'req', 'route', 'paused', null, null, 2, 1, 1, '2026-09-22T00:00:00Z', 'bootstrap', 1, 1, 0, 0);
const stale = db.prepare('SELECT revision FROM patrol_assignments WHERE assignment_id = ?').get('undated');
observations.push({ case: 'Stale bootstrap revision 2 must not replace revision 10', expected: 10, actual: stale.revision });
assert.equal(stale.revision, 2); db.close();
console.log(JSON.stringify({ applicationCodeModified: false, observations }, null, 2));
