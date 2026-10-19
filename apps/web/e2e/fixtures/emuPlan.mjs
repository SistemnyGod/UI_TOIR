import { workAccountingStore } from './workAccounting.ts';
import { installEmuDialogFixture, installEmuApiDialogFixture } from './emuDialogs.mjs';
import { planTasks } from "./emuPlanData.ts";
export { planTasks, planTitle } from "./emuPlanData.ts";
export async function installEmuPlan(page){
 await installEmuDialogFixture(page);
 await page.addInitScript(store=>localStorage.setItem('patrol360.emu.workspace.v1',JSON.stringify(store)),{...workAccountingStore,planTasks});
}
export async function installEmuPlanApi(page,{delay=false,failOnce=false}={}) {
 await installEmuApiDialogFixture(page);let rows=structuredClone(planTasks),release;const requests=[],attempts=new Map();
 const gate=delay?new Promise(resolve=>{release=resolve}):Promise.resolve();
 await page.route('**/api/v1/emu/**',async route=>{
  const request=route.request(),endpoint=new URL(request.url()).pathname,method=request.method();
  if(method==='GET'&&endpoint.endsWith('/plan-tasks'))return route.fulfill({json:{rows,total:rows.length,page:1,pageSize:rows.length,pageCount:1}});
  if(method==='GET'&&endpoint.endsWith('/plan-tasks/changes'))return route.fulfill({json:{serverTime:'2026-10-13T09:30:00Z',changedTasks:rows,deletedTaskIds:[]}});
  if(method!=='GET'&&endpoint.includes('/plan-tasks')) {
   const body=request.postDataJSON();requests.push({endpoint,method,body});await gate;
   const count=(attempts.get(endpoint)??0)+1;attempts.set(endpoint,count);
   if(failOnce&&count===1)return route.fulfill({status:503,json:{title:'Не удалось сохранить. Ваш ввод не потерян.'}});
   const id=endpoint.split('/plan-tasks/')[1]?.split('/')[0],index=rows.findIndex(task=>task.id===id);
   if(endpoint.endsWith('/approve-week')){const changed=rows.filter(task=>task.plannedDate>='2026-10-12'&&task.plannedDate<'2026-10-19'&&task.approvalStatus!=='Согласовано');changed.forEach(task=>{task.approvalStatus='Согласовано';task.rowVersion++});return route.fulfill({json:changed});}
   if(index<0)return route.fulfill({status:404,json:{title:'Задача не найдена'}});
   const task=rows[index];if(body.rowVersion!==task.rowVersion)return route.fulfill({status:409,json:{title:'Версия задачи изменилась. Ваш ввод сохранён.'}});
   if(endpoint.endsWith('/reschedule'))task.plannedDate=body.newPlannedDate;
   else if(endpoint.endsWith('/approve'))task.approvalStatus=body.approved?'Согласовано':'Отклонено';
   else Object.assign(task,body);
   task.rowVersion++;return route.fulfill({json:task});
  }
  return route.fallback();
 });
 return {requests,release:()=>release?.(),revise:()=>{rows[0]={...rows[0],rowVersion:19,title:'Новая серверная редакция'};}};
}
