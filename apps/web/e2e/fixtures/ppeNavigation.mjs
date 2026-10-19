import { installPpeKitFixture, ppeKitIds } from './ppeKit.mjs';
export async function installPpeNavigationFixture(page, options={}) {
  const fixture = await installPpeKitFixture(page,{positions:options.positions??30}); const saves=[]; let release;
  const gate=options.delaySave ? new Promise(resolve=>{release=resolve}) : Promise.resolve();
  await page.route('**/api/v1/inventory/ppe/issue-documents/journal?**',route=>route.fulfill({json:{items:[],page:1,pageSize:25,pageCount:1,total:0,departments:[],summary:{total:0,confirmed:0,draft:0,cancelled:0,overdue:0}}}));
  await page.route('**/api/v1/inventory/ppe/issue-documents/'+ppeKitIds.document,async route=>{if(route.request().method()==='PUT'){saves.push(route.request().postDataJSON());await gate;}return route.fallback();});
  await page.route('**/api/v1/inventory/settings', route => route.fulfill({contentType:'application/json',body:JSON.stringify({categories:[],units:[],warehouses:[],custodyCategories:[],returnReasons:[],writeOffReasons:[],employeePositions:[],employeeDepartments:[],employeeGroups:[],positionNorms:[],itemSets:[]})}));
  await page.route('**/api/v1/inventory/items?*', route => route.fulfill({contentType:'application/json',body:JSON.stringify({rows:[],total:0,page:1,pageSize:20,pageCount:1})}));
  await page.route('**/api/v1/inventory/items/facets', route => route.fulfill({contentType:'application/json',body:JSON.stringify({total:0,active:0,inactive:0,categories:[],units:[],trackingTypes:[],itemKinds:[]})}));
  return {...fixture,saves,releaseSave:()=>release?.()};
}
export async function openNavigationKit(page, origin='') {
  await page.goto(origin+'/#inventory-ppe');await page.getByRole('heading',{name:'Выдача СИЗ',exact:true}).waitFor();await page.getByRole('button',{name:'Оформить выдачу',exact:true}).click();await page.getByRole('heading',{name:'Проверка данных',exact:true}).waitFor();await page.getByRole('button',{name:'Далее',exact:true}).click();await page.getByRole('button',{name:'Добавить СИЗ',exact:true}).waitFor();
}
export async function makeUnsavedPpeInput(page) {const price=page.getByLabel('Цена, руб.',{exact:true}).first();await price.fill('12,,50');return price;}
