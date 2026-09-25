// Read-only diagnostics: actual TypeScript function bodies, controlled I/O, in-memory SQLite.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../mobiel proekt');
const ts = require(path.join(root, 'node_modules/typescript'));
function extract(file, name, variable = false) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(n) {
    if ((variable ? ts.isVariableDeclaration(n) : ts.isFunctionDeclaration(n)) && n.name?.getText(ast) === name) found = n.getText(ast);
    else ts.forEachChild(n, visit);
  }
  visit(ast);
  if (!found) throw Error(name);
  return (variable ? 'const ' : '') + found;
}
function load(source, names, env = {}) {
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('exports', ...Object.keys(env), js + '\nreturn {' + names.join(',') + '};')({}, ...Object.values(env));
}
const screen = 'src/features/emuTask/WorkAccountingScreen.tsx';
const results = [];
(async () => {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT);
    INSERT INTO schema_migrations VALUES('20260922_work_refresh_state_recovery','old');
    CREATE TABLE work_item_refresh_state(owner_user_id TEXT,contour_id TEXT,scope_key TEXT,boundary_json TEXT,in_progress_cursor TEXT,initialized INTEGER,updated_at TEXT);`);
  const db = { getFirstAsync: async (sql, args=[]) => raw.prepare(sql).get(...args), runAsync: async (sql,args=[]) => raw.prepare(sql).run(...args) };
  const {runLocalMigration} = load(extract('src/db/database.ts','runLocalMigration'), ['runLocalMigration']);
  let schemaCallback = false;
  await runLocalMigration(db,'20260923_work_refresh_mode',async()=>{schemaCallback=true;raw.exec("ALTER TABLE work_item_refresh_state ADD COLUMN refresh_mode TEXT DEFAULT 'initial'");});
  assert.equal(schemaCallback,true);
  assert.equal(raw.prepare('SELECT refresh_mode FROM work_item_refresh_state').get(), undefined);
  results.push({case:'already applied migration', callbackExecuted:schemaCallback, refreshModeAdded:true});
  raw.close();

  const saved = new Map();
  const rows = Array.from({length:75},(_,i)=>({itemId:String(i)}));
  let displayed = rows.slice(0,25);
  const env = {
    loadingMore:false,tab:'tasks',taskHasMore:true,taskFilter:'mine',currentEmployeeId:'alice',
    listGenerationRef:{current:0},listContextRef:{current:'owner:test:mine:alice'},taskCursorRef:{current:'25'},remarkCursorRef:{current:null},tasksRef:{current:displayed},remarksRef:{current:[]},
    captureDataOwnerContext:async()=>({ownerUserId:'owner',contourId:'test'}),assertDataOwnerContext:async()=>{},
    listLocalWorkItemsPage:async(limit,cursor)=>{const start=Number(cursor||0);return{items:rows.slice(start,start+limit),nextCursor:start+limit<rows.length?String(start+limit):null};},
    listShiftRemarksPage:async()=>({items:[],nextCursor:null}),
    setTasks:value=>{displayed=typeof value==='function'?value(displayed):value;},setRemarks:()=>{},setLoadingMore:()=>{},setRefreshError:()=>{},setMessage:()=>{},
    setTaskHasMore:()=>{},setRemarkHasMore:()=>{},setWorkListVisibleLimit:async(key,n)=>saved.set(key,n),getWorkListVisibleLimit:async key=>saved.get(key)||25,
    listMobileEmployees:async()=>[],listEmuSections:async()=>[],getPatrolDeviceContext:async()=>({employeeId:'alice'}),setEmployees:()=>{},setSections:()=>{},setCurrentEmployeeId:()=>{},selectPatrolEmployee:async()=>{},useCallback:fn=>fn
  };
  env.listScope=(kind, contextKey)=>`local:${kind}:${contextKey}`;
  // The range is persisted with the exact context key used by reloadLocal.
  saved.set('local:tasks:owner:test:mine:alice',75);
  displayed=rows;
  env.tasksRef.current=displayed;
  assert.equal(displayed.length,75);
  const {reloadLocal}=load(extract(screen,'reloadLocal',true),['reloadLocal'],env);
  await reloadLocal(true);
  assert.equal(displayed.length,75);
  results.push({case:'load 75 then return',before:75,after:displayed.length,savedKeys:[...saved.keys()]});

  // A remark response resumes after its screen generation has changed.
  let release; let staleWrites=0;
  const remarkEnv={...env,tab:'remarks',remarkHasMore:true,listGenerationRef:{current:1},remarksRef:{current:[]},
    listShiftRemarksPage:()=>new Promise(resolve=>{release=resolve;}),setRemarks:()=>{staleWrites++;}};
  const pending=load(extract(screen,'handleLoadMore'),['handleLoadMore'],remarkEnv).handleLoadMore();
  remarkEnv.listGenerationRef.current=2;
  release({items:[{remarkId:'old-account-row'}],nextCursor:null});
  await pending;
  assert.equal(staleWrites,0);
  results.push({case:'late remark page after generation change',staleUiWrites:staleWrites});

  // Run the actual SQL page function: unassigned available records disappear under SQL NOT(NULL).
  const sqlDb=new DatabaseSync(':memory:');
  sqlDb.exec(`CREATE TABLE work_tasks(task_id TEXT,owner_user_id TEXT,employee_id TEXT,status TEXT,assigned_employees_json TEXT,actual_participants_json TEXT,planned_at TEXT,created_at_local TEXT);
    INSERT INTO work_tasks VALUES('unassigned','owner',NULL,'inProgress','[]','[]',NULL,NULL);`);
  const repoEnv={getStoredOwnerUserId:async()=>'owner',getDatabase:async()=>({getAllAsync:async(sql,args)=>sqlDb.prepare(sql).all(...args)}),decodeWorkItemCursor:()=>null,currentContourId:'test',
    workItemSelect:'SELECT *, ? AS contour FROM work_tasks',mapWorkItemRow:x=>x,encodeWorkItemCursor:()=>null};
  const {listLocalWorkItemsPage}=load(extract('src/db/repositories/workTaskRepository.ts','listLocalWorkItemsPage'),['listLocalWorkItemsPage'],repoEnv);
  const available=await listLocalWorkItemsPage(25,null,'available','alice');
  assert.equal(available.items.length,1);
  results.push({case:'available SQL with employee filter',savedUnassignedRows:1,returnedRows:available.items.length});
  sqlDb.close();
  const settings='src/core/serverSettings.ts';
  const {normalizeServerBaseUrl}=load(extract(settings,'normalizeServerBaseUrl')+'\n'+extract(settings,'normalizeServerBasePath'),['normalizeServerBaseUrl']);
  const normalized=normalizeServerBaseUrl('https://192.168.2.194');
  assert.equal(normalized,'https://192.168.2.194');
  results.push({case:'explicit HTTPS address',input:'https://192.168.2.194',actual:normalized});

  const reportDb = new DatabaseSync(':memory:');
  reportDb.exec(`CREATE TABLE patrol_assignments(owner_user_id TEXT,contour_id TEXT,assignment_id TEXT,status TEXT,local_report_present INTEGER,local_report_needs_review INTEGER);
    INSERT INTO patrol_assignments VALUES('owner','test','ambiguous','syncError',1,1);
    CREATE TABLE outbox_commands(client_operation_id TEXT,status TEXT,last_error TEXT,owner_user_id TEXT,contour_id TEXT,command_type TEXT,entity_local_id TEXT,sequence_no INTEGER,created_at_local TEXT);`);
  const {getPatrolReportState}=load(extract('src/services/patrolNavigationService.ts','getPatrolReportState'),['getPatrolReportState'],{getDatabase:async()=>({getFirstAsync:async(sql,args)=>reportDb.prepare(sql).get(...args)})});
  const report=await getPatrolReportState({ownerUserId:'owner',contourId:'test'},'ambiguous');
  assert.equal(report.completedLocally,false);
  assert.equal(report.completionOperationId,null);
  results.push({case:'report requiring review, no completion operation',incorrectlyCompleted:report.completedLocally});
  reportDb.close();
  process.stdout.write(JSON.stringify(results,null,2)+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
