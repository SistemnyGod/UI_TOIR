import { catalogItem, catalogItemName, catalogSettings } from './inventoryCatalogData.ts';
export { catalogItemName };
export async function installInventoryCatalog(page,options={}) {
 await page.addInitScript(()=>{localStorage.setItem('patrol360.dataSourceMode',JSON.stringify({version:1,value:'api'}));localStorage.setItem('patrol360.sessionToken','local-catalog-fixture');});
 const items=Array.from({length:65},(_,index)=>catalogItem(index)),writes=[],reads=[];let failedWrite=Boolean(options.failWriteOnce),failReads=false,releaseWrite,releaseRead;
 const writeGate=options.delayWrite?new Promise(resolve=>{releaseWrite=resolve}):Promise.resolve();let readGate=Promise.resolve();
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),endpoint=url.pathname,method=request.method();if(!endpoint.startsWith('/api/'))return route.continue();
  const json=value=>route.fulfill({json:value});
  if(endpoint.endsWith('/auth/me'))return json({id:'catalog-operator',login:'ui-catalog',displayName:'Оператор проверки интерфейса',roles:options.readOnly?['viewer']:['admin'],permissions:['inventory.view']});
  if(endpoint.endsWith('/inventory/settings'))return json(catalogSettings);
  if(endpoint.endsWith('/items/facets'))return json({total:items.length,active:items.filter(i=>i.isActive).length,inactive:items.filter(i=>!i.isActive).length,categories:[{id:'category-ppe',name:catalogSettings.categories[0].name,count:items.length}],units:[],trackingTypes:[],itemKinds:[]});
  if(endpoint.endsWith('/inventory/items')&&method==='GET'){
   reads.push(url.search);await readGate;if(failReads)return route.fulfill({status:503,json:{title:'Каталог временно недоступен'}});
   const query=(url.searchParams.get('query')||'').toLowerCase(),status=url.searchParams.get('status'),filtered=items.filter(i=>(!query||[i.name,i.sku,i.comment].join(' ').toLowerCase().includes(query))&&(!status||(status==='active'?i.isActive:!i.isActive))),pageNumber=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('pageSize')||20);
   return json({rows:filtered.slice((pageNumber-1)*size,pageNumber*size),total:filtered.length,page:pageNumber,pageSize:size,pageCount:Math.max(1,Math.ceil(filtered.length/size))});
  }
  if(endpoint.includes('/inventory/items/')&&method==='GET')return json(items.find(i=>endpoint.endsWith('/'+i.id))??items[0]);
  if(endpoint.includes('/inventory/items')&&['POST','PUT'].includes(method)){
   const body=request.postDataJSON();writes.push({endpoint,method,body});await writeGate;if(failedWrite){failedWrite=false;return route.fulfill({status:409,json:{title:'Позиция изменена другим пользователем. Ваш ввод сохранён.'}});}
   const item=method==='PUT'?items.find(i=>endpoint.endsWith('/'+i.id)):undefined,saved={...(item??catalogItem(items.length)),...body,category:catalogSettings.categories[0].name,unit:'комплект',status:body.isActive?'active':'inactive'};
   if(item)Object.assign(item,saved);else items.push(saved);if(options.failRefreshAfterWrite)failReads=true;return json(saved);
  }
  if(endpoint.endsWith('/ppe/movements'))return json({rows:[],total:0,page:1,pageSize:10,pageCount:1});
  return json([]);
 });
 return {items,writes,reads,releaseWrite:()=>releaseWrite?.(),setReadFailure:value=>{failReads=value},delayReads:()=>{readGate=new Promise(resolve=>{releaseRead=resolve})},releaseReads:()=>{releaseRead?.();readGate=Promise.resolve();}};
}
export async function openInventoryCatalog(page,origin=''){await page.goto(origin+'/#inventory-items');await page.getByRole('heading',{name:'Номенклатура',exact:true}).waitFor();await page.getByRole('table').getByText(catalogItemName,{exact:true}).waitFor();}
