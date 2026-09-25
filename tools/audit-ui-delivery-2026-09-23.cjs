// Read-only audit. Actual TypeScript functions, controlled promises and SQLite.
// This diagnoses current defects; it is not a passing regression acceptance suite.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../mobiel proekt');
const ts = require(path.join(root, 'node_modules/typescript'));
function extract(file, name, variable = false) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
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
function whole(file) { return fs.readFileSync(path.join(root, file), 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, ''); }
const noop = () => {};
const tick = () => new Promise(resolve => setImmediate(resolve));
const results = [];
async function run() {
  const settingsFile = 'src/core/serverSettings.ts';
  const order = load(whole('src/core/serverCandidatePolicy.ts'), ['orderServerCandidateBaseUrls']).orderServerCandidateBaseUrls;
  const defaultEnvironment = { name: 'local-enterprise', apiBaseUrl: 'http://192.168.2.194:5173', allowedBaseUrls: ['http://192.168.2.194:5173', 'http://31.173.110.118'] };
  const settings = load(whole(settingsFile), ['normalizeServerBaseUrl', 'getServerCandidateBaseUrls', 'isAllowedServerBaseUrl'], {
    SecureStore: { getItemAsync: async () => null }, defaultEnvironment, currentContourId: 'test', orderServerCandidateBaseUrls: order
  });
  const secure = settings.normalizeServerBaseUrl('https://192.168.2.194:5173');
  assert.equal(settings.isAllowedServerBaseUrl(secure), false);
  const candidates = await settings.getServerCandidateBaseUrls(secure);
  assert(candidates.every(value => value.startsWith('http:')));
  results.push({case:'HTTPS for existing allowed local host', normalized:secure, allowed:false, candidateSchemes:candidates.map(value => new URL(value).protocol)});
  defaultEnvironment.allowedBaseUrls.push(secure);
  const mixed = await settings.getServerCandidateBaseUrls(secure);
  assert(mixed.includes(secure) && mixed.some(value => value.startsWith('http:')));
  results.push({case:'Even explicitly allowlisted HTTPS retains HTTP fallback', candidateSchemes:mixed.map(value => new URL(value).protocol)});

  const httpRequests=[]; const persisted=[];
  const {sendMobileRequestWithFailover} = load(extract('src/api/httpClient.ts','sendMobileRequestWithFailover'),['sendMobileRequestWithFailover'],{
    getServerCandidateBaseUrls:async()=>mixed,probeServerHealthCached:async url=>({ok:!url.startsWith('https:'),message:'TLS failure'}),
    sendMobileRequest:async url=>{httpRequests.push(url);return{status:200,ok:true};},shouldTryNextServer:()=>false,
    getMobileConnectionContextGeneration:()=>9,setServerBaseUrl:async url=>{persisted.push(url);},invalidateServerHealthCache:noop,recordMobileConnectionOutcome:noop
  });
  await sendMobileRequestWithFailover(secure,'/api/v1/mobile/outbox',{connectionContextGeneration:1,deadline:{remaining:()=>1000,wait:p=>p}},'test-token');
  assert(httpRequests[0].startsWith('http:'));
  assert.equal(persisted.length,1);
  results.push({case:'TLS failure falls back and stale generation persists address',httpRequest:true,staleAddressWrites:persisted.length});

  const tokens = ['token-account-A', 'token-account-B']; const requests = [];
  const { mobileRequestWithinDeadline } = load(extract('src/api/httpClient.ts','mobileRequestWithinDeadline'), ['mobileRequestWithinDeadline'], {
    getMobileConnectionContextGeneration: () => 1,
    getAccessToken: async () => tokens.shift(), getMobileRuntimeConfig: async () => ({apiBaseUrl:'http://test.invalid'}),
    sendMobileRequestWithFailover: async (_url, requestPath, options, token) => {
      requests.push({requestPath, body:options.body, token});
      return {apiBaseUrl:'http://test.invalid', contextGeneration:1, response: requests.length===1
        ? {status:401,ok:false} : {status:200,ok:true,json:async()=>({ok:true})}};
    }, parseMobileResponse: (_schema,value) => value, recordMobileConnectionOutcome:noop
  });
  await mobileRequestWithinDeadline('/api/v1/mobile/outbox', {}, {method:'POST',body:'unchanged-operation-A'});
  assert.deepEqual(requests.map(r=>r.token),['token-account-A','token-account-B']);
  results.push({case:'401 after account change',sameBodyReplayed:true,usedAccounts:['A','B']});

  let repairCalls=0; const routes=[];
  const {handlePrimaryAction} = load(extract('src/features/patrol/SubmitReportScreen.tsx','handlePrimaryAction'), ['handlePrimaryAction'], {
    isSubmitting:false,readiness:{ready:false},assignmentId:'A',presentation:{action:'repair'},
    router:{push:value=>routes.push(value)},reopenInvalidCompletionReportLocally:async()=>{repairCalls++;}
  });
  await handlePrimaryAction(); assert.equal(repairCalls,0);
  results.push({case:'Incomplete rejected report skips reopen action',repairCalls,routes});

  const policy=load(whole('src/domain/patrol/patrolStateMachine.ts'),['canPatrolAction']);
  const {getPatrolReportState}=load(extract('src/services/patrolNavigationService.ts','getPatrolReportState'),['getPatrolReportState'],{
    getDatabase:async()=>({getFirstAsync:async sql=>sql.includes('FROM patrol_assignments')?{status:'syncError',localReportPresent:0,localReportNeedsReview:0}:undefined})
  });
  const errorReport=await getPatrolReportState({ownerUserId:'alice',contourId:'test'},'A');
  assert.equal(errorReport.completedLocally,false);
  assert.equal(policy.canPatrolAction('completeAssignment','syncError'),false);
  results.push({case:'Rejected point without report',reportExists:false,completionAllowed:false,editingAllowed:policy.canPatrolAction('editPoint','syncError'),deliveryHiddenByScreen:true});

  let fileReads=0;
  const {isReportFullyDelivered} = load(extract('src/services/patrolNavigationService.ts','isReportFullyDelivered'), ['isReportFullyDelivered'], {
    getReportDeliveryState:async()=>({status:'delivered',clientOperationId:'done'}),
    getDatabase:async()=>({getFirstAsync:async()=>({payload:'{"pointResults":[{}]}'}),getAllAsync:async()=>{fileReads++;return [];}}),
    assertDataOwnerContext:async()=>{}
  });
  const delivered = await isReportFullyDelivered({ownerUserId:'a',contourId:'test'},'A');
  assert.equal(delivered,true);
  results.push({case:'Malformed accepted completion with empty point object',fullyDelivered:delivered,fileReads});

  let stopRelease; const navigation=[];
  const active={current:true};
  const {handleTag} = load(extract('src/features/patrol/ScanNfcScreen.tsx','handleTag',true), ['handleTag'], {
    useCallback:fn=>fn,screenActiveRef:active,appActiveRef:{current:true},scanInProgressRef:{current:false},lastTagRef:{current:null},
    getNfcCodes:()=>['tag'],setStatus:noop,setMessage:noop,Vibration:{vibrate:noop},assignmentId:'OLD',
    scanPointByNfc:async()=>({matched:true,point:{pointId:'point'}}),
    stopNfcReaderSession:()=>new Promise(resolve=>{stopRelease=resolve;}),router:{replace:value=>navigation.push(value)}
  });
  const scanning=handleTag({}); await tick(); active.current=false; stopRelease(); await scanning;
  assert.equal(navigation.length,1);
  results.push({case:'NFC cleanup completes after leaving scanner',navigationAfterBlur:navigation});

  let callback; let fail=true; const dispatches=[];
  const file='src/features/patrol/PointFillScreen.tsx';
  const src=fs.readFileSync(path.join(root,file),'utf8');
  const ast=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(n) {
    if(ts.isCallExpression(n) && n.expression.getText(ast)==='usePreventRemove') callback=n.getText(ast);
    else ts.forEachChild(n,visit);
  }
  visit(ast);
  const pending={current:null}; const leaving={current:false}; let beforeRemove;
  load(callback,[],{usePreventRemove:(_condition,cb)=>{beforeRemove=cb;},point:{},savedRef:{current:false},finalizingRef:{current:false},leaving,
    pendingLeaveAction:pending,setHasPendingLeave:noop,setIsSavingBeforeLeave:noop,setError:noop,
    flushDraft:async()=>{if(fail)throw Error('SQLite failure');},navigation:{dispatch:a=>dispatches.push(a)}});
  beforeRemove({data:{action:'first-direction'}}); await tick(); fail=false;
  beforeRemove({data:{action:'second-direction'}}); await tick();
  assert.deepEqual(dispatches,['second-direction']);
  results.push({case:'First pending navigation is replaced after SQLite error',dispatched:dispatches});

  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE mobile_capabilities(owner_user_id TEXT,contour_id TEXT,patrol_appeals INTEGER,patrol_appeals_paging INTEGER,patrol_appeals_assignment_paging INTEGER);
    INSERT INTO mobile_capabilities VALUES('alice','test',1,1,1);
    CREATE TABLE patrol_appeals(id TEXT,owner_user_id TEXT,contour_id TEXT,assignment_id TEXT,kind TEXT,message TEXT,status TEXT,reply TEXT,created_at TEXT,version INTEGER,PRIMARY KEY(id,owner_user_id,contour_id));
    CREATE TABLE outbox_commands(entity_local_id TEXT,owner_user_id TEXT,contour_id TEXT,status TEXT,created_at_local TEXT);
    CREATE TABLE patrol_appeal_cursors(owner_user_id TEXT,contour_id TEXT,scope_key TEXT,next_cursor TEXT,updated_at TEXT,PRIMARY KEY(owner_user_id,contour_id,scope_key));
    CREATE TABLE patrol_appeal_refresh_state(owner_user_id TEXT,contour_id TEXT,scope_key TEXT,initialized INTEGER,refresh_mode TEXT,boundary_json TEXT,confirmed_cursor TEXT,in_progress_cursor TEXT,visible_limit INTEGER,updated_at TEXT,PRIMARY KEY(owner_user_id,contour_id,scope_key));`);
  const db={getFirstAsync:async(sql,args=[])=>raw.prepare(sql).get(...args),getAllAsync:async(sql,args=[])=>raw.prepare(sql).all(...args),runAsync:async(sql,args=[])=>raw.prepare(sql).run(...args)};
  const appeal=i=>({id:String(i).padStart(3,'0'),assignmentId:'route',kind:'message',message:'m',status:'closed',reply:null,createdAt:new Date(Date.UTC(2026,0,1,0,i)).toISOString(),version:1});
  const insert=item=>raw.prepare('INSERT OR REPLACE INTO patrol_appeals VALUES(?,?,?,?,?,?,?,?,?,?)').run(item.id,'alice','test',item.assignmentId,item.kind,item.message,item.status,item.reply,item.createdAt,item.version);
  const apiCalls=[]; const all=Array.from({length:65},(_,i)=>appeal(65-i));
  const repo=load(whole('src/db/repositories/patrolAppealRepository.ts'),['loadPatrolAppeals','readPatrolAppealsPage'],{
    getDatabase:async()=>db,getStoredOwnerUserId:async()=>'alice',currentContourId:'test',captureDataOwnerContext:async()=>({ownerUserId:'alice',contourId:'test',generation:1}),assertDataOwnerContext:async()=>{},
    withProtectedExclusiveTransactionAsync:async(_db,action)=>{raw.exec('BEGIN');try{const r=await action(db);raw.exec('COMMIT');return r;}catch(e){raw.exec('ROLLBACK');throw e;}},
    getPatrolAppealsPage:async(size,cursor)=>{apiCalls.push(cursor);const offset=Number(cursor||0);return{items:all.slice(offset,offset+size),nextCursor:offset+size<all.length?String(offset+size):null};}
  });
  for(let i=1;i<=25;i++)insert(appeal(i));
  await repo.loadPatrolAppeals('route');
  assert.deepEqual(apiCalls,[null]);
  const count=raw.prepare('SELECT COUNT(*) AS n FROM patrol_appeals').get().n;
  assert.equal(count,50);
  results.push({case:'Appeal head refresh with 25 old and 40 new',requestedCursors:apiCalls,cached:count,expected:65,unfetched:15});
  raw.exec('DELETE FROM patrol_appeals');
  for(let i=36;i<=60;i++)insert(appeal(i));
  const first=await repo.readPatrolAppealsPage('route','message');
  for(let i=11;i<=35;i++)insert(appeal(i));
  const second=await repo.readPatrolAppealsPage('route','message',first.nextCursor);
  assert.equal(second.items.length,0);
  results.push({case:'Older server appeals precede local ascending cursor',firstPage:25,olderAdded:25,nextLocalPage:second.items.length});
  raw.close();

  const appealsScreen='src/features/patrol/PatrolAppealScreen.tsx'; let displayReads=0;let more=true;
  const moreEnv={loadingMore:false,hasMore:true,setLoadingMore:noop,setError:noop,generationRef:{current:1},contextRef:{current:{ownerUserId:'alice'}},localHasMoreRef:{current:false},localCursorRef:{current:'end'},
    assignmentId:'route',mode:'message',loadMorePatrolAppeals:async()=>null,assertDataOwnerContext:async()=>{},readPatrolAppealsPage:async()=>{displayReads++;return{items:[],nextCursor:null};},setHasMore:value=>{more=value;}};
  await load(extract(appealsScreen,'loadMore'),['loadMore'],moreEnv).loadMore();
  assert.equal(displayReads,0);assert.equal(more,false);
  results.push({case:'Final server page persisted but not read for display',displayReads,hasMore:more});

  let busy=false;let release;const generation={current:1};
  const staleEnv={...moreEnv,generationRef:generation,setLoadingMore:value=>{busy=value;},loadMorePatrolAppeals:()=>new Promise(resolve=>{release=resolve;})};
  const morePending=load(extract(appealsScreen,'loadMore'),['loadMore'],staleEnv).loadMore();
  generation.current=2;release(null);await morePending;assert.equal(busy,true);
  results.push({case:'Local sync reload invalidates loadMore finally',loadingMoreStillTrue:busy});

  let cachedReads=0; const offlineEnv={useCallback:fn=>fn,assignmentId:'route',mode:'message',generationRef:{current:1},contextRef:{current:null},captureDataOwnerContext:async()=>({ownerUserId:'alice'}),
    loadPatrolAppeals:async()=>{throw Error('offline');},readPatrolAppeals:async()=>{cachedReads++;},readPatrolAppealsPage:async()=>{cachedReads++;},setError:noop};
  await load(extract(appealsScreen,'load',true),['load'],offlineEnv).load(true);
  assert.equal(cachedReads,0);
  results.push({case:'Appeal open offline does not read saved history',cachedReads});

  const sw = new DatabaseSync(':memory:');
  sw.exec(`CREATE TABLE outbox_commands(owner_user_id TEXT,contour_id TEXT,client_operation_id TEXT,status TEXT,command_type TEXT,payload_json TEXT,created_at_local TEXT,aggregate_key TEXT,attempt_count INTEGER);
    CREATE TABLE patrol_assignments(owner_user_id TEXT,contour_id TEXT,assignment_id TEXT,request_id TEXT,status TEXT,employee_id TEXT,started_at_local TEXT);
    CREATE TABLE patrol_request_board(owner_user_id TEXT,request_id TEXT,status TEXT);
    INSERT INTO patrol_assignments VALUES('alice','test','B','request','paused','employee',NULL);
    INSERT INTO patrol_request_board VALUES('alice','request','paused');
    INSERT INTO outbox_commands VALUES('alice','test','switch','rejected','switchPatrolAssignment','{"assignmentId":"B","sourceAssignmentId":"A"}','2026-01-02','patrolAssignment:B',1);
    INSERT INTO outbox_commands VALUES('alice','test','old-command','superseded','savePatrolPointResult','{}','2026-01-01','patrolAssignment:B',1);`);
  const swdb={getFirstAsync:async(sql,args=[])=>sw.prepare(sql).get(...args),runAsync:async(sql,args=[])=>sw.prepare(sql).run(...args)};
  const {continuePatrolAfterSwitchConflict}=load(extract('src/db/repositories/patrolSwitchRepository.ts','continuePatrolAfterSwitchConflict'),['continuePatrolAfterSwitchConflict'],{
    getDatabase:async()=>swdb,currentContourId:'test',withSqliteBusyRetry:fn=>fn(),withProtectedExclusiveTransactionAsync:async(_db,fn)=>{sw.exec('BEGIN');try{await fn(swdb);sw.exec('COMMIT');}catch(e){sw.exec('ROLLBACK');throw e;}}
  });
  let reason;
  try{await continuePatrolAfterSwitchConflict('alice','switch');}catch(e){reason=e.message;}
  assert.equal(reason,'Ожидаем подтверждение уже начатой операции целевого обхода.');
  results.push({case:'Continue B blocked by terminal superseded command',reason});
  sw.close();

  const scope={ownerUserId:'alice',contourId:'test'};
  const reportFeed={current:{active:true,loading:false,dirty:false,generation:1,loadToken:0,limit:25,scope,next:{page:2,cursor:'next'},remoteHasMore:true}};
  let visibleReports=0;let reportFetches=0;
  const {load:loadReports}=load(extract('src/features/patrol/usePatrolReports.ts','load',true),['load'],{
    useCallback:fn=>fn,session:reportFeed,setBusy:noop,setNotice:noop,getReportScope:async()=>scope,
    publishLocal:async(_scope,state)=>{visibleReports=Math.min(75,state.limit);},
    listPatrolReports:async(_scope,limit)=>({rows:Array.from({length:Math.min(75,limit)}),hasMore:limit<75}),
    fetchPatrolReportPage:async()=>{reportFetches++;throw Error('offline');},refreshHead:noop
  });
  await loadReports('more');
  assert.equal(visibleReports,25);
  results.push({case:'Report journal cannot expose cached next page offline',cachedReports:75,visibleReports,networkAttempts:reportFetches});

  console.log(JSON.stringify(results,null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
