export const legacyDraftKey = 'patrol360.assignment-drafts.v1';
export const draftOwnerId = 'draft-owner-a';
export const ownedDraftKey = `${legacyDraftKey}:api:${draftOwnerId}`;
export const reviewEmployee = { id: '00000000-0000-0000-0000-000000000201', fullName: 'Тестовый сотрудник для проверки восстановления', position: 'Слесарь', department: 'Контрольный участок', status: 'На связи', shift: 'День', personnelNo: 'UI-201', zone: 'Контрольный участок' };
export const reviewRoute = { id: '00000000-0000-0000-0000-000000000202', versionNo: 1, name: 'Контрольный маршрут с длинным названием производственного участка', territory: 'Тестовый участок', status: 'Активен', description: '', duration: '00:30', distance: '1 км', points: [] };
export const legacyDraft = { id: 'legacy-original', title: 'Исходный черновик обхода', employeeId: reviewEmployee.id, employeeName: 'Сотрудник из прежней записи', routeId: reviewRoute.id, routeName: 'Маршрут из прежней записи', plannedDate: '2026-10-20', plannedStart: '08:30', priority: 'high', comment: Array.from({length:24},(_,i)=>`Строка ${i+1}. Полный комментарий исходного черновика.`).join('\n')+'\nКОНЕЦ ЧЕРНОВИКА', changedAt: '16.10, 10:20', requestId: 'old-request-not-to-link', unknownLegacyValue: 'preserve-in-backup' };
export const reviewAccount = { id: '00000000-0000-0000-0000-000000000203', login: 'ui-review-account', passwordState: 'Установлен', employee: 'Не привязан', employeeScope: 'selected', boundEmployeeIds: [], boundEmployees: [], role: 'Маршрутный обходчик', status: 'Активен', session: 'Офлайн', lastSeen: '', device: '', version: '' };

export async function installDraftReview(page, options = {}) {
  const raw = JSON.stringify([legacyDraft, {...legacyDraft,id:'legacy-second',title:'Вторая исходная запись'}, {id:'unreadable',comment:'ОСТАВИТЬ В ИСХОДНОМ ФАЙЛЕ'}]);
  const owned = Array.from({length:options.ownedCount??31},(_,index)=>({...legacyDraft,id:'owned-'+index,title:'Мой черновик '+String(index+1).padStart(2,'0'),employeeName:reviewEmployee.fullName,routeName:reviewRoute.name}));
  await page.addInitScript(({raw,owned,key,ownedKey})=>{
    if(!sessionStorage.getItem('draft-review-initialized')) {
      localStorage.setItem('patrol360.dataSourceMode',JSON.stringify({version:1,value:'api'}));localStorage.setItem('patrol360.sessionToken','draft-review-test');
      localStorage.setItem(key,raw);localStorage.setItem(ownedKey,JSON.stringify(owned));sessionStorage.setItem('draft-review-initialized','true');
    }
    window.__legacyReads=0;const get=Storage.prototype.getItem;Storage.prototype.getItem=function(name){if(name===key)window.__legacyReads++;return get.call(this,name);};
  },{raw,owned,key:legacyDraftKey,ownedKey:ownedDraftKey});
  const requests=[], account={...reviewAccount};let release,attempts=0;
  const gate=options.delay?new Promise(resolve=>{release=resolve}):Promise.resolve();
  const user={id:draftOwnerId,login:'review-a',displayName:'Оператор теста интерфейса',roles:options.admin===false?['operator']:['admin'],permissions:['assignments.read',...(options.readonly?[]:['assignments.write']),'requests.read','employees.read','routes.read','mobile_accounts.write']};
  await page.route('**/api/v1/**',async route=>{
    const request=route.request(),url=new URL(request.url()),endpoint=url.pathname,method=request.method();const json=value=>route.fulfill({json:value});
    if(endpoint==='/api/v1/auth/me')return json(request.headers().authorization==='Bearer draft-review-b'?{...user,id:'draft-owner-b',displayName:'Другой оператор'}:user);
    if(endpoint==='/api/v1/auth/logout')return route.fulfill({status:204});
    if(endpoint==='/api/v1/auth/login')return json({user:{...user,id:'draft-owner-b',displayName:'Другой оператор'},accessToken:'draft-review-b',expiresAt:'2027-01-01T00:00:00Z'});
    if(method!=='GET'){requests.push({endpoint,method,body:request.postDataJSON()});if(method==='PUT'&&endpoint.endsWith('/'+account.id)){await gate;attempts++;if(options.failOnce&&attempts===1)return route.fulfill({status:409,json:{title:'Проверьте изменения. Введённые данные сохранены.'}});Object.assign(account,request.postDataJSON());return json(account);}return route.fulfill({status:400,json:{title:'Неожиданная запись в UI-фикстуре'}});}
    if(endpoint==='/api/v1/employees')return json([reviewEmployee]);
    if(endpoint==='/api/v1/routes')return json([reviewRoute]);
    if(endpoint==='/api/v1/assignments/settings')return json({favoriteEmployeeIds:[reviewEmployee.id],shiftSettings:{dayStart:'06:00',dayEnd:'14:00',nightStart:'22:00',nightEnd:'06:00'}});
    if(endpoint==='/api/v1/mobile-accounts')return json([account]);
    if(endpoint.endsWith('/active-patrols'))return json([]);
    if(endpoint.includes('dashboards'))return json({});
    return json([]);
  });
  return {raw,owned,requests,release:()=>release?.()};
}
export async function openDraftReview(page, origin='') {
  await page.goto(origin+'/#assign');await page.getByRole('heading',{name:'Назначения',exact:true}).waitFor();await page.getByRole('tab',{name:/^Черновики/}).click();return page.locator('.assignment-drafts-card');
}
export async function openAccountReview(page, origin='') {
  await page.goto(origin+'/#accounts');await page.getByRole('button',{name:'Действия '+reviewAccount.login,exact:true}).click();await page.getByRole('button',{name:'Редактировать',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Редактирование мобильного аккаунта',exact:true});await editor.getByPlaceholder('Введите логин').fill('ui-review-changed');await editor.getByRole('button',{name:'Сохранить изменения',exact:true}).click();return page.getByRole('dialog',{name:'Подтвердить изменения?',exact:true});
}
