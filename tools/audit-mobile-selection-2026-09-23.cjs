// Read-only diagnostics of actual functions with controlled IO and in-memory SQLite.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../mobiel proekt');
const ts = require(path.join(root, 'node_modules/typescript'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(source, dependencies = {}) {
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', js)(name => { if (!(name in dependencies)) throw Error(name); return dependencies[name]; }, exports);
  return exports;
}
function extract(file, name) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  return ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast);
}
(async () => {
  const results = [];
  const resolve = load('const isRecoverableLifecycleRejection = () => false; export ' + extract('src/db/repositories/outboxRepository.ts', 'resolveReportDeliveryRows')).resolveReportDeliveryRows;
  const delivery = resolve([{ clientOperationId: 'point-op', commandType: 'markPatrolPointOk', status: 'pending', lastError: null, nextAttemptAt: null, updatedAtLocal: null, attemptCount: 0 }]);
  const presentation = load(read('src/features/patrol/reportDeliveryPresentation.ts'), { '../../auth/sessionErrors.ts': { isReauthenticationRequiredError: () => false } }).getReportDeliveryPresentation(delivery);
  assert.equal(presentation.action, 'retry');
  const navigation = load(read('src/services/patrolNavigationService.ts'), {
    '@/auth/dataOwnerContext': { captureDataOwnerContext: async () => ({ownerUserId:'owner',contourId:'test',generation:1}), assertDataOwnerContext: async () => {} },
    '@/db/repositories/patrolContextRepository': { getPatrolDeviceContext: async () => ({assignmentId:'A',employeeId:'alice'}) },
    '@/db/repositories/patrolRepository': { getAssignmentById: async () => ({status:'inProgress',requestId:'R'}), getAssignmentScanPolicy: async () => ({nfcEnabled:true}) },
    '@/db/repositories/outboxRepository': { getReportDeliveryState: async () => delivery },
    '@/db/database': {}, './patrolEntryService': { patrolScanPath: () => '/scan-nfc' }
  });
  const restored = await navigation.resolvePatrolStartPath();
  assert.equal(restored, '/patrol/assignment/A/submit');
  results.push({case:'unfinished patrol, pending point command, no completion command',delivery:delivery.status,reportButtonAction:presentation.action,restored});

  const {createPointDraftController} = load(read('src/services/pointDraftController.ts'));
  let release, entered;
  const started = new Promise(resolve => entered=resolve);
  const gate = new Promise(resolve => release=resolve);
  const writes=[];
  const controller=createPointDraftController(async value => { entered(); await gate; writes.push(value); }, error => { throw error; }, 10000);
  controller.update('old');
  const flushing=controller.flush();
  await started;
  controller.update('latest characters');
  release(); await flushing;
  const stillDirty=controller.dirty;
  controller.close(); // form navigates and focus cleanup closes the controller
  await controller.flush();
  assert.deepEqual(writes,['old']); assert.equal(stillDirty,true);
  results.push({case:'input during navigation flush',writes,stillDirtyAtNavigation:stillDirty});

  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE mobile_capabilities(owner_user_id TEXT,contour_id TEXT,work_items_paging INTEGER);
    INSERT INTO mobile_capabilities VALUES('owner','test',1);
    CREATE TABLE work_item_cursors(owner_user_id TEXT,contour_id TEXT,scope_key TEXT,next_cursor TEXT,updated_at TEXT,PRIMARY KEY(owner_user_id,contour_id,scope_key));
    INSERT INTO work_item_cursors VALUES('owner','test','work:history:all','old-page-4','now');
    CREATE TABLE work_item_refresh_state(owner_user_id TEXT,contour_id TEXT,scope_key TEXT,boundary_json TEXT,in_progress_cursor TEXT,initialized INTEGER,updated_at TEXT,PRIMARY KEY(owner_user_id,contour_id,scope_key));
    INSERT INTO work_item_refresh_state VALUES('owner','test','work:history:all','broken-json','new-page-2',1,'now');`);
  const db={getFirstAsync:async(sql,args=[])=>raw.prepare(sql).get(...args),runAsync:async(sql,args=[])=>raw.prepare(sql).run(...args)};
  const item=id=>({itemId:id,revision:1,status:'completedServer',assignedEmployees:[],actualParticipants:[]});
  const items=new Map(Array.from({length:75},(_,i)=>['old'+i,item('old'+i)]));
  const fresh=Array.from({length:40},(_,i)=>item('new'+i)); const calls=[];
  const service=load(read('src/services/workTaskService.ts'),{
    '@/auth/dataOwnerContext':{captureDataOwnerContext:async()=>({ownerUserId:'owner',contourId:'test'}),assertDataOwnerContext:async()=>{}},
    '@/api/emuApi':{normalizeWorkItems:x=>x},
    '@/api/mobileApi':{getWorkItemsPage:async(_scope,_employee,cursor)=>{calls.push(cursor);return cursor===null?{items:fresh.slice(0,25),nextCursor:'new-page-2'}:{items:fresh.slice(25),nextCursor:null};}},
    '@/core/environments':{currentContourId:'test'},'@/db/database':{getDatabase:async()=>db},
    '@/db/repositories/workTaskRepository':{listLocalWorkItems:async()=>[...items.values()],saveWorkItems:async(page,_scope,after)=>{page.forEach(row=>items.set(row.itemId,row));await after(db);}},
    '@/db/repositories/patrolContextRepository':{},'@/services/mobileErrorReporter':{}
  });
  await service.refreshWorkItemsHead('history');
  const cursor=raw.prepare('SELECT next_cursor FROM work_item_cursors').get().next_cursor;
  assert.equal(items.size,100); assert.deepEqual(calls,[null]); assert.equal(cursor,'old-page-4');
  results.push({case:'corrupt head boundary, 75 old + 40 new',available:items.size,expected:115,calls,oldCursor:cursor});
  raw.close();
  console.log(JSON.stringify(results,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
