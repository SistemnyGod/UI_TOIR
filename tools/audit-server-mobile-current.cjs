// Audit only: executes current functions with controlled dependencies and real SQLite.
// Assertions confirm observed defects, not release acceptance. No production data is used.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { X509Certificate } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const mobile = path.join(root, 'mobiel proekt');
const ts = require(path.join(mobile, 'node_modules/typescript'));
const results = [];
const noop = () => {};
const tick = () => new Promise(resolve => setImmediate(resolve));
function source(file) { return fs.readFileSync(path.join(mobile, file), 'utf8'); }
function extract(file, name, variable = false) {
  const ast = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(n) {
    if ((variable ? ts.isVariableDeclaration(n) : ts.isFunctionDeclaration(n)) && n.name?.getText(ast) === name) found = n.getText(ast);
    else ts.forEachChild(n, visit);
  }
  visit(ast);
  if (!found) throw Error(name);
  return (variable ? 'const ' : '') + found;
}
function whole(file) { return source(file).replace(/^import[\s\S]*?;\r?\n/gm, ''); }
function load(code, names, env = {}) {
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('exports', ...Object.keys(env), js + '\nreturn {' + names.join(',') + '};')({}, ...Object.values(env));
}
function executor(raw) { return {
  getFirstAsync: async (sql, args = []) => raw.prepare(sql).get(...args),
  getAllAsync: async (sql, args = []) => raw.prepare(sql).all(...args),
  runAsync: async (sql, args = []) => raw.prepare(sql).run(...args)
}; }
async function run() {
  let xml;
  const plugin = load(extract('app.config.js', 'withPilotNetworkSecurityConfig'), ['withPilotNetworkSecurityConfig'], {
    path, __dirname: mobile, configuredDefaultEnvironment: 'local-enterprise', localCleartextHosts: ['192.168.2.194', '31.173.110.118', 'localhost', '127.0.0.1'],
    withDangerousMod: (_config, [, callback]) => callback({ modRequest: { platformProjectRoot: 'AUDIT-ONLY' } }),
    fs: { existsSync: fs.existsSync, promises: { mkdir: async () => {}, copyFile: async () => {}, writeFile: async (file, text) => { if (file.endsWith('network_security_config.xml')) xml = text; } } }
  });
  await plugin.withPilotNetworkSecurityConfig({});
  const domains = [...xml.matchAll(/<domain\s[^>]*>([^<]+)<\/domain>/g)].map(m => m[1]);
  const duplicates = domains.filter((d, i) => domains.indexOf(d) !== i);
  assert.deepEqual(duplicates, ['192.168.2.194']);
  results.push({ case: 'Generated Android network security XML', duplicateDomains: duplicates });

  const ca = new X509Certificate(fs.readFileSync(path.join(root, 'infra/docker/certs/patrol360.rootCA.crt')));
  const cert = new X509Certificate(fs.readFileSync(path.join(root, 'infra/docker/certs/patrol360.local.crt')));
  results.push({ case: 'Repository public certificate', subject: cert.subject, issuer: cert.issuer, validFrom: cert.validFrom, validTo: cert.validTo, ipMatches: cert.checkIP('192.168.2.194'), signatureMatchesCA: cert.verify(ca.publicKey) });

  const scope = { ownerUserId: 'alice', contourId: 'test', generation: 1 };
  const raw = new DatabaseSync(':memory:'); const db = executor(raw);
  raw.exec(`CREATE TABLE outbox_commands(owner_user_id TEXT,contour_id TEXT,client_operation_id TEXT,status TEXT,command_type TEXT,payload_json TEXT,aggregate_key TEXT,attempt_count INTEGER,next_attempt_at TEXT,retry_reason TEXT,last_error TEXT,updated_at_local TEXT);
    INSERT INTO outbox_commands VALUES('alice','test','switch','rejected','switchPatrolAssignment','{"assignmentId":"B"}','patrolAssignment:B',1,NULL,NULL,NULL,NULL);
    INSERT INTO outbox_commands VALUES('alice','test','old','superseded','markPatrolPointOk','{"assignmentId":"B"}','patrolAssignment:B',1,NULL,NULL,NULL,NULL);
    CREATE TABLE files(owner_user_id TEXT, contour_id TEXT, client_file_id TEXT, server_file_id TEXT, status TEXT, assignment_id TEXT, point_id TEXT);`);
  let syncRequests = 0;
  const continuation = load(whole('src/services/patrolContinuationService.ts'), ['continuePatrolWithReconciliation'], {
    captureDataOwnerContext: async () => scope, assertDataOwnerContext: async () => {}, getDatabase: async () => db,
    getOutboxResult: async () => null, requestSyncAfterMutation: () => { syncRequests++; },
    withProtectedExclusiveTransactionAsync: async (_, fn) => fn(db), applyOutboxResponses: async () => {},
    continuePatrolAfterSwitchConflict: async () => { throw Error('must remain blocked'); }
  });
  await assert.rejects(continuation.continuePatrolWithReconciliation('alice', 'switch'), /неизвестен/);
  const archivedStatus = raw.prepare("SELECT status FROM outbox_commands WHERE client_operation_id='old'").get().status;
  assert.equal(archivedStatus, 'superseded');
  results.push({ case: 'Continue B after archived operation receipt 404', statusAfterReconciliation: archivedStatus, syncRequests, expectedStatus: 'retryLater' });

  const delivered = load(extract('src/services/patrolNavigationService.ts', 'isReportFullyDelivered'), ['isReportFullyDelivered'], {
    getReportDeliveryState: async () => ({status:'delivered',clientOperationId:'complete'}), getDatabase: async () => db, assertDataOwnerContext: async () => {}
  });
  raw.prepare('INSERT INTO outbox_commands(owner_user_id,contour_id,client_operation_id,payload_json) VALUES(?,?,?,?)').run('alice','test','complete','{}');
  const payloadOutcomes = [];
  for (const payload of ['{"pointResults":[{}]}', '{"pointResults":[null]}', '{"pointResults":[{"photoClientFileIds":"broken"}]}', 'null', '{bad']) {
    raw.prepare("UPDATE outbox_commands SET payload_json=? WHERE client_operation_id='complete'").run(payload);
    try { payloadOutcomes.push({ payload, delivered: await delivered.isReportFullyDelivered(scope, 'B') }); }
    catch (e) { payloadOutcomes.push({ payload, throws: e.message }); }
  }
  assert.equal(payloadOutcomes[0].delivered, true); assert.ok(payloadOutcomes[3].throws);
  raw.prepare("UPDATE outbox_commands SET payload_json=? WHERE client_operation_id='complete'").run('{"pointResults":[{"pointId":"point-B","photoClientFileIds":["foreign"]}]}');
  raw.exec("INSERT INTO files VALUES('alice','test','foreign','server-id','linked','OTHER-ASSIGNMENT','OTHER-POINT')");
  const foreignFileAccepted = await delivered.isReportFullyDelivered(scope, 'B'); assert.equal(foreignFileAccepted, true);
  results.push({ case: 'Completion schema and attachment identity', payloadOutcomes, foreignFileAccepted }); raw.close();

  const uploadCalls = []; let owner = 'alice';
  const upload = load(extract('src/api/fileApi.ts', 'uploadMobileFile'), ['uploadMobileFile'], {
    validateMobileFileBeforeUpload: async () => {}, refreshStoredAccessTokenIfNeeded: async () => {}, getAccessToken: async () => 'token-A',
    getMobileRuntimeConfig: async () => ({apiBaseUrl:'https://server.invalid', contourId:'test',syncProtocolVersion:'1.0'}),
    uploadFileWithFailover: async (_url, _protocol, _contour, file, token) => { uploadCalls.push({ fileOwner:file.ownerUserId, token }); owner = 'bob'; return {apiBaseUrl:'https://server.invalid', result:uploadCalls.length === 1 ? {status:401} : {status:200,body:'{}'}}; },
    refreshStoredAccessToken: async () => owner === 'bob' ? 'token-B' : 'token-A', validateFileUploadResponse: value => value
  });
  await upload.uploadMobileFile({ownerUserId:'alice',clientFileId:'photo-A'});
  assert.deepEqual(uploadCalls.map(c=>c.token), ['token-A','token-B']);
  results.push({ case:'File retry after account change', uploadCalls });

  let releaseQr; const routes = [];
  const qr = load(extract('src/features/patrol/ScanQrScreen.tsx', 'handleBarcode'), ['handleBarcode'], {
    status:'reading', isHandlingScanRef:{current:false}, setStatus:noop, setMessage:noop, createQrScanResult:()=>({qrCodeHash:'qr'}),
    assignmentId:'OLD', scanPointByQr:()=>new Promise(r=>{releaseQr=r;}), router:{replace:r=>routes.push(r)}
  });
  const pendingQr = qr.handleBarcode('qr');
  // Simulate returning to the board while SQLite is pending. Handler has no focus/session invalidation hook.
  releaseQr({matched:true,point:{pointId:'p'}}); await pendingQr;
  assert.equal(routes.length,1); results.push({case:'Delayed QR callback after leaving', staleRoutes:routes});

  const {createPointDraftController} = load(whole('src/services/pointDraftController.ts'), ['createPointDraftController']);
  const writes=[]; const controller=createPointDraftController(async v=>{writes.push(v);},noop,100000);
  controller.update('last typed text'); controller.close(); await controller.flushUntilSettled();
  assert.equal(writes.length,0); results.push({case:'Point blur closes controller before autosave', writes});

  let pointSaves=0; let nextAttempts=0; let saveError;
  const finalizing={current:false}; const savedRef={current:false};
  const form=load(extract('src/features/patrol/PointFillScreen.tsx','handleSave'),['handleSave'],{
    finalizingRef:finalizing,latestDraftRef:{current:{selectedStatus:'ok',comment:'saved text',issueTypeId:'issue'}},setError:v=>{saveError=v;},setPhase:noop,
    point:{requiresPhoto:false},isPhotoEvidenceRequired:()=>false,attachments:[],setIsSubmitting:noop,draftController:{current:{pause:async()=>{},close:noop}},
    scopeRef:{current:scope},assertDataOwnerContext:async()=>{},assignmentId:'B',pointId:'P',savePointOk:async()=>{pointSaves++;},savedRef,
    continuePatrolFlow:async()=>{nextAttempts++;throw Error('navigation/readiness unavailable');}
  });
  await form.handleSave(); await form.handleSave();
  assert.equal(pointSaves,1);assert.equal(nextAttempts,1);assert.equal(finalizing.current,true);
  results.push({case:'Point saved but next transition failed; second main-button press',pointSaves,nextAttempts,remainsFinalizing:finalizing.current,message:saveError});

  const appeals = new DatabaseSync(':memory:'); const adb=executor(appeals);
  appeals.exec(`CREATE TABLE mobile_capabilities(owner_user_id TEXT,contour_id TEXT,patrol_appeals INTEGER,patrol_appeals_paging INTEGER,patrol_appeals_assignment_paging INTEGER);
    INSERT INTO mobile_capabilities VALUES('alice','test',1,1,1);
    CREATE TABLE patrol_appeals(id TEXT,owner_user_id TEXT,contour_id TEXT,assignment_id TEXT,kind TEXT,message TEXT,status TEXT,reply TEXT,created_at TEXT,version INTEGER,PRIMARY KEY(id,owner_user_id,contour_id));
    CREATE TABLE outbox_commands(entity_local_id TEXT,owner_user_id TEXT,contour_id TEXT,status TEXT,created_at_local TEXT);
    CREATE TABLE patrol_appeal_cursors(owner_user_id TEXT,contour_id TEXT,scope_key TEXT,next_cursor TEXT,updated_at TEXT,PRIMARY KEY(owner_user_id,contour_id,scope_key));
    CREATE TABLE patrol_appeal_refresh_state(owner_user_id TEXT,contour_id TEXT,scope_key TEXT,initialized INTEGER,refresh_mode TEXT,boundary_json TEXT,confirmed_cursor TEXT,in_progress_cursor TEXT,visible_limit INTEGER,updated_at TEXT,PRIMARY KEY(owner_user_id,contour_id,scope_key));`);
  const appeal=i=>({id:String(i).padStart(3,'0'),assignmentId:'route',kind:'message',message:'m',status:'closed',reply:null,createdAt:new Date(Date.UTC(2026,0,1,0,i)).toISOString(),version:1});
  const insert=item=>appeals.prepare('INSERT OR REPLACE INTO patrol_appeals VALUES(?,?,?,?,?,?,?,?,?,?)').run(item.id,'alice','test',item.assignmentId,item.kind,item.message,item.status,item.reply,item.createdAt,item.version);
  const calls=[]; const all=Array.from({length:65},(_,i)=>appeal(65-i));
  const repo=load(whole('src/db/repositories/patrolAppealRepository.ts'),['loadPatrolAppeals','readPatrolAppealsPage'],{
    getDatabase:async()=>adb,getStoredOwnerUserId:async()=>'alice',currentContourId:'test',captureDataOwnerContext:async()=>scope,assertDataOwnerContext:async()=>{},
    withProtectedExclusiveTransactionAsync:async(_db,fn)=>{appeals.exec('BEGIN');try{const r=await fn(adb);appeals.exec('COMMIT');return r;}catch(e){appeals.exec('ROLLBACK');throw e;}},
    getPatrolAppealsPage:async(size,cursor)=>{calls.push(cursor);const offset=Number(cursor||0);return{items:all.slice(offset,offset+size),nextCursor:offset+size<all.length?String(offset+size):null};}
  });
  for(let i=1;i<=25;i++)insert(appeal(i));
  await repo.loadPatrolAppeals('route');
  const count=appeals.prepare('SELECT COUNT(*) AS n FROM patrol_appeals').get().n;
  assert.equal(count,50); results.push({case:'Appeals: 25 cached + 40 new', cursors:calls,cached:count,total:65,notFetched:15});
  appeals.exec('DELETE FROM patrol_appeals'); for(let i=36;i<=60;i++)insert(appeal(i));
  const first=await repo.readPatrolAppealsPage('route','message'); for(let i=11;i<=35;i++)insert(appeal(i));
  const second=await repo.readPatrolAppealsPage('route','message',first.nextCursor);
  assert.equal(second.items.length,0); results.push({case:'Older appeals added before ascending local cursor',olderAdded:25,shownOnNextPage:second.items.length}); appeals.close();

  let reads=0; let hasMore=true;
  const moreEnv={loadingMore:false,hasMore:true,setLoadingMore:noop,setError:noop,generationRef:{current:1},contextRef:{current:scope},localHasMoreRef:{current:false},localCursorRef:{current:'end'},assignmentId:'route',mode:'message',loadMorePatrolAppeals:async()=>null,assertDataOwnerContext:async()=>{},readPatrolAppealsPage:async()=>{reads++;return{items:[],nextCursor:null};},setHasMore:v=>{hasMore=v;}};
  await load(extract('src/features/patrol/PatrolAppealScreen.tsx','loadMore'),['loadMore'],moreEnv).loadMore();
  assert.equal(reads,0); results.push({case:'Final persisted appeal page is not displayed',cacheReads:reads,hasMore});
  let busy=false; let release; const generation={current:1};
  const pending=load(extract('src/features/patrol/PatrolAppealScreen.tsx','loadMore'),['loadMore'],{...moreEnv,generationRef:generation,setLoadingMore:v=>{busy=v;},loadMorePatrolAppeals:()=>new Promise(r=>{release=r;})}).loadMore();
  generation.current++; release(null); await pending;
  assert.equal(busy,true); results.push({case:'Appeal load invalidated by sync reload or blur',loadingMoreRemains:busy});

  let cacheReads=0;
  await load(extract('src/features/patrol/PatrolAppealScreen.tsx','load',true),['load'],{
    useCallback:fn=>fn,assignmentId:'route',mode:'message',generationRef:{current:1},contextRef:{current:null},captureDataOwnerContext:async()=>scope,
    loadPatrolAppeals:async()=>{throw Error('offline');},readPatrolAppeals:async()=>{cacheReads++;},readPatrolAppealsPage:async()=>{cacheReads++;},setError:noop
  }).load(true);
  assert.equal(cacheReads,0); results.push({case:'Opening appeals offline skips cached records',cacheReads});

  const reportFeed={current:{active:true,loading:false,dirty:false,generation:1,loadToken:0,limit:25,scope,next:{page:2,cursor:'next'},remoteHasMore:true}};
  let visibleReports=0;let reportFetches=0;
  const reports=load(extract('src/features/patrol/usePatrolReports.ts','load',true),['load'],{
    useCallback:fn=>fn,session:reportFeed,setBusy:noop,setNotice:noop,getReportScope:async()=>scope,
    publishLocal:async(_scope,state)=>{visibleReports=Math.min(75,state.limit);},
    listPatrolReports:async(_scope,limit)=>({rows:Array.from({length:Math.min(75,limit)}),hasMore:limit<75}),
    fetchPatrolReportPage:async()=>{reportFetches++;throw Error('offline');},refreshHead:noop
  });
  await reports.load('more'); assert.equal(visibleReports,25);
  results.push({case:'Report journal cannot reveal cached next page offline',cached:75,visible:visibleReports,httpAttempts:reportFetches});

  const wr = new DatabaseSync(':memory:'); const wdb=executor(wr);
  wr.exec(`CREATE TABLE mobile_capabilities(owner_user_id TEXT,contour_id TEXT,work_items_paging INTEGER);
    INSERT INTO mobile_capabilities VALUES('alice','test',1);
    CREATE TABLE work_item_cursors(owner_user_id TEXT,contour_id TEXT,scope_key TEXT,next_cursor TEXT,updated_at TEXT,PRIMARY KEY(owner_user_id,contour_id,scope_key));
    CREATE TABLE work_item_refresh_state(owner_user_id TEXT,contour_id TEXT,scope_key TEXT,boundary_json TEXT,refresh_mode TEXT,in_progress_cursor TEXT,initialized INTEGER,updated_at TEXT,PRIMARY KEY(owner_user_id,contour_id,scope_key));
    INSERT INTO work_item_refresh_state VALUES('alice','test','work:history:all','broken','refresh',NULL,1,'now');`);
  const workCalls=[]; let failSecond=true; const saved=new Map(Array.from({length:75},(_,i)=>['old-'+i,{itemId:'old-'+i,revision:1,status:'completedServer'}]));
  const allWorks=[...Array.from({length:40},(_,i)=>({itemId:'new-'+i,revision:1,status:'completedServer'})),...saved.values()];
  const workEnv={currentContourId:'test',captureDataOwnerContext:async()=>scope,assertDataOwnerContext:async()=>{},getDatabase:async()=>wdb,
    listLocalWorkItemBoundaries:async()=>[...saved.values()],normalizeWorkItems:v=>v,
    getWorkItemsPage:async(_s,_e,cursor,size)=>{workCalls.push(cursor); if(cursor==='25'&&failSecond)throw Error('offline');const start=Number(cursor??0);return{items:allWorks.slice(start,start+size),nextCursor:start+size<allWorks.length?String(start+size):null};},
    saveWorkItems:async(items,_scope,after)=>{wr.exec('BEGIN');try{items.forEach(i=>saved.set(i.itemId,i));await after(wdb);wr.exec('COMMIT');}catch(e){wr.exec('ROLLBACK');throw e;}}
  };
  await assert.rejects(load(whole('src/services/workTaskService.ts'),['refreshWorkItemsHead'],workEnv).refreshWorkItemsHead('history'),/offline/);
  const interrupted=wr.prepare('SELECT boundary_json,refresh_mode,in_progress_cursor FROM work_item_refresh_state').get();
  failSecond=false; workCalls.length=0;
  await load(whole('src/services/workTaskService.ts'),['refreshWorkItemsHead'],workEnv).refreshWorkItemsHead('history');
  assert.equal(workCalls[0],null); assert.equal(saved.size,115);
  results.push({case:'Corrupted work boundary, interruption, process restart',interrupted,resumedCursors:workCalls,totalSaved:saved.size}); wr.close();

  const order=load(whole('src/core/serverCandidatePolicy.ts'),['orderServerCandidateBaseUrls']).orderServerCandidateBaseUrls;
  let stored='https://192.168.2.194:5173';
  const settings=load(whole('src/core/serverSettings.ts'),['getServerBaseUrl','getServerCandidateBaseUrls'],{
    SecureStore:{getItemAsync:async()=>stored,setItemAsync:async(_k,v)=>{stored=v;},deleteItemAsync:async()=>{}},currentContourId:'test',localEnterpriseHttpsBaseUrl:'https://192.168.2.194',
    defaultEnvironment:{name:'local-enterprise',apiBaseUrl:'https://192.168.2.194',allowedBaseUrls:['https://192.168.2.194','http://192.168.2.194:5173','http://31.173.110.118']},orderServerCandidateBaseUrls:order
  });
  const corrected=await settings.getServerBaseUrl(); const secureCandidates=await settings.getServerCandidateBaseUrls(corrected);
  assert.equal(corrected,'https://192.168.2.194'); assert.ok(secureCandidates.every(c=>c.startsWith('https:')));
  stored='http://192.168.2.194:5173'; assert.equal(await settings.getServerBaseUrl(),stored);
  results.push({case:'HTTPS policy positive checks',corrected,secureCandidates,preservedHttp:stored});
  console.log(JSON.stringify(results,null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
