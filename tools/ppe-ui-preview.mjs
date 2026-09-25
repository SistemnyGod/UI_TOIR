// Isolated synthetic UI preview. Binds loopback only and never proxies to a real API.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
const root = resolve('apps/web/dist');
const port = Number(process.env.PPE_UI_PORT || 5291);
const employees = ['Иванов Иван Иванович', 'Петров Пётр Петрович', 'Сидоров Алексей Сергеевич', 'Кузнецова Анна Викторовна', 'Смирнов Дмитрий Николаевич'].map((fullName, i) => ({ id: `employee-${i}`, fullName, personnelNo: `100${i + 1}`, department: ['Горный участок', 'Ремонтная служба', 'Обогатительная фабрика'][i % 3], position: 'Электромонтёр', hiredAt: '2018-06-18', birthDate: null, status: 'active', employeeGroup: 'Производство' }));
const norm = { id: 'norm-1', positionName: 'Электромонтёр', versionName: '2026 · тестовый набор', sourceName: 'Синтетические данные для проверки интерфейса', status: 'active', requiresReview: false, version: 1, rowsCount: 4, scopeConfirmed: true };
const standardSets = [
  [{ designation: 'ТЕСТ СИЗ 001-2026', name: 'Демонстрационный стандарт для касок' }, { designation: 'ТЕСТ СИЗ 900-2026', name: 'Общие требования учебного стенда' }],
  [{ designation: 'ТЕСТ СИЗ 002-2026', name: 'Демонстрационный стандарт для рабочей одежды' }],
  [{ designation: 'ТЕСТ СИЗ 003-2026', name: 'Демонстрационный стандарт для защитной обуви' }],
  [{ designation: 'ТЕСТ СИЗ 004-2026', name: 'Демонстрационный стандарт для перчаток' }],
  [{ designation: 'ТЕСТ СИЗ 005-2026', name: 'Демонстрационный стандарт для утеплённой одежды' }],
  [{ designation: 'ТЕСТ СИЗ 006-2026', name: 'Демонстрационный стандарт для влагозащитной одежды' }],
];
const rows = ['Каска защитная', 'Костюм рабочий', 'Ботинки защитные', 'Перчатки защитные', 'Куртка утеплённая', 'Плащ влагозащитный'].map((name, i) => ({ id: `row-${i}`, parentRowId: null, rowType: 'item', sortOrder: i, normItemName: name, normPoint: `Тестовая норма п. ${i + 1}`, quantity: 1, quantityText: '1 шт.', unitSymbol: 'шт.', issuePeriodText: '1 шт. на 12 месяцев', lifeMonths: 12, periodMonths: 12, mappings: [{ id: `mapping-${i}`, normRowId: `row-${i}`, itemId: `item-${i}`, itemName: name, itemSku: `AM-0012${i}`, brandModelArticle: `Тестовая модель ${i + 1}`, defaultUnitPriceMinor: (i + 1) * 120000, isApproved: true, isDefault: true, normUnitsPerItem: 1, comment: '', approvalEvidence: 'Синтетическое соответствие', standards: standardSets[i] }] }));
const catalogItems = rows.map((row, i) => ({ id: `item-${i}`, name: row.mappings[0].itemName, sku: row.mappings[0].itemSku, categoryId: `category-${i % 3}`, category: ['Защита головы', 'Спецодежда', 'Спецобувь'][i % 3], unitId: 'unit-piece', unit: 'шт.', balance: 25 - i, stockPhysical: 30 - i, stockReserved: 5, stockAvailable: 25 - i, stockStatus: 'in_stock', minStockQty: 5, itemKind: 'ppe', normItemName: row.normItemName, actualItemName: row.mappings[0].itemName, brandName: 'ТестМарка', modelName: `Синтетическая модель ${i + 1}`, article: row.mappings[0].itemSku, protectionClass: i === 0 ? 'II' : '', clothingSize: i === 1 || i === 4 ? '56–58' : '', heightSize: i === 1 || i === 4 ? '170–176' : '', shoeSize: i === 2 ? '41' : '', headSize: i === 0 ? '58' : '', gloveSize: i === 3 ? '10' : '', respiratorSize: '', defaultLifeMonths: 12, defaultUnitPriceMinor: row.mappings[0].defaultUnitPriceMinor, trackingType: 'quantity', comment: 'Синтетическая номенклатура для UI-превью', isConsumable: false, trackLife: true, isActive: true, status: 'active', standards: standardSets[i] }));
const details = { gender: 'муж.', height: '170–176', clothingSize: '56–58', shoeSize: '41', headSize: '', respiratorSize: '', handProtectionSize: '' };
const documents = new Map();
function build(payload, prior) {
  const employee = employees.find(row => row.id === payload.employeeId) || employees[0];
  const lines = payload.lines.map(line => { const row = rows.find(row => row.id === line.normRowId); return { ...line, itemName: row.normItemName, unitSymbol: 'шт.', brandModelArticle: row.mappings[0].brandModelArticle, standards: line.standards ?? row.mappings[0].standards, normUnitsPerItem: 1, totalMinor: line.unitPriceMinor === null ? null : Math.round(line.quantity * line.unitPriceMinor) }; });
  return { id: prior?.id || randomUUID(), version: (prior?.version || 0) + 1, status: prior?.status || 'draft', createdAt: '2026-09-14T08:00:00Z', confirmedAt: prior?.confirmedAt || null, content: { employee: { ...employee, details: payload.employeeDetails || details }, normSetId: norm.id, normSetVersion: 1, normVersionName: norm.versionName, normSourceName: norm.sourceName, documentDate: payload.documentDate, responsibleName: payload.responsibleName, basis: payload.basis, normRows: rows.map(row => ({ ...row, normPoint: lines.find(line => line.normRowId === row.id)?.normPoint ?? row.normPoint })), lines }, validation: { errors: [], warnings: [], entitlements: [], totalMinor: lines.reduce((sum, line) => sum + (line.totalMinor || 0), 0) } };
}
for (let i = 0; i < 28; i++) { const doc = build({ employeeId: employees[i % 5].id, documentDate: `2026-09-${String(14 - i % 12).padStart(2, '0')}`, responsibleName: 'Тестовый ответственный', basis: 'Тестовое основание выдачи', employeeDetails: details, lines: rows.slice(0, 4).map((row, j) => ({ id: `line-${i}-${j}`, normRowId: row.id, itemId: row.mappings[0].itemId, issueDate: '2026-09-14', quantity: 1, unitPriceMinor: row.mappings[0].defaultUnitPriceMinor, lifeMonths: 12, sizeText: '', standards: row.mappings[0].standards, manualControlConfirmed: false, exceptionReason: '' })) }); doc.status = i % 7 === 0 ? 'cancelled' : i % 3 ? 'confirmed' : 'draft'; doc.hasOverdue = i % 5 === 1 && doc.status === 'confirmed'; documents.set(doc.id, doc); }
const templates = new Map();
templates.set('template-winter', { id: 'template-winter', name: 'Электромонтёр · зимний комплект', normSetId: norm.id, ownerUserId: 'ppe-preview-user', ownerName: 'Локальное превью', isShared: true, version: 1, updatedAt: '2026-09-14T08:00:00Z', lines: rows.slice(0, 5).map(row => ({ normRowId: row.id, itemId: row.mappings[0].itemId, itemName: row.mappings[0].itemName, unitSymbol: 'шт.', quantity: 1, lifeMonths: 12, unitPriceMinor: row.mappings[0].defaultUnitPriceMinor })) });
templates.set('template-basic', { id: 'template-basic', name: 'Основной комплект смены', normSetId: norm.id, ownerUserId: 'ppe-preview-user', ownerName: 'Локальное превью', isShared: false, version: 1, updatedAt: '2026-09-13T12:00:00Z', lines: rows.slice(0, 4).map(row => ({ normRowId: row.id, itemId: row.mappings[0].itemId, itemName: row.mappings[0].itemName, unitSymbol: 'шт.', quantity: 1, lifeMonths: 12, unitPriceMinor: row.mappings[0].defaultUnitPriceMinor })) });
async function readJson(req) { let data = ''; for await (const chunk of req) data += chunk; return data ? JSON.parse(data) : {}; }
function summaryOf(doc) { return { id: doc.id, version: doc.version, status: doc.status, employeeId: doc.content.employee.id, employeeName: doc.content.employee.fullName, department: doc.content.employee.department, personnelNo: doc.content.employee.personnelNo, documentDate: doc.content.documentDate, linesCount: doc.content.lines.length, totalMinor: doc.validation.totalMinor, hasOverdue: Boolean(doc.hasOverdue) }; }
function journalRows(url) {
  const query = (url.searchParams.get('query') || '').trim().toLocaleLowerCase('ru'); const employeeId = url.searchParams.get('employeeId'); const department = url.searchParams.get('department'); const from = url.searchParams.get('from'); const to = url.searchParams.get('to'); const status = url.searchParams.get('status');
  return [...documents.values()].filter(doc => (!employeeId || doc.content.employee.id === employeeId) && (!query || `${doc.content.employee.fullName} ${doc.content.employee.personnelNo}`.toLocaleLowerCase('ru').includes(query)) && (!department || doc.content.employee.department === department) && (!from || doc.content.documentDate >= from) && (!to || doc.content.documentDate <= to) && (!status || (status === 'overdue' ? doc.hasOverdue : doc.status === status))).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
function saveTemplate(payload, prior) { return { id: prior?.id || randomUUID(), name: payload.name, normSetId: payload.normSetId, ownerUserId: prior?.ownerUserId || 'ppe-preview-user', ownerName: prior?.ownerName || 'Локальное превью', isShared: Boolean(payload.isShared), version: (prior?.version || 0) + 1, updatedAt: new Date().toISOString(), lines: (payload.lines || []).map(line => ({ ...line, itemName: line.itemName || rows.find(row => row.id === line.normRowId)?.normItemName || 'СИЗ', unitSymbol: line.unitSymbol || 'шт.' })) }; }
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`); const path = url.pathname;
    const json = (body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (path.startsWith('/api/')) {
      if (path.endsWith('/auth/me')) return json({ id: 'ppe-preview-user', login: 'preview', displayName: 'Локальное превью · тестовые данные', roles: ['admin'], permissions: ['inventory.view', 'inventory.ppe.manage', 'inventory.reports.export', 'inventory.ppe.norms.manage'] });
      if (path.endsWith('/employees')) return json({ rows: employees, total: employees.length, page: 1, pageSize: 200, pageCount: 1 });
      if (path.endsWith('/capabilities')) return json({ enabled: true });
      if (path.endsWith('/issue-documents/journal/export')) {
        const lines = ['\uFEFFСотрудник;Табельный номер;Подразделение;Дата;Статус;Позиций;Стоимость;Просрочка', ...journalRows(url).map(doc => { const row = summaryOf(doc); return [row.employeeName, row.personnelNo, row.department, row.documentDate, row.status, row.linesCount, row.totalMinor ?? '', row.hasOverdue ? 'Да' : 'Нет'].map(value => `"${String(value).replaceAll('"', '""')}"`).join(';'); })];
        res.writeHead(200, { 'Content-Type': 'text/csv;charset=utf-8', 'Content-Disposition': 'attachment; filename="ppe-issues-synthetic.csv"' }); return res.end(lines.join('\r\n'));
      }
      if (path.endsWith('/issue-documents/journal')) {
        const filtered = journalRows(url); const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 10)); const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize)); const page = Math.min(pageCount, Math.max(1, Number(url.searchParams.get('page')) || 1));
        const summary = { total: filtered.length, confirmed: filtered.filter(doc => doc.status === 'confirmed').length, draft: filtered.filter(doc => doc.status === 'draft').length, cancelled: filtered.filter(doc => doc.status === 'cancelled').length, overdue: filtered.filter(doc => doc.status === 'confirmed' && doc.hasOverdue).length };
        return json({ items: filtered.slice((page - 1) * pageSize, page * pageSize).map(summaryOf), total: filtered.length, page, pageSize, pageCount, summary, departments: [...new Set([...documents.values()].map(doc => doc.content.employee.department))].sort((a, b) => a.localeCompare(b, 'ru')) });
      }
      if (path.includes('/kit-templates')) {
        const suffix = path.split('/kit-templates')[1]; const parts = suffix.split('/').filter(Boolean); const id = parts[0]; const action = parts[1];
        if (!id && req.method === 'GET') return json([...templates.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        const payload = req.method === 'GET' ? {} : await readJson(req); const current = id ? templates.get(id) : null;
        if (!id && req.method === 'POST') { const saved = saveTemplate(payload); templates.set(saved.id, saved); return json(saved); }
        if (!current) return json({ title: 'Шаблон не найден', errors: { id: ['Синтетический шаблон не найден.'] } }, 404);
        if (action === 'apply' && req.method === 'POST') return payload.normSetId === current.normSetId ? json(current) : json({ title: 'Шаблон не подходит', errors: { normSetId: ['Шаблон создан для другого тестового набора норм.'] } }, 400);
        if (action === 'copy' && req.method === 'POST') { const saved = { ...current, id: randomUUID(), name: payload.name?.trim() || `${current.name} · копия`, isShared: Boolean(payload.isShared), version: 1, updatedAt: new Date().toISOString() }; templates.set(saved.id, saved); return json(saved); }
        if (Number(payload.expectedVersion) !== current.version) return json({ title: 'Конфликт версии', errors: { conflict: ['Шаблон уже изменён. Обновите список.'] } }, 409);
        if (action === 'archive' && req.method === 'PATCH') { templates.delete(id); return json({ ...current, version: current.version + 1, updatedAt: new Date().toISOString() }); }
        if (action === 'name' && req.method === 'PATCH') { const saved = { ...current, name: payload.name, version: current.version + 1, updatedAt: new Date().toISOString() }; templates.set(id, saved); return json(saved); }
        if (!action && req.method === 'PUT') { const saved = saveTemplate(payload, current); templates.set(id, saved); return json(saved); }
      }
      if (path.endsWith('/inventory/items') || path.endsWith('/inventory/ppe/items')) { const query = (url.searchParams.get('query') || '').toLocaleLowerCase('ru'); const found = catalogItems.filter(item => !query || `${item.name} ${item.sku} ${item.article} ${item.standards.map(row => `${row.designation} ${row.name}`).join(' ')}`.toLocaleLowerCase('ru').includes(query)); return json({ rows: found, total: found.length, page: 1, pageSize: Math.max(found.length, 1), pageCount: 1 }); }
      if (path.endsWith('/issue-documents/norms')) return json([norm]);
      if (path.includes('/norm-sets/')) return json({ normSet: norm, rows, itemRowsCount: rows.length, mappedItemRowsCount: rows.length, unmappedItemRowsCount: 0 });
      if (path.includes('/issue-documents')) {
        let payload = {}; if (req.method !== 'GET') payload = await readJson(req);
        const id = path.split('/issue-documents/')[1]?.split('/')[0];
        if (!id && req.method === 'GET') return json([...documents.values()].filter(doc => !url.searchParams.get('employeeId') || doc.content.employee.id === url.searchParams.get('employeeId')).map(summaryOf));
        if (path.endsWith('/print')) return json({ title: 'PDF-конвертер не подключён к синтетическому UI-стенду. Word/PDF проверяются серверными тестами.' }, 503);
        if (!id || req.method === 'PUT') { const doc = build(payload, documents.get(id)); documents.set(doc.id, doc); return json(doc); }
        const doc = documents.get(id); if (!doc) return json({ title: 'Документ не найден' }, 404);
        if (path.endsWith('/confirm')) { doc.status = 'confirmed'; doc.version++; doc.confirmedAt = new Date().toISOString(); }
        if (path.endsWith('/cancel')) { doc.status = 'cancelled'; doc.version++; }
        return json(doc);
      }
      return json([]);
    }
    const file = resolve(root, path === '/' ? 'index.html' : `.${path}`);
    if (!file.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
    let data = await readFile(file);
    if (path === '/' || path === '/index.html') data = data.toString().replace('<head>', `<head><script>localStorage.setItem('patrol360.dataSourceMode',JSON.stringify({version:1,value:'api'}));localStorage.setItem('patrol360.sessionToken','synthetic-local-preview');</script>`);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(500); res.end('Local preview error'); }
}).listen(port, '127.0.0.1', () => console.log(`Synthetic PPE UI preview http://127.0.0.1:${port}/#inventory-ppe`));
