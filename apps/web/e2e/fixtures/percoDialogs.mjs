import { percoDiagnostics, percoLogs, percoSettings, percoUnmatched } from './perco.ts';
export async function installPercoDialogFixture(page, options={}) {
  await page.clock.setFixedTime(new Date('2026-10-13T10:24:00+05:00'));
  await page.addInitScript(()=>{if(location.hostname==='127.0.0.1')localStorage.setItem('patrol360.dataSourceMode',JSON.stringify({version:1,value:'mock'}));});
  let release, attempts=0, accepted=false, failRefresh=false;
  const gate=options.delay ? new Promise(resolve=>{release=resolve}) : Promise.resolve();
  const requests=[];
  await page.route('**/api/v1/**',async route=>{
    const request=route.request(), endpoint=new URL(request.url()).pathname, name=endpoint.split('/').at(-1), method=request.method();
    if(method==='POST'&&endpoint.endsWith('/match-employee')) {
      requests.push(request.postDataJSON());await gate;attempts++;
      const failed=options.failOnce&&attempts===1;
      accepted=!failed;failRefresh=accepted&&options.failRefreshAfterWrite;
      return route.fulfill({json:{success:!failed,status:failed?'validation_error':'success',message:failed?'Сопоставление изменилось. Проверьте сотрудника и повторите.':'Сотрудник исключён из очереди сопоставления',loaded:0,created:0,updated:failed?0:1,inserted:0,duplicates:0,unmatched:0,errors:failed?1:0,lastSyncAt:null}});
    }
    if(name==='unmatched-employees'&&failRefresh){failRefresh=false;return route.fulfill({status:503,json:{title:'Обновление очереди временно недоступно'}});}
    const data={settings:percoSettings,diagnostics:percoDiagnostics,logs:percoLogs,'unmatched-employees':accepted?percoUnmatched.filter(value=>value.percoEmployeeId!==requests.at(-1)?.percoEmployeeId):percoUnmatched};
    if(method==='GET'&&name in data)return route.fulfill({json:data[name]});
    return route.fulfill({status:501,json:{title:'Unexpected local fixture request',endpoint}});
  });
  return {requests,release:()=>release?.()};
}
export async function openPercoMatching(page, origin='') {
  await page.goto(origin+'/#perco-integration');await page.getByRole('heading',{name:'Кто сейчас на территории',exact:true}).waitFor();
  await page.getByRole('tab',{name:'Сопоставление',exact:true}).click();
}
