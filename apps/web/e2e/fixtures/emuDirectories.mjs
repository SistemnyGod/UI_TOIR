import { workAccountingStore, workAccountingSettings } from './workAccounting.ts';
import { installEmuDialogFixture, installEmuApiDialogFixture } from './emuDialogs.mjs';
export const longEmuSection='Участок диагностики и технического обслуживания оборудования главного производственного корпуса';
const makeSettings=()=>({...structuredClone(workAccountingSettings),sections:[...structuredClone(workAccountingSettings.sections),...Array.from({length:52},(_,index)=>({id:`ui-section-${index}`,name:`${longEmuSection} № ${index+1}`,isActive:true,sortOrder:index+10,createdAt:'2026-10-13T06:00:00+05:00'}))]});
export async function installEmuDirectories(page,{api=false,delay=false,failOnce=false}={}) {
 const settings=makeSettings(),requests=[];let release;
 if(!api){await installEmuDialogFixture(page);await page.addInitScript(store=>{localStorage.setItem('patrol360.emu.workspace.v1',JSON.stringify(store));},{...workAccountingStore,settings});return {requests,release:()=>{}};}
 await installEmuApiDialogFixture(page);
 const gate=delay?new Promise(resolve=>{release=resolve}):Promise.resolve();const attempts=new Map();
 await page.route('**/api/v1/emu/**',async route=>{
  const request=route.request(),endpoint=new URL(request.url()).pathname,method=request.method();
  if(method==='GET'&&endpoint.endsWith('/settings'))return route.fulfill({json:settings});
  if(method==='POST'&&endpoint.endsWith('/sections')||method==='DELETE'&&endpoint.includes('/favorite-employees/')){
   const body=method==='POST'?request.postDataJSON():undefined;requests.push({method,endpoint,body});await gate;
   const count=(attempts.get(endpoint)??0)+1;attempts.set(endpoint,count);
   if(failOnce&&count===1)return route.fulfill({status:503,json:{title:'Сохранение временно недоступно. Ввод сохранён.'}});
   if(method==='POST'){const item={id:`added-${requests.length}`,...body,isActive:true,sortOrder:100,createdAt:'2026-10-13T06:00:00+05:00'};settings.sections.push(item);return route.fulfill({json:item});}
   const id=endpoint.split('/').at(-1),item=settings.favoriteEmployees.find(employee=>employee.employeeId===id);if(item)item.isActive=false;return route.fulfill({json:item});
  }
  return route.fallback();
 });return {requests,release:()=>release?.()};
}
