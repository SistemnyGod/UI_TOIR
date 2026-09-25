// Read-only audit: execute current TypeScript functions with controlled IO.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../mobiel proekt');
const ts = require(path.join(root, 'node_modules/typescript'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function evaluate(source, env = {}) {
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', ...Object.keys(env), js)(exports, ...Object.values(env));
  return exports;
}
function find(file, predicate) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  function visit(node) { if (predicate(node)) result = node; else ts.forEachChild(node, visit); }
  visit(ast);
  if (!result) throw Error('Missing AST node in ' + file);
  return result.getText(ast);
}
const screen = 'src/features/emuTask/WorkAccountingScreen.tsx';
const declaration = name => find(screen, n => ts.isFunctionDeclaration(n) && n.name?.text === name);
const results = [];
(async () => {
  const source = find('src/services/patrolNavigationService.ts', n => ts.isFunctionDeclaration(n) && n.name?.text === 'getPatrolReportState');
  const { getPatrolReportState } = evaluate(source, { getDatabase: async () => ({ getFirstAsync: async sql => sql.includes('FROM patrol_assignments') ? {status:'syncError',localReportPresent:0} : null }) });
  const report = await getPatrolReportState({ownerUserId:'owner',contourId:'test'}, 'A');
  assert.equal(report.completedLocally, false);
  assert.equal(report.completionOperationId, null);
  results.push({ case:'point delivery error without report', incorrectlyCompleted:report.completedLocally });

  const reload = find(screen, n => ts.isVariableDeclaration(n) && n.name.getText() === 'reloadLocal');
  const calls = [];
  const env = {
    taskFilter:'mine', currentEmployeeId:'alice',
    listContextRef:{current:null}, listGenerationRef:{current:0},
    taskCursorRef:{current:null},remarkCursorRef:{current:null},tasksRef:{current:[]},remarksRef:{current:[]},
    getWorkListVisibleLimit:async()=>75,
    listLocalWorkItemsPage:async(_limit,cursor)=>{calls.push(cursor);const page=calls.length;return {items:Array.from({length:25},(_,i)=>({itemId:String((page-1)*25+i)})),nextCursor:page<3?'page'+page:null};},
    listShiftRemarksPage:async()=>({items:[],nextCursor:null}),listMobileEmployees:async()=>[],listEmuSections:async()=>[],
    getPatrolDeviceContext:async()=>({employeeId:null}),
    captureDataOwnerContext:async()=>({ownerUserId:'owner',contourId:'test'}),
    assertDataOwnerContext:async()=>{},
    setTasks:items=>env.loaded=items.length,setRemarks:()=>{},setTaskHasMore:()=>{},setRemarkHasMore:()=>{},
    setWorkListVisibleLimit:async(key,limit)=>{if(key.startsWith('local:tasks'))env.savedLimit=limit;},
    setEmployees:()=>{},setSections:()=>{},setCurrentEmployeeId:()=>{},selectPatrolEmployee:async()=>{},useCallback:fn=>fn
  };
  await evaluate('export const '+reload,env).reloadLocal(true);
  assert.equal(env.loaded,75); assert.equal(env.savedLimit,75); assert.equal(calls.length,3);
  results.push({case:'restore saved 75-row range',loaded:env.loaded,persistedLimit:env.savedLimit});

  let httpCalls=0,localReads=0,error=null;
  const moreEnv = {loadingMore:false,tab:'tasks',taskHasMore:false,taskCursorRef:{current:null},listGenerationRef:{current:0},tasksRef:{current:[]},setLoadingMore:()=>{},setMessage:()=>{},
    taskFilter:'mine',currentEmployeeId:'alice',loadMoreWorkItems:async()=>{httpCalls++;return 'server-page2';},
    listLocalWorkItemsPage:async()=>{localReads++;return {items:[],nextCursor:null};},setRefreshError:value=>error=value};
  await evaluate('export '+declaration('handleLoadMore'),moreEnv).handleLoadMore();
  assert.equal(httpCalls,0);
  results.push({case:'25 cached rows, further server page exists',httpCalls,localReads});
  moreEnv.taskHasMore=true;moreEnv.taskCursorRef.current='cached-page2';
  moreEnv.loadMoreWorkItems=async()=>{throw Error('offline');};
  await evaluate('export '+declaration('handleLoadMore'),moreEnv).handleLoadMore();
  assert.equal(localReads,1);assert.equal(error,'offline');
  results.push({case:'cached next page while offline',localReads,error});
  const { DatabaseSync } = require('node:sqlite');
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE mobile_capabilities(owner_user_id TEXT,contour_id TEXT,work_items_paging INTEGER);
    INSERT INTO mobile_capabilities VALUES('owner','test',1);
    CREATE TABLE work_item_cursors(owner_user_id TEXT,contour_id TEXT,scope_key TEXT,next_cursor TEXT,updated_at TEXT,PRIMARY KEY(owner_user_id,contour_id,scope_key));
    INSERT INTO work_item_cursors VALUES('owner','test','work:history:all','old-page4','now');
    CREATE TABLE work_item_refresh_state(owner_user_id TEXT,contour_id TEXT,scope_key TEXT,boundary_json TEXT,refresh_mode TEXT DEFAULT 'initial',in_progress_cursor TEXT,initialized INTEGER,updated_at TEXT,PRIMARY KEY(owner_user_id,contour_id,scope_key));
    INSERT INTO work_item_refresh_state VALUES('owner','test','work:history:all','broken-json','recovery','new-page2',1,'now');`);
  const db={getFirstAsync:async(sql,args=[])=>raw.prepare(sql).get(...args),runAsync:async(sql,args=[])=>raw.prepare(sql).run(...args)};
  const item=id=>({itemId:id,revision:1,status:'completedServer',assignedEmployees:[],actualParticipants:[]});
  const fresh=Array.from({length:40},(_,i)=>item('new'+i));
  const items=new Map([...Array.from({length:75},(_,i)=>['old'+i,item('old'+i)]), ...fresh.slice(0,25).map(row=>[row.itemId,row])]);
  const historyCalls=[];let fail=true;
  const dependencies={
    '@/auth/dataOwnerContext':{captureDataOwnerContext:async()=>({ownerUserId:'owner',contourId:'test'}),assertDataOwnerContext:async()=>{}},
    '@/api/emuApi':{normalizeWorkItems:x=>x},
    '@/api/mobileApi':{getWorkItemsPage:async(_scope,_employee,cursor)=>{historyCalls.push(cursor);if(cursor&&fail)throw Error('offline');return cursor===null?{items:fresh.slice(0,25),nextCursor:'new-page2'}:{items:fresh.slice(25),nextCursor:null};}},
    '@/core/environments':{currentContourId:'test'},'@/db/database':{getDatabase:async()=>db},
    '@/db/repositories/workTaskRepository':{listLocalWorkItems:async()=>[...items.values()],saveWorkItems:async(page,_scope,after)=>{page.forEach(row=>items.set(row.itemId,row));await after(db);}},
    '@/db/repositories/patrolContextRepository':{},'@/services/mobileErrorReporter':{}
  };
  const service=()=>evaluate(read('src/services/workTaskService.ts'),{require:name=>{if(!(name in dependencies))throw Error(name);return dependencies[name];}});
  await assert.rejects(service().refreshWorkItemsHead('history'),/offline/);
  assert.equal(raw.prepare('SELECT in_progress_cursor FROM work_item_refresh_state').get().in_progress_cursor,'new-page2');
  fail=false;
  await service().refreshWorkItemsHead('history');
  assert.deepEqual(historyCalls,['new-page2', 'new-page2']);
  assert.equal(items.size,115);
  results.push({case:'interrupted corrupt-boundary recovery, recreated service',historyCalls,available:items.size,staleOldCursor:raw.prepare('SELECT next_cursor FROM work_item_cursors').get().next_cursor});
  raw.close();
  process.stdout.write(JSON.stringify(results,null,2)+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
