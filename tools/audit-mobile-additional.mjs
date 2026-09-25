// Read-only audit probes. No app/database files are modified; SQLite is in memory.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const mobile = new URL('mobiel%20proekt/', root);
const require = createRequire(new URL('package.json', mobile));
const ts = require('typescript');
const source = path => readFileSync(new URL(path, mobile), 'utf8');
async function loadPure(path) {
  const js = ts.transpileModule(source(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const observations = [];

const { resolveBootstrapAssignmentStatus } = await loadPure('src/domain/sync/bootstrapResolutionPolicy.ts');
const resume = resolveBootstrapAssignmentStatus('paused', 'inProgress', false);
observations.push({ case: 'Server resumed patrol, no pending local commands', expected: 'inProgress', actual: resume, reproduced: resume !== 'inProgress' });

const db = new DatabaseSync(':memory:');
db.exec(`
 CREATE TABLE patrol_assignments (assignment_id TEXT PRIMARY KEY, owner_user_id TEXT, contour_id TEXT, request_id TEXT, route_id TEXT, status TEXT, started_at_local TEXT, completed_at_local TEXT, revision INTEGER, route_version_no INTEGER, snapshot_version INTEGER, snapshot_created_at TEXT, snapshot_source TEXT, snapshot_allow_free_order INTEGER, snapshot_nfc_enabled INTEGER, snapshot_qr_fallback_enabled INTEGER);
 CREATE TABLE patrol_request_board (request_id TEXT, owner_user_id TEXT, route_name TEXT, assigned_full_name TEXT);
 CREATE TABLE routes (route_id TEXT, name TEXT);
 CREATE TABLE patrol_report_cache (assignment_id TEXT, owner_user_id TEXT, contour_id TEXT, route_name TEXT, employee_name TEXT, completed_at TEXT);
`);
const bootstrapSql = [...source('src/db/repositories/bootstrapRepository.ts').matchAll(/`([^`]+)`/gs)]
  .map(match => match[1]).find(sql => sql.includes('INSERT INTO patrol_assignments (') && sql.includes('completed_at_local = CASE'));
assert.ok(bootstrapSql, 'Audit must execute the actual bootstrap upsert');
const reportSql = source('src/db/repositories/patrolReportRepository.ts').match(/export const reportListSql = `([^`]+)`/s)?.[1];
assert.ok(reportSql, 'Audit must execute the actual report listing query');
db.prepare('INSERT INTO patrol_assignments (assignment_id,owner_user_id,contour_id,request_id,route_id,status,completed_at_local) VALUES (?,?,?,?,?,?,?)')
  .run('a', 'user', 'test', 'req', 'route', 'needsDispatcherDecision', '2026-09-21T07:00:00Z');
const before = db.prepare(reportSql).all('user', 'test', 'user', 'test').length;
db.prepare(bootstrapSql).run('a', 'user', 'test', 'req', 'route', 'inProgress', null, null, 2, 1, 1, '2026-09-21T08:00:00Z', 'bootstrap', 1, 1, 0, 1);
const after = db.prepare(reportSql).all('user', 'test', 'user', 'test').length;
const assignment = db.prepare('SELECT status, completed_at_local FROM patrol_assignments').get();
observations.push({ case: 'Bootstrap during report conflict retains local report', expected: { visibleReports: 1, completionDatePreserved: true }, actual: { before, after, ...assignment }, reproduced: before === 1 && after === 0 });
db.close();

const { getAssignmentCommandIds } = await loadPure('src/db/repositories/patrolCancellationPolicy.ts');
const commands = [{ clientOperationId: 'switch-a-b', entityLocalId: 'b', entityServerId: 'b', payloadJson: JSON.stringify({ assignmentId: 'b', sourceAssignmentId: 'a' }) }];
const sourceCommands = getAssignmentCommandIds(commands, 'a');
const targetCommands = getAssignmentCommandIds(commands, 'b');
observations.push({ case: 'Cancellation detects both sides of a pending switch', expected: ['switch-a-b'], actual: { sourceCommands, targetCommands }, reproduced: sourceCommands.length === 0 && targetCommands.length === 1 });

const { ConnectionMonitor } = await loadPure('src/core/connectionMonitor.ts');
const monitor = new ConnectionMonitor(async () => ({ ok: true }), () => {});
monitor.setNetwork(true);
await monitor.check();
monitor.setNetwork(false);
monitor.outcome('connected'); // An already received API body finishes parsing after disconnect.
observations.push({ case: 'Late API success must not override known network loss', expected: 'offline', actual: monitor.status, reproduced: monitor.status !== 'offline' });
monitor.dispose();

// Run the real hook's control flow with deterministic hook/repository doubles.
const stateValues = [];
let focusedEffect;
const requestedPages = [];
const cache = new Map();
const hooks = {
  useState: initial => { const index = stateValues.push(initial) - 1; return [initial, value => { stateValues[index] = value; }]; },
  useRef: value => ({ current: value }), useCallback: callback => callback
};
const mockRepository = {
  getReportScope: async () => ({ ownerUserId: 'user', contourId: 'test' }),
  listPatrolReports: async (_scope, limit) => {
    const rows = [...cache.values()].sort((a, b) => a.order - b.order);
    return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
  },
  fetchPatrolReportPage: async (_scope, position) => {
    requestedPages.push(position.page);
    for (let i = (position.page - 1) * 25; i < Math.min(position.page * 25, 100); i++) cache.set(i, { assignmentId: `a${i}`, order: i });
    return { page: position.page + 1, cursor: `cursor-${position.page}`, hasMore: position.page < 4 };
  }
};
const mockModules = {
  react: hooks,
  'expo-router': { useFocusEffect: callback => { focusedEffect = callback; } },
  '@/db/repositories/patrolReportRepository': mockRepository,
  '@/sync/syncEvents': { subscribeToSyncEvents: () => () => {} }
};
const hookCode = ts.transpileModule(source('src/features/patrol/usePatrolReports.ts'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', hookCode)(name => {
  assert.ok(mockModules[name], `Unexpected dependency ${name}`); return mockModules[name];
}, module, module.exports);
const feed = module.exports.usePatrolReports();
async function settleLoad() {
  for (let attempt = 0; attempt < 100 && stateValues[1]; attempt++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(stateValues[1], false, 'Loading must settle');
}
let blur = focusedEffect(); await settleLoad();
feed.loadMore(); await settleLoad();
feed.loadMore(); await settleLoad();
const loadedCount = stateValues[0].length;
blur(); blur = focusedEffect(); await settleLoad();
feed.loadMore(); await settleLoad();
observations.push({ case: 'Load more after revisiting a 75-report list', expected: { visibleReports: 100, nextOlderPage: 4 }, actual: { loadedCount, visibleReports: stateValues[0].length, requestedPages }, reproduced: loadedCount === 75 && stateValues[0].length === 75 && requestedPages.at(-1) === 2 });
blur();
console.log(JSON.stringify({ appCodeChanged: false, storage: 'in-memory SQLite', observations }, null, 2));
