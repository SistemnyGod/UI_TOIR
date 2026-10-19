import { workAccountingNow, workAccountingStore, workAccountingSessions, workAccountingSettings } from './workAccounting.ts';
export const emuDialogShift={id:'shift-1',employeeId:'employee-1',employeeName:'Иванов Андрей Сергеевич',shiftDate:'2026-10-13',shiftType:'day',shiftTypeName:'Дневная',templateId:null,plannedStartAt:'2026-10-13T08:00:00+05:00',plannedEndAt:'2026-10-13T17:00:00+05:00',actualStartAt:'2026-10-13T08:00:00+05:00',actualEndAt:'2026-10-13T17:00:00+05:00',lunchStartAt:'2026-10-13T12:00:00+05:00',lunchEndAt:'2026-10-13T13:00:00+05:00',lunchTaken:true,lunchOverridden:false,source:'manual',reason:'',comment:'',adjustedByName:'',adjustedAt:null,rowVersion:7};
const emuDialogDecision={id:'decision-1',employeeId:'employee-1',employeeName:'Иванов Андрей Сергеевич',decisionType:'employee_conflict',severity:'warning',status:'new',workSessionId:'work-1',workNumber:'ЭМУ-2026-0001',sectionName:'Ремонтный участок',shiftDate:'2026-10-13',detectedAt:workAccountingNow,resolvedAt:null,resolvedByUserId:null,resolvedByName:'',dedupeKey:'ui-fixture',resolution:'',comment:'',rowVersion:7,overlapMinutes:0,lunchStartAt:null,lunchEndAt:null};
export async function installEmuApiDialogFixture(page,options={}) {
  await page.clock.setFixedTime(new Date(workAccountingNow));
  await page.addInitScript(()=>{if(location.hostname!=='127.0.0.1')return;localStorage.setItem('patrol360.dataSourceMode',JSON.stringify({version:1,value:'api'}));localStorage.setItem('patrol360.sessionToken','emu-dialog-fixture');});
  const shift={...emuDialogShift},requests=[],attempts=new Map();let release,failDecisionRefresh=false,resolved=false;
  const gate=options.delay?new Promise(resolve=>{release=resolve}):Promise.resolve();
  await page.route('**/api/v1/**',async route=>{
    const request=route.request(),endpoint=new URL(request.url()).pathname,method=request.method();const json=value=>route.fulfill({json:value});
    if(method==='PATCH'&&endpoint.includes('/employee-shifts/')||method==='POST'&&endpoint.endsWith('/resolve')) {
      const body=request.postDataJSON();requests.push({endpoint,body});await gate;const attempt=(attempts.get(endpoint)??0)+1;attempts.set(endpoint,attempt);
      if(options.failOnce&&attempt===1)return route.fulfill({status:409,json:{title:'Версия изменилась. Ввод сохранён.'}});
      if(endpoint.endsWith('/resolve')){resolved=true;failDecisionRefresh=Boolean(options.failDecisionRefresh);return json({...emuDialogDecision,...body,rowVersion:8,status:'resolved'});}
      Object.assign(shift,body,{rowVersion:8});return json(shift);
    }
    if(endpoint==='/api/v1/auth/me')return json({id:'emu-dialog-operator',login:'ui-test',displayName:'Оператор теста интерфейса',roles:['admin'],permissions:[]});
    if(endpoint==='/api/v1/emu/settings')return json(workAccountingSettings);
    if(endpoint==='/api/v1/emu/dashboard')return json({metrics:[],recentEvents:[],workBySection:[],incidents:[]});
    if(endpoint==='/api/v1/emu/work-sessions')return json({rows:workAccountingSessions,total:5,page:1,pageSize:500,pageCount:1});
    if(endpoint.endsWith('/work-sessions/changes'))return json({serverTime:workAccountingNow,changedSessions:[],deletedSessionIds:[]});
    if(endpoint.endsWith('/plan-tasks/changes'))return json({serverTime:workAccountingNow,changedTasks:[],deletedTaskIds:[]});
    if(endpoint.endsWith('/shift-remarks')||endpoint.endsWith('/plan-tasks'))return json({rows:[],total:0,page:1,pageSize:100,pageCount:1});
    if(endpoint.endsWith('/shift-summary'))return json({shift,workMinutes:240,pauseMinutes:0,freeMinutes:0,beforeShiftWorkMinutes:0,overtimeMinutes:0,questionableOvertimeMinutes:0,intervals:[],decisions:resolved?[]:[emuDialogDecision]});
    if(endpoint.endsWith('/decisions')){if(failDecisionRefresh){failDecisionRefresh=false;return route.fulfill({status:503,json:{title:'Обновление решений временно недоступно'}});}return json(resolved?[]:[emuDialogDecision]);}
    return json([]);
  });return {requests,release:()=>release?.()};
}
export async function installEmuDialogFixture(page) {
  await page.clock.setFixedTime(new Date(workAccountingNow));
  await page.addInitScript(store => {
    if (location.hostname !== '127.0.0.1') return;
    localStorage.setItem('patrol360.dataSourceMode', JSON.stringify({version:1,value:'mock'}));
    localStorage.setItem('patrol360.emu.workspace.v1', JSON.stringify(store));
  }, workAccountingStore);
  await page.route('**/api/v1/**', route => route.abort());
}
export async function openEmuDialogBoard(page, origin='') {
  await page.goto(origin+'/#emu-work-accounting');
  await page.getByRole('heading',{name:'Учет работ ЭМУ',exact:true}).waitFor();
}
export async function openEmuEmployeeInspector(page) {
  await page.getByRole('button',{name:/Иванов Андрей Сергеевич.*Статус:/}).click();
  await page.locator('.emu-side-employee-card > button').filter({hasText:'Иванов Андрей Сергеевич'}).click();
  await page.getByRole('button',{name:'Корректировать',exact:true}).waitFor();
}
export async function openEmuWorkCommand(page, name, number='ЭМУ-2026-0001') {
  const card=page.locator('.emu-work-card').filter({has:page.getByRole('button',{name:'Открыть карточку '+number,exact:true})});
  await card.getByRole('button',{name:'Команды',exact:true}).click();
  await page.getByRole('menuitem',{name,exact:true}).click();
}
