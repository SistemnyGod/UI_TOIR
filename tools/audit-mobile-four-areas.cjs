// Read-only diagnostics: actual TypeScript functions, isolated in-memory SQLite.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../mobiel proekt');
const ts = require(path.join(root, 'node_modules/typescript'));
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
function load(source, mocks = {}) {
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', out)(name => {
    if (!(name in mocks)) throw Error('Unexpected import ' + name);
    return mocks[name];
  }, exports);
  return exports;
}
function extract(file, name) {
  const source = read(file);
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  return ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(ast);
}
function database() {
  const raw = new DatabaseSync(':memory:');
  const db = {
    getFirstAsync: async (sql, args = []) => raw.prepare(sql).get(...args),
    runAsync: async (sql, args = []) => raw.prepare(sql).run(...args),
    execAsync: async sql => raw.exec(sql)
  };
  return { raw, db };
}
const results = [];
(async () => {
  // Existing migration marker must not silently leave a newly added table absent.
  const { raw, db } = database();
  raw.exec("CREATE TABLE schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT); INSERT INTO schema_migrations VALUES ('20260922_work_paging_and_drafts','old');");
  const migration = load('export ' + extract('src/db/database.ts', 'runLocalMigration')).runLocalMigration;
  let invoked = false;
  await migration(db, '20260922_work_paging_and_drafts', async () => { invoked = true; raw.exec('CREATE TABLE work_item_refresh_state(id TEXT)'); });
  results.push({case:'existing migration marker', callbackInvoked:invoked, newTableExists:!!raw.prepare("SELECT name FROM sqlite_master WHERE name='work_item_refresh_state'").get()});
  raw.close();

  // A timer scheduled by the form before deletion can fire before the delete handler closes it.
  const drafts = database();
  drafts.raw.exec('CREATE TABLE work_form_drafts(owner_user_id TEXT, contour_id TEXT, employee_id TEXT, form_kind TEXT, entity_id TEXT, payload_json TEXT, updated_at TEXT, PRIMARY KEY(owner_user_id,contour_id,employee_id,form_kind,entity_id));');
  let releaseDelete, deletedSignal;
  const deleted = new Promise(r => deletedSignal = r);
  const release = new Promise(r => releaseDelete = r);
  const repository = load(read('src/db/repositories/workDraftRepository.ts'), {
    '@/auth/tokenStorage':{getStoredOwnerUserId:async()=> 'owner'},
    '@/core/environments':{currentContourId:'contour'},
    '@/db/database':{getDatabase:async()=>drafts.db, withProtectedExclusiveTransactionAsync:async(_, action)=>{await action(drafts.db); deletedSignal(); await release;}}
  });
  const context = {ownerUserId:'owner',contourId:'contour'};
  await repository.saveWorkDraftForContext(context,'employee','task',{text:'old'});
  const scheduledCallback = () => repository.saveWorkDraftForContext(context,'employee','task',{text:'latest'});
  const deletion = repository.deleteWorkDraftForContext(context,'employee','task');
  await deleted;
  await scheduledCallback();
  releaseDelete(); await deletion;
  results.push({case:'late autosave during deletion', restored:await repository.readWorkDraftForContext(context,'employee','task')});
  drafts.raw.close();

  // Actual head-refresh function; HTTP and work-row storage are controlled dependencies.
  const history = database();
  history.raw.exec("CREATE TABLE mobile_capabilities(owner_user_id TEXT,contour_id TEXT,work_items_paging INTEGER); INSERT INTO mobile_capabilities VALUES('owner','contour',1); CREATE TABLE work_item_cursors(owner_user_id TEXT,contour_id TEXT,scope_key TEXT,next_cursor TEXT,updated_at TEXT,PRIMARY KEY(owner_user_id,contour_id,scope_key)); INSERT INTO work_item_cursors VALUES('owner','contour','work:history:all','old75','now'); CREATE TABLE work_item_refresh_state(owner_user_id TEXT,contour_id TEXT,scope_key TEXT,boundary_json TEXT,in_progress_cursor TEXT,initialized INTEGER,updated_at TEXT,PRIMARY KEY(owner_user_id,contour_id,scope_key));");
  const item = id => ({itemId:id,revision:1,status:'completedServer',assignedEmployees:[],actualParticipants:[]});
  const old = Array.from({length:75},(_,i)=>item('old'+i));
  const fresh = Array.from({length:40},(_,i)=>item('new'+i));
  const local = new Map(old.map(x=>[x.itemId,x]));
  let fail = true;
  const calls=[];
  const mocks = {
    '@/auth/dataOwnerContext':{captureDataOwnerContext:async()=>context,assertDataOwnerContext:async()=>{}},
    '@/api/emuApi':{normalizeWorkItems:x=>x},
    '@/api/mobileApi':{getWorkItemsPage:async(_scope,_employee,cursor)=>{calls.push(cursor); if(cursor==='page2' && fail)throw Error('offline'); return cursor===null?{items:fresh.slice(0,25),nextCursor:'page2'}:{items:[...fresh.slice(25),...old.slice(0,10)],nextCursor:'page3'};}},
    '@/core/environments':{currentContourId:'contour'},
    '@/db/database':{getDatabase:async()=>history.db},
    '@/db/repositories/workTaskRepository':{listLocalWorkItems:async()=>[...local.values()],saveWorkItems:async items=>items.forEach(x=>local.set(x.itemId,x))},
    '@/db/repositories/patrolContextRepository':{},
    '@/services/mobileErrorReporter':{}
  };
  let service=load(read('src/services/workTaskService.ts'),mocks);
  try {await service.refreshWorkItemsHead('history');}catch(e){if(e.message!=='offline')throw e;}
  const persisted=history.raw.prepare('SELECT in_progress_cursor FROM work_item_refresh_state').get();
  fail=false; service=load(read('src/services/workTaskService.ts'),mocks); // process/module restart
  await service.refreshWorkItemsHead('history');
  results.push({case:'75 old + 40 new, second-page failure and restart',calls,persisted,available:local.size});
  history.raw.close();

  // Real snapshot writer and policy, accepting a supplied partial snapshot.
  const policy=load(read('src/domain/patrol/snapshotPolicy.ts'));
  const snapshot=load("import {getSnapshotRefreshPlan} from 'policy'; const currentContourId='contour'; export " + extract('src/db/repositories/bootstrapRepository.ts','refreshAssignmentSnapshotInTransaction'),{policy}).refreshAssignmentSnapshotInTransaction;
  const snap=database();
  snap.raw.exec("CREATE TABLE patrol_assignments(owner_user_id TEXT,assignment_id TEXT,contour_id TEXT,status TEXT,snapshot_version INTEGER,route_version_no INTEGER,snapshot_created_at TEXT,snapshot_source TEXT,snapshot_ready INTEGER,snapshot_allow_free_order INTEGER,snapshot_nfc_enabled INTEGER,snapshot_qr_fallback_enabled INTEGER); INSERT INTO patrol_assignments(owner_user_id,assignment_id,contour_id,status,snapshot_version,snapshot_ready) VALUES('owner','a','contour','accepted',0,0); CREATE TABLE assignment_route_points(assignment_id TEXT,point_id TEXT,route_id TEXT,name TEXT,description TEXT,instruction TEXT,order_index INTEGER,nfc_uid_hash TEXT,qr_code_hash TEXT,required INTEGER,requires_photo INTEGER,revision INTEGER);");
  await snapshot(snap.db,{assignmentId:'a',routeId:'r',routeVersionNo:2},{user:{serverUserId:'owner'},serverTime:'now',routes:[{routeId:'r',version:2}],points:[{pointId:'p1',routeId:'r',name:'Point',description:null,instruction:null,orderIndex:1,nfcUidHash:null,qrCodeHash:null,required:true,requiresPhoto:false,revision:1}]});
  results.push({case:'snapshot with one incoming point and no dictionary checks',...snap.raw.prepare('SELECT snapshot_ready,snapshot_version FROM patrol_assignments').get()});
  snap.raw.close();
  console.log(JSON.stringify(results,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
