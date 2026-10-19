import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const asset=name=>fileURLToPath(new URL('./result-media/'+name,import.meta.url));
export const mediaPointName='Галерея производственного корпуса — привод конвейера и ограждение аварийного выключателя';
export const mediaComment='Проверить крепления, состояние ограждения и маркировку оборудования.\n'.repeat(65)+'КОНЕЦ КОММЕНТАРИЯ: сведения сохранены полностью.';
const id=number=>`80000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
const names=['landscape.jpg','portrait.jpg','playable.webm','spacecraft.jpg','broken.jpg','act.txt'];
export async function installResultMedia(page,{delayFile,failFile}={}) {
 await page.clock.setFixedTime(new Date('2026-10-17T10:00:00+05:00'));
 await page.addInitScript(()=>{localStorage.setItem('patrol360.dataSourceMode',JSON.stringify({version:1,value:'api'}));localStorage.setItem('patrol360.sessionToken','local-media-fixture');});
 const files=await Promise.all(names.map(async(name,index)=>({id:id(100+index),fileName:name,contentType:name.endsWith('.webm')?'video/webm':name.endsWith('.txt')?'text/plain':'image/jpeg',sizeBytes:name==='broken.jpg'?12:name==='act.txt'?20:(await readFile(asset(name))).length,createdAt:'2026-10-17T09:00:00+05:00'})));
 const rows=Array.from({length:30},(_,index)=>({id:id(index+1),assignmentId:id(900),status:index%3?'Подтверждено':'Замечание',pointId:id(1000+index),point:index===0?mediaPointName:`Точка ${index+1} · участок производства`,employeeId:id(901),employee:'Иванов Андрей Сергеевич',routeId:id(902),route:'Контрольный маршрут с вложениями',territory:'Тестовая территория',shift:'День',plannedAt:'2026-10-17T08:00:00+05:00',actualAt:`2026-10-17T09:${String(index).padStart(2,'0')}:00+05:00`,startedAt:'2026-10-17T09:00:00+05:00',finishedAt:'2026-10-17T09:30:00+05:00',deviation:'-',comment:index===0?mediaComment:`Комментарий точки ${index+1}`,photos:index===0?files.length:index<3?1:0,issueType:index%3?'':'Повреждение ограждения',severity:index%3?'-':'Высокая'}));
 const requests=[],aborted=[];let release,failedFile=failFile;const gate=new Promise(resolve=>{release=resolve});
 page.on('requestfailed',request=>{if(request.url().includes('/attachments/'))aborted.push(request.url());});
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),endpoint=url.pathname;
  if(!endpoint.startsWith('/api/'))return route.continue();
  if(endpoint.endsWith('/auth/me'))return route.fulfill({json:{id:'media-operator',login:'ui-media',displayName:'Тестовый оператор',roles:['admin'],permissions:[]}});
  if(endpoint==='/api/v3/results')return route.fulfill({json:{items:[{assignmentId:id(900),resultId:rows[0].id,results:rows}],page:1,pageSize:100,total:1,totalPages:1,hasNext:false}});
  const fileMatch=endpoint.match(/\/results\/([^/]+)\/attachments\/([^/]+)$/);
  if(fileMatch){const file=files.find(file=>file.id===fileMatch[2]);if(!file)return route.fulfill({status:404});requests.push({id:file.id,name:file.fileName,authorization:request.headers().authorization});if(file.fileName===delayFile)await gate;
   try{if(file.fileName===failedFile)return await route.fulfill({status:503,json:{title:'Файл временно недоступен'}});return await route.fulfill({contentType:file.contentType,headers:{'content-disposition':`attachment; filename="${file.fileName}"`},body:file.fileName==='broken.jpg'?Buffer.from('not a jpeg'):file.fileName==='act.txt'?Buffer.from('Attachment fixture'):await readFile(asset(file.fileName))});}catch(error){if(!aborted.includes(request.url()))throw error;return;}}
  if(endpoint.startsWith('/api/v1/results/')){const row=rows.find(row=>row.id===endpoint.split('/').at(-1));if(row)return route.fulfill({json:{...row,issues:[],chronology:[],attachments:row.id===rows[0].id?files:row.photos?[files[row.id===rows[1].id?1:3]]:[]}});}
  return route.fulfill({json:[]});
 });
 return {requests,aborted,release:()=>release(),setFailedFile:name=>{failedFile=name;},rows};
}
export async function openResultMediaReport(page,origin='') {
 await page.goto(origin+'/#results');await page.getByRole('heading',{name:'Результаты обходов',exact:true}).waitFor();await page.getByRole('button',{name:'Открыть',exact:true}).first().click();return page.getByRole('dialog',{name:'Обход «Контрольный маршрут с вложениями»',exact:true});
}
