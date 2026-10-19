import {installDraftReview,openDraftReview,openAccountReview,reviewEmployee,reviewRoute} from './fixtures/draftReview.mjs';
import {installPpePdfFixture,openPpeReview} from './fixtures/ppePdf.mjs';
import {installEmuDialogFixture,installEmuApiDialogFixture,openEmuDialogBoard,openEmuWorkCommand,openEmuEmployeeInspector} from './fixtures/emuDialogs.mjs';
import {installEmuDirectories} from './fixtures/emuDirectories.mjs';
import {installEmuPlan,planTitle} from './fixtures/emuPlan.mjs';
import {installResultMedia,openResultMediaReport,mediaPointName} from './fixtures/resultMedia.mjs';
import {installInventoryCatalog,openInventoryCatalog} from './fixtures/inventoryCatalog.mjs';
import {installPercoDialogFixture,openPercoMatching} from './fixtures/percoDialogs.mjs';
import {installPpeNavigationFixture,openNavigationKit,makeUnsavedPpeInput} from './fixtures/ppeNavigation.mjs';
import {installPpeLegacyFixture,openPpeLegacyPrint} from './fixtures/ppeLegacyWorkspace.mjs';
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installPpeKitFixture, openPpeKit, ppeKitItemName, ppeKitAlternateNormId } from './fixtures/ppeKit.mjs';
import { installPpeOperationsFixture, openPpeOperations, openPpeOperation } from './fixtures/ppeOperations.mjs';
import { installPpeNormAdminFixture, openPpeNormAdmin } from './fixtures/ppeNormAdmin.mjs';
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'patrol-ui-zoom-'));
const extension = path.join(temp, 'extension');
await fs.mkdir(extension);
await fs.writeFile(path.join(extension, 'manifest.json'), JSON.stringify({manifest_version:3,name:'Local UI zoom verification',version:'1.0',permissions:['tabs'],background:{service_worker:'worker.js'}}));
await fs.writeFile(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
const output = path.resolve('../../output/playwright/ui-unification-2026-10-16');
await fs.mkdir(output,{recursive:true});
let context;
try {
 context = await chromium.launchPersistentContext(path.join(temp,'profile'), { channel:'chromium', headless:true, viewport:null, args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--window-size=1366,900'] });
 const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker',{timeout:10000});
 await context.addInitScript(()=>{if(location.hostname==='127.0.0.1')localStorage.setItem('patrol360.dataSourceMode',JSON.stringify({version:1,value:'mock'}));});
 const page = await context.newPage();
 await page.emulateMedia({reducedMotion:'reduce'});
 const cdp = await context.newCDPSession(page);
 // Browser zoom changes CSS viewport units. Capture the physical viewport without
 // Playwright's CSS clip so the evidence includes the entire window at DPR 2.
 const capture = async (name, session = cdp) => { const shot=await session.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false}); await fs.writeFile(path.join(output,name),Buffer.from(shot.data,'base64')); };
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5194/#results');
 await page.getByRole('heading',{name:'Результаты обходов',exact:true}).waitFor();
 const before=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio}));
 const zoom=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(tab=>tab.url?.startsWith('http://127.0.0.1:5194/'));await chrome.tabs.setZoom(tab.id,2);return chrome.tabs.getZoom(tab.id);});
 await page.waitForFunction(initial=>innerWidth < initial.width * .6 && devicePixelRatio >= initial.dpr*1.9,before);
 await capture('results-real-zoom-200.png');
 await page.getByRole('button',{name:'Профиль пользователя',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Профиль пользователя',exact:true});await dialog.waitFor();
 await capture('profile-real-zoom-200.png');
 const after=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth}));
 if(after.documentWidth>after.width+1)throw new Error('Page overflow at real zoom 200%');
 await page.keyboard.press('Escape');
 if(!await page.getByRole('button',{name:'Профиль пользователя',exact:true}).evaluate(el=>el===document.activeElement))throw new Error('Focus was not restored');
 const editors=[];
 for(const spec of [
  {hash:'inventory-custody',name:'custody-issue',title:'Новая выдача сотруднику',open:null,button:'Новая выдача',footer:'.modal-shell-actions'},
  {hash:'inventory-custody',name:'custody-item',title:'Добавить предмет под запись',open:null,button:'Добавить предмет',footer:'.modal-shell-actions'},
  {hash:'inventory-ppe-history',name:'ppe-history-event',title:'Детали события',open:'.ppe-v2-actions-cell button',footer:'.modal-shell-actions'},
  {hash:'inventory-employees',name:'inventory-employee',title:'Создание сотрудника',open:null,button:'Создать сотрудника',footer:'.modal-shell-actions'},
  {hash:'inventory-employees',name:'inventory-employee-history',title:'История СИЗ сотрудника',open:'.inventory-employees-row-actions button:nth-child(2)',footer:'.modal-shell-actions'},
  {hash:'accounts',title:'Создание мобильного аккаунта',open:'.aui-page-head button.primary',footer:'.account-create-actions'},
  {hash:'employees',title:'Создать сотрудника',open:null,button:'Создать сотрудника',footer:'.modal-shell-actions'},
  {hash:'schedule',title:'Создание планового обхода',open:null,button:'Создать обход',footer:'.modal-shell-actions'},
  {hash:'assign',name:'assignment-create',title:'Создание заявки на обход',open:null,button:'Создать заявку',footer:'.modal-shell-actions'},
  {hash:'assign',name:'assignment-shifts',title:'Настройка смен',open:null,button:'Смены',footer:'.modal-shell-actions'},
  {hash:'assign',name:'assignment-employees',title:'Избранные сотрудники для назначений',open:null,button:'Настроить избранных',footer:'.modal-shell-actions'},
 ]) {
  await page.goto(`http://127.0.0.1:5194/#${spec.hash}`);
  const trigger=spec.open?page.locator(spec.open).first():page.getByRole('button',{name:spec.button,exact:true}).first();
  await trigger.click();
  const editor=page.getByRole('dialog',{name:spec.title,exact:true});await editor.waitFor();
  const footer=editor.locator(spec.footer);await footer.waitFor();
  await page.waitForFunction(({title,selector})=>{const editor=[...document.querySelectorAll('[role=dialog]')].find(el=>el.getAttribute('aria-label')===title||el.querySelector('h2')?.textContent===title);const rect=editor?.querySelector(selector)?.getBoundingClientRect();return rect&&rect.y>=0&&rect.bottom<=innerHeight+1;},{title:spec.title,selector:spec.footer});
  const dimensions=await editor.evaluate(el=>({width:innerWidth,dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth,dialogWidth:el.getBoundingClientRect().width}));
  if(dimensions.dpr<before.dpr*1.9||dimensions.documentWidth>dimensions.width+1)throw new Error(`Invalid zoom layout: ${spec.hash}`);
  editors.push({screen:spec.name??spec.hash,...dimensions});
  await capture(`${spec.name??spec.hash}-editor-real-zoom-200.png`);
  await page.keyboard.press('Escape');
  await editor.waitFor({state:'hidden'});
 }
 const kitPage=await context.newPage();
 await kitPage.emulateMedia({reducedMotion:'reduce'});
 kitPage.on('pageerror',error=>errors.push(error.message));
 await installPpeKitFixture(kitPage,{positions:54,includeAlternateNorm:true});
 await openPpeKit(kitPage,'http://127.0.0.1:5194');
 const kitCdp=await context.newCDPSession(kitPage);
 async function inspectKit(title,name,target=kitPage,session=kitCdp) {
  const editor=target.getByRole('dialog',{name:title,exact:true});await editor.waitFor();
  await editor.evaluate(async el=>{await Promise.all(el.parentElement.getAnimations({subtree:true}).filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  const dimensions=await editor.evaluate(el=>{const footer=el.querySelector('.modal-shell-actions').getBoundingClientRect();return {width:innerWidth,dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth,dialogWidth:el.getBoundingClientRect().width,bodyHeight:el.querySelector('.modal-shell-body').getBoundingClientRect().height,footerBottom:footer.bottom,footerTop:footer.top,height:innerHeight,overflow:el.scrollWidth-el.clientWidth,opacity:Number(getComputedStyle(el).opacity),backdropOpacity:Number(getComputedStyle(el.parentElement).opacity)};});
  if(dimensions.dpr<before.dpr*1.9||dimensions.documentWidth>dimensions.width+1||dimensions.overflow>1||dimensions.footerTop<0||dimensions.footerBottom>dimensions.height+1||dimensions.opacity<.99||dimensions.backdropOpacity<.99)throw new Error(`Invalid PPE kit zoom layout: ${name}`);
  if(name.startsWith('emu-')&&dimensions.bodyHeight<140)throw new Error(`EMU form content is obscured at real zoom: ${name}`);
  if(name==='emu-plan-board') {
   const firstTask=await editor.locator('.emu-plan-title').evaluateAll(nodes=>{const visible=nodes.find(node=>node.getClientRects().length>0);const box=visible?.getBoundingClientRect();return box?{top:box.top,bottom:box.bottom}:null;});
   const contentBottom=await editor.locator('.modal-shell-body').evaluate(el=>el.getBoundingClientRect().bottom-parseFloat(getComputedStyle(el).paddingBottom));
   if(!firstTask||firstTask.bottom>Math.min(dimensions.footerTop,contentBottom)+1){await capture('emu-plan-filters-obscured-real-zoom-200.png',session);const filters=await editor.locator('.emu-plan-filters').evaluate(el=>({open:el.open,height:el.getBoundingClientRect().height,viewport:innerWidth}));throw new Error(`Plan filters obscure tasks: ${JSON.stringify({firstTask,contentBottom,footerTop:dimensions.footerTop,filters})}`);}dimensions.firstTask=firstTask;dimensions.contentBottom=contentBottom;
  }
  editors.push({screen:name,...dimensions});await capture(`${name}-editor-real-zoom-200.png`,session);
 }
 await kitPage.getByRole('button',{name:'Добавить СИЗ',exact:true}).click();
 await inspectKit('Выберите СИЗ','ppe-kit-picker');
 await kitPage.getByRole('button',{name:'Из шаблона',exact:true}).click();
 await kitPage.getByRole('dialog',{name:'Готовые комплекты',exact:true}).locator('summary').first().click();
 await inspectKit('Готовые комплекты','ppe-kit-templates');
 await kitPage.keyboard.press('Escape');await kitPage.keyboard.press('Escape');
 await kitPage.getByRole('button',{name:`Контроль: ${ppeKitItemName}`,exact:true}).first().click();
 await inspectKit('Исключение и ручной контроль','ppe-kit-control');
 await kitPage.keyboard.press('Escape');
 await kitPage.getByRole('button',{name:'Действия',exact:true}).click();
 await inspectKit('Действия с выдачей','ppe-document-actions');
 await kitPage.getByRole('button',{name:'Отменить черновик',exact:true}).click();
 await inspectKit('Отменить черновик выдачи?','ppe-document-cancel');
 await kitPage.keyboard.press('Escape');await kitPage.keyboard.press('Escape');
 await kitPage.getByRole('button',{name:'Предпросмотр документов',exact:true}).click();
 await kitPage.getByRole('button',{name:'Развернуть документ',exact:true}).click();
 await inspectKit('Просмотр печатной формы','ppe-document-print');
 await kitPage.keyboard.press('Escape');
 await kitPage.getByRole('button',{name:'Подтвердить выдачу',exact:true}).click();
 await inspectKit('Подтвердить выдачу СИЗ?','ppe-document-confirm');
 await kitPage.keyboard.press('Escape');
 await kitPage.getByRole('button',{name:'Назад',exact:true}).click();
 await kitPage.getByRole('button',{name:'Назад',exact:true}).click();
 await kitPage.getByRole('button',{name:'Уточнить характеристики',exact:true}).click();
 await kitPage.getByRole('combobox',{name:'Нормативный набор',exact:true}).selectOption(ppeKitAlternateNormId);
 await inspectKit('Изменить нормативный набор?','ppe-norm-change');
 await kitPage.keyboard.press('Escape');await kitPage.close();
 const operationPage=await context.newPage();await operationPage.emulateMedia({reducedMotion:'reduce'});operationPage.on('pageerror',error=>errors.push(error.message));
 await installPpeOperationsFixture(operationPage);await openPpeOperations(operationPage,'http://127.0.0.1:5194');const operationCdp=await context.newCDPSession(operationPage);
 for(const [title,name] of [['Оформить возврат','ppe-operation-return'],['Оформить списание','ppe-operation-writeoff'],['Отметить неисправным','ppe-operation-defective']]) {
  await openPpeOperation(operationPage,title);await operationPage.getByRole('textbox',{name:/Причина/}).fill('Комментарий операции для проверки читаемости и сохранения ввода.');
  await inspectKit(title,name,operationPage,operationCdp);await operationPage.keyboard.press('Escape');await operationPage.getByRole('button',{name:'Закрыть без сохранения',exact:true}).click();
 }
 await operationPage.close();
 const normPage=await context.newPage();await normPage.emulateMedia({reducedMotion:'reduce'});normPage.on('pageerror',error=>errors.push(error.message));await installPpeNormAdminFixture(normPage);await openPpeNormAdmin(normPage,'http://127.0.0.1:5194');const normCdp=await context.newCDPSession(normPage);
 for(const spec of [{trigger:'Проверить область применения',title:'Область применения нормы',name:'ppe-norm-scope',field:/^Применимые должности/},{trigger:'Правила строки',title:'Правила строки нормы',name:'ppe-norm-rules',field:/^Пункт нормы/},{trigger:'Утвердить товар',title:'Утверждение товара для нормы',name:'ppe-norm-approval',field:/^Основание проверки/}]) {
  await normPage.getByRole('button',{name:spec.trigger,exact:true}).first().click();await normPage.getByRole('textbox',{name:spec.field}).fill('Длинный проверочный текст для читаемости формы и сохранения ввода при увеличении масштаба.');
  await inspectKit(spec.title,spec.name,normPage,normCdp);await normPage.keyboard.press('Escape');await normPage.getByRole('button',{name:'Закрыть без сохранения',exact:true}).click();
 }
 await normPage.getByRole('button',{name:'Сделать основным',exact:true}).click();await inspectKit('Сделать товар основным?','ppe-norm-primary',normPage,normCdp);await normPage.keyboard.press('Escape');
 await normPage.getByRole('button',{name:'Добавить допустимый товар',exact:true}).first().click();const catalog=normPage.getByRole('dialog',{name:'Подбор товара для нормы',exact:true});await catalog.getByRole('button',{name:'Далее',exact:true}).click();await catalog.getByRole('button',{name:'Далее',exact:true}).click();await inspectKit('Подбор товара для нормы','ppe-norm-catalog',normPage,normCdp);await normPage.keyboard.press('Escape');
 await normPage.locator('.ppe-legacy-templates > summary').click();await normPage.getByRole('button',{name:'Проверить и привязать',exact:true}).first().click();
 const legacy=normPage.getByRole('dialog',{name:'Привязка наследованного шаблона',exact:true});await legacy.getByRole('combobox',{name:/^Нормативный набор/}).selectOption('00000000-0000-0000-0000-000000000301');await legacy.getByRole('combobox',{name:/^Товар:/}).first().selectOption('item-0');await legacy.getByRole('textbox',{name:/^Количество:/}).fill('2,5');
 await inspectKit('Привязка наследованного шаблона','ppe-legacy-template',normPage,normCdp);await legacy.getByRole('combobox',{name:/^Нормативный набор/}).selectOption('norm-2');await inspectKit('Изменить нормативный набор?','ppe-legacy-norm-change',normPage,normCdp);
 await normPage.keyboard.press('Escape');await normPage.keyboard.press('Escape');await normPage.getByRole('button',{name:'Закрыть без сохранения',exact:true}).click();await normPage.close();
 const publicationPage=await context.newPage();await publicationPage.emulateMedia({reducedMotion:'reduce'});publicationPage.on('pageerror',error=>errors.push(error.message));await installPpeNormAdminFixture(publicationPage,{publicationReady:true,failRefreshAfterWrite:true});await openPpeNormAdmin(publicationPage,'http://127.0.0.1:5194');const publicationCdp=await context.newCDPSession(publicationPage);const publicationRow=publicationPage.locator('article.inventory-ppe-norm-set').first();
 await publicationRow.getByRole('checkbox',{name:'Проверил нормативный состав и периодичность',exact:true}).check();await publicationRow.getByRole('button',{name:'Опубликовать',exact:true}).click();await publicationPage.locator('.inventory-ppe-norm-message').filter({hasText:'Набор опубликован'}).waitFor();await publicationPage.locator('.toast').waitFor({state:'hidden'});await publicationRow.getByRole('button',{name:'Обновить набор',exact:true}).scrollIntoViewIfNeeded();await publicationPage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const publicationDimensions=await publicationRow.evaluate(el=>{const action=el.querySelector('.ppe-norm-reload-required button').getBoundingClientRect();return {width:innerWidth,dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth,overflow:el.scrollWidth-el.clientWidth,actionTop:action.top,actionBottom:action.bottom,height:innerHeight};});if(publicationDimensions.dpr<before.dpr*1.9||publicationDimensions.documentWidth>publicationDimensions.width+1||publicationDimensions.overflow>1||publicationDimensions.actionTop<0||publicationDimensions.actionBottom>publicationDimensions.height+1)throw new Error('Publication recovery is not usable at real zoom');await capture('ppe-norm-publication-real-zoom-200.png',publicationCdp);await publicationPage.close();
 const legacyPage=await context.newPage();await legacyPage.emulateMedia({reducedMotion:'reduce'});legacyPage.on('pageerror',error=>errors.push(error.message));await installPpeLegacyFixture(legacyPage);await openPpeLegacyPrint(legacyPage,'http://127.0.0.1:5194');const legacyCdp=await context.newCDPSession(legacyPage);
 await inspectKit('Предпросмотр печати','ppe-legacy-print-card',legacyPage,legacyCdp);await legacyPage.getByRole('button',{name:'Лист подписи',exact:true}).click();await inspectKit('Предпросмотр печати','ppe-legacy-print-sheet',legacyPage,legacyCdp);
 await legacyPage.getByRole('button',{name:'Правки для печати',exact:true}).click();await legacyPage.getByRole('textbox',{name:'Модель, марка, артикул · строка 1',exact:true}).fill('Уточнённая модель для проверки формы при увеличении масштаба.');await inspectKit('Правки для печати','ppe-legacy-print-fields',legacyPage,legacyCdp);await legacyPage.close();
 const pdfPage=await context.newPage();await pdfPage.emulateMedia({reducedMotion:'reduce'});pdfPage.on('pageerror',error=>errors.push(error.message));const pdfFixture=await installPpePdfFixture(pdfPage,{delay:true,failOnce:true});await openPpeReview(pdfPage,'http://127.0.0.1:5194');const pdfCdp=await context.newCDPSession(pdfPage);
 await pdfPage.getByRole('button',{name:'Подготовить выбранную форму',exact:true}).click();await pdfPage.getByText(/Подготавливаем PDF для просмотра/).waitFor();await capture('ppe-pdf-pending-real-zoom-200.png',pdfCdp);pdfFixture.releasePrint();await pdfPage.getByRole('alert').filter({hasText:'Сервис печати'}).waitFor();await capture('ppe-pdf-error-real-zoom-200.png',pdfCdp);
 await pdfPage.getByRole('button',{name:'Подготовить выбранную форму',exact:true}).click();await pdfPage.getByRole('button',{name:'Печать подготовленного PDF',exact:true}).waitFor();await pdfPage.waitForFunction(()=>document.querySelector('.ppe-prepared-pdf button')?.disabled===false);let nativePdf=pdfPage.frames().find(frame=>frame.url().startsWith('chrome-extension:'));if(!nativePdf){await pdfPage.waitForEvent('framenavigated',{predicate:frame=>frame.url().startsWith('chrome-extension:'),timeout:10000});nativePdf=pdfPage.frames().find(frame=>frame.url().startsWith('chrome-extension:'));}if(!nativePdf)throw new Error('Native PDF viewer missing: '+JSON.stringify(pdfPage.frames().map(frame=>frame.url())));await nativePdf.locator('#plugin').waitFor();await nativePdf.getByRole('progressbar').waitFor({state:'hidden'});await pdfPage.locator('.ppe-prepared-pdf-head').scrollIntoViewIfNeeded();await pdfPage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const pdfDimensions=await pdfPage.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth,pdfWidth:document.querySelector('.ppe-prepared-pdf').getBoundingClientRect().width}));if(pdfDimensions.dpr<before.dpr*1.9||pdfDimensions.documentWidth>pdfDimensions.width+1)throw new Error('PDF review overflow at real zoom');
 await capture('ppe-pdf-ready-real-zoom-200.png',pdfCdp);await pdfPage.close();
 const navigationPage=await context.newPage();await navigationPage.emulateMedia({reducedMotion:'reduce'});navigationPage.on('pageerror',error=>errors.push(error.message));await installPpeNavigationFixture(navigationPage);await openNavigationKit(navigationPage,'http://127.0.0.1:5194');const navigationCdp=await context.newCDPSession(navigationPage);const navigationPrice=await makeUnsavedPpeInput(navigationPage);
 await navigationPage.goBack();await inspectKit('Несохранённые изменения','page-navigation-guard',navigationPage,navigationCdp);await navigationPage.keyboard.press('Escape');if(await navigationPrice.inputValue()!=='12,,50')throw new Error('Navigation cancellation lost input at real zoom');await navigationPage.close({runBeforeUnload:false});
 const emuPage=await context.newPage();await emuPage.emulateMedia({reducedMotion:'reduce'});emuPage.on('pageerror',error=>errors.push(error.message));await installEmuDialogFixture(emuPage);await openEmuDialogBoard(emuPage,'http://127.0.0.1:5194');const emuCdp=await context.newCDPSession(emuPage);
 for(const [command,title,name] of [['Завершить работу','Завершить работу','emu-complete'],['Пауза','Поставить на паузу','emu-pause'],['Перенести','Перенести работу','emu-carry'],['Удалить','Удалить работу','emu-delete'],['Изменить','Изменить карточку работы','emu-edit']]) {
  await openEmuWorkCommand(emuPage,command);await emuPage.getByRole('dialog',{name:title,exact:true}).locator('textarea').last().fill('Комментарий оператора для проверки читаемости и сохранения ввода при увеличении масштаба.');await inspectKit(title,name,emuPage,emuCdp);await emuPage.keyboard.press('Escape');await emuPage.getByRole('button',{name:'Закрыть без сохранения',exact:true}).click();
 }
 await emuPage.getByRole('button',{name:'Создать работу',exact:true}).click();await emuPage.getByRole('dialog',{name:'Создать работу',exact:true}).locator('textarea').fill('Новая задача для проверки формы и локального черновика.');await inspectKit('Создать работу','emu-create',emuPage,emuCdp);await emuPage.keyboard.press('Escape');await emuPage.getByRole('button',{name:'Закрыть форму',exact:true}).click();await emuPage.close();
 const shiftPage=await context.newPage();await shiftPage.emulateMedia({reducedMotion:'reduce'});shiftPage.on('pageerror',error=>errors.push(error.message));await installEmuApiDialogFixture(shiftPage);await openEmuDialogBoard(shiftPage,'http://127.0.0.1:5194');const shiftCdp=await context.newCDPSession(shiftPage);await openEmuEmployeeInspector(shiftPage);await shiftPage.getByRole('button',{name:'Корректировать',exact:true}).click();await shiftPage.getByRole('textbox',{name:'Причина корректировки',exact:true}).fill('Проверено оператором по фактическим сведениям смены.');await inspectKit('Скорректировать смену','emu-shift',shiftPage,shiftCdp);await shiftPage.keyboard.press('Escape');await shiftPage.getByRole('button',{name:'Закрыть без сохранения',exact:true}).click();await shiftPage.locator('.emu-decision-list button').first().click();await shiftPage.getByRole('dialog',{name:'Закрыть спорную ситуацию',exact:true}).getByRole('textbox',{name:'Комментарий',exact:true}).fill('Основание решения и результат проверки оператора.');await inspectKit('Закрыть спорную ситуацию','emu-decision',shiftPage,shiftCdp);await shiftPage.close();
 const percoPage=await context.newPage();await percoPage.emulateMedia({reducedMotion:'reduce'});percoPage.on('pageerror',error=>errors.push(error.message));await installPercoDialogFixture(percoPage);await openPercoMatching(percoPage,'http://127.0.0.1:5194');const percoCdp=await context.newCDPSession(percoPage);await percoPage.getByRole('button',{name:'Игнорировать',exact:true}).first().click();await inspectKit('Игнорировать сотрудника PERCO?','perco-ignore',percoPage,percoCdp);await percoPage.close();
 const directoryPage=await context.newPage();await directoryPage.emulateMedia({reducedMotion:'reduce'});directoryPage.on('pageerror',error=>errors.push(error.message));await installEmuDirectories(directoryPage);await openEmuDialogBoard(directoryPage,'http://127.0.0.1:5194');const directoryCdp=await context.newCDPSession(directoryPage);
 await directoryPage.getByRole('button',{name:'Справочники',exact:true}).click();const directory=directoryPage.getByRole('dialog',{name:'Справочники ЭМУ',exact:true});await directory.getByRole('textbox',{name:'Новая запись: Участки',exact:true}).fill('Незавершённый участок оператора');await inspectKit('Справочники ЭМУ','emu-catalog',directoryPage,directoryCdp);
 await directory.getByRole('tab',{name:/Типовые работы/}).click();await directory.getByRole('textbox',{name:'Описание и ожидаемый результат',exact:true}).fill('Подробный результат проверки. '.repeat(20));await inspectKit('Справочники ЭМУ','emu-template',directoryPage,directoryCdp);await directoryPage.keyboard.press('Escape');await directoryPage.getByRole('button',{name:'Закрыть без сохранения',exact:true}).click();
 await directoryPage.getByRole('button',{name:'Избранные',exact:true}).click();await inspectKit('Избранные сотрудники ЭМУ','emu-favorites',directoryPage,directoryCdp);await directoryPage.getByRole('button',{name:'Убрать',exact:true}).first().click();await inspectKit('Убрать сотрудника из избранного?','emu-favorite-confirm',directoryPage,directoryCdp);await directoryPage.close();
 const planPage=await context.newPage();await planPage.emulateMedia({reducedMotion:'reduce'});planPage.on('pageerror',error=>errors.push(error.message));await installEmuPlan(planPage);await openEmuDialogBoard(planPage,'http://127.0.0.1:5194');const planCdp=await context.newCDPSession(planPage);await planPage.getByRole('button',{name:'Доска задач',exact:true}).click();const planBoard=planPage.getByRole('dialog',{name:'Доска задач / план на неделю',exact:true});await inspectKit('Доска задач / план на неделю','emu-plan-board',planPage,planCdp);
 await planBoard.getByRole('button',{name:`Открыть задачу ${planTitle}`,exact:true}).click();await inspectKit('Плановая задача','emu-plan-view',planPage,planCdp);await planPage.keyboard.press('Escape');
 for(const [command,title,field,name] of [['Изменить','Изменить плановую задачу','Описание','emu-plan-edit'],['Отклонить','Отклонить плановую задачу','Комментарий','emu-plan-reject'],['Перенести','Перенести плановую задачу','Причина переноса','emu-plan-reschedule']]) {
  const card=planBoard.locator('.emu-plan-card').filter({hasText:planTitle});if(!await card.locator('details').evaluate(el=>el.open))await card.locator('summary').click();await card.getByRole('button',{name:command,exact:true}).click();await planPage.getByRole('dialog',{name:title,exact:true}).getByRole('textbox',{name:field,exact:true}).fill('Комментарий для проверки чтения и сохранения ввода при увеличении. '.repeat(8));await inspectKit(title,name,planPage,planCdp);await planPage.keyboard.press('Escape');await planPage.getByRole('button',{name:'Закрыть без сохранения',exact:true}).click();
 }
 const planFilters=planBoard.locator('.emu-plan-filters');if(!await planFilters.evaluate(el=>el.open))await planFilters.locator('summary').click();await planBoard.getByRole('button',{name:/Согласовать неделю \(/}).click();await inspectKit('Согласовать неделю','emu-plan-week',planPage,planCdp);await planPage.keyboard.press('Escape');await planBoard.getByRole('button',{name:'Новая задача',exact:true}).click();await planPage.getByRole('textbox',{name:'Название задачи',exact:true}).fill('Новая задача для проверки доступности');await inspectKit('Новая плановая задача','emu-plan-create',planPage,planCdp);await planPage.close({runBeforeUnload:false});
 const mediaPage=await context.newPage();await mediaPage.emulateMedia({reducedMotion:'reduce'});mediaPage.on('pageerror',error=>errors.push(error.message));await installResultMedia(mediaPage);const mediaReport=await openResultMediaReport(mediaPage,'http://127.0.0.1:5194');await mediaReport.getByRole('button',{name:'Увеличить',exact:true}).click();const mediaViewer=mediaPage.getByRole('dialog',{name:mediaPointName,exact:true});const mediaCdp=await context.newCDPSession(mediaPage);await mediaViewer.getByRole('img').waitFor();await mediaPage.waitForFunction(()=>document.querySelector('.results-media-readable img')?.naturalWidth>2500,null,{timeout:10000});await inspectKit(mediaPointName,'result-gallery',mediaPage,mediaCdp);
 const mediaDimensions=await mediaViewer.evaluate(el=>{const body=el.querySelector('.modal-shell-body').getBoundingClientRect(),stage=el.querySelector('.result-photo-viewport').getBoundingClientRect();return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visiblePhotoHeight:Math.min(body.bottom,stage.bottom)-Math.max(body.top,stage.top),bodyHeight:body.height};});if(mediaDimensions.visiblePhotoHeight<150)throw new Error('Photo is obscured at real zoom: '+JSON.stringify(mediaDimensions));await mediaViewer.getByRole('button',{name:'Показать детали точки',exact:true}).click();const mediaComment=mediaViewer.locator('.result-media-comment');if(!(await mediaComment.textContent()).includes('КОНЕЦ КОММЕНТАРИЯ'))throw new Error('Comment was truncated');await mediaComment.evaluate(el=>el.scrollIntoView({block:'end'}));await capture('result-gallery-comment-real-zoom-200.png',mediaCdp);await mediaPage.close();
 const catalogPage=await context.newPage();await catalogPage.emulateMedia({reducedMotion:'reduce'});catalogPage.on('pageerror',error=>errors.push(error.message));await installInventoryCatalog(catalogPage);await openInventoryCatalog(catalogPage,'http://127.0.0.1:5194');const catalogCdp=await context.newCDPSession(catalogPage);
 for(const [trigger,title,name] of [['Создать позицию','Создать позицию номенклатуры','item-create'],['Редактировать','Редактировать позицию номенклатуры','item-edit'],['Открыть карточку','Карточка позиции номенклатуры','item-detail'],['Скрыть позицию','Скрыть позицию номенклатуры','item-hide']]){if(trigger==='Скрыть позицию'){await catalogPage.getByRole('button',{name:'Открыть карточку',exact:true}).first().click();}await catalogPage.getByRole('button',{name:trigger,exact:true}).first().click();await inspectKit(title,name,catalogPage,catalogCdp);await catalogPage.keyboard.press('Escape');if(trigger==='Скрыть позицию')await catalogPage.keyboard.press('Escape');}await catalogPage.close();
 const auxiliaryPage=await context.newPage();await auxiliaryPage.emulateMedia({reducedMotion:'reduce'});auxiliaryPage.on('pageerror',error=>errors.push(error.message));await installEmuDialogFixture(auxiliaryPage);const auxiliaryCdp=await context.newCDPSession(auxiliaryPage);
 async function inspectAuxiliary(surface,name,bodySelector) {
  await surface.waitFor();await auxiliaryPage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const dimensions=await surface.evaluate((el,bodySelector)=>{const box=el.getBoundingClientRect(),footer=el.querySelector('footer').getBoundingClientRect();return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth,dialogWidth:box.width,top:box.top,bottom:box.bottom,footerTop:footer.top,footerBottom:footer.bottom,bodyHeight:el.querySelector(bodySelector).getBoundingClientRect().height,overflow:el.scrollWidth-el.clientWidth};},bodySelector);
  if(dimensions.dpr<before.dpr*1.9||dimensions.documentWidth>dimensions.width+1||dimensions.overflow>1||dimensions.top<7||dimensions.bottom>dimensions.height-7||dimensions.footerBottom>dimensions.height-7||dimensions.bodyHeight<50)throw new Error('Auxiliary UI obscured at real zoom: '+name+' '+JSON.stringify(dimensions));
  editors.push({screen:name,...dimensions});await capture(name+'-real-zoom-200.png',auxiliaryCdp);
 }
 for(const [hash,trigger,title,name] of [['emu-completed-work-history','.emu-history-period-trigger','Выбор периода','emu-history-calendar'],['emu-shift-report-history','.emu-date-range-trigger','Выбор периода отчётов','emu-report-calendar']]) {
  await auxiliaryPage.goto('http://127.0.0.1:5194/#'+hash);await auxiliaryPage.locator(trigger).click();await inspectAuxiliary(auxiliaryPage.getByRole('dialog',{name:title,exact:true}),name,'.date-range-surface-body');await auxiliaryPage.keyboard.press('Escape');
 }
 await auxiliaryPage.goto('http://127.0.0.1:5194/#accounts');await auxiliaryPage.getByRole('button',{name:'Создать аккаунт',exact:true}).first().click();const auxiliaryAccount=auxiliaryPage.getByRole('dialog',{name:'Создание мобильного аккаунта',exact:true});await auxiliaryAccount.getByPlaceholder(/Введите логин/).fill('test-only-zoom-password');await auxiliaryAccount.getByRole('button',{name:'Создать аккаунт',exact:true}).click();await inspectAuxiliary(auxiliaryPage.locator('.secure-password-panel'),'temporary-password','.secure-password-content');await auxiliaryPage.keyboard.press('Escape');await auxiliaryPage.close();
 const draftPage=await context.newPage();await draftPage.emulateMedia({reducedMotion:'reduce'});draftPage.on('pageerror',error=>errors.push(error.message));await installDraftReview(draftPage);await openDraftReview(draftPage,'http://127.0.0.1:5194');const draftCdp=await context.newCDPSession(draftPage);await draftPage.getByRole('button',{name:'Восстановить старые черновики',exact:true}).click();await inspectKit('Старые локальные черновики','assignment-legacy-list',draftPage,draftCdp);await draftPage.getByRole('button',{name:'Подготовить копию',exact:true}).first().click();const recovery=draftPage.getByRole('dialog',{name:'Восстановить черновик',exact:true});await recovery.getByRole('combobox',{name:'Сотрудник',exact:true}).selectOption(reviewEmployee.id);await recovery.getByRole('combobox',{name:'Маршрут',exact:true}).selectOption(reviewRoute.id);await inspectKit('Восстановить черновик','assignment-recovery',draftPage,draftCdp);await draftPage.close({runBeforeUnload:false});
 const confirmationPage=await context.newPage();await confirmationPage.emulateMedia({reducedMotion:'reduce'});confirmationPage.on('pageerror',error=>errors.push(error.message));await installDraftReview(confirmationPage);await openAccountReview(confirmationPage,'http://127.0.0.1:5194');await inspectKit('Подтвердить изменения?','account-confirmation',confirmationPage,await context.newCDPSession(confirmationPage));await confirmationPage.close({runBeforeUnload:false});
 const readonlyDraftPage=await context.newPage();await readonlyDraftPage.emulateMedia({reducedMotion:'reduce'});readonlyDraftPage.on('pageerror',error=>errors.push(error.message));await installDraftReview(readonlyDraftPage,{admin:false,readonly:true});const readonlyCard=await openDraftReview(readonlyDraftPage,'http://127.0.0.1:5194');await readonlyCard.locator('.assignment-draft-open').first().click();await inspectKit('Просмотр черновика','assignment-draft-preview',readonlyDraftPage,await context.newCDPSession(readonlyDraftPage));await readonlyDraftPage.close();
 if(errors.length)throw new Error(errors.join('\n'));
 const result={zoom,before,after,editors,pdf:pdfDimensions,publication:publicationDimensions,media:mediaDimensions,errors,method:'chrome.tabs.setZoom in an isolated Chromium profile',profile:temp};
 await fs.writeFile(path.join(output,'real-zoom-200.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
} finally { await context?.close(); }
