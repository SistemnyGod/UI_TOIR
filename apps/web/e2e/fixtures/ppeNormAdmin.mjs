import { installPpeKitFixture, ppeKitIds } from './ppeKit.mjs';
export async function installPpeNormAdminFixture(page, options = {}) {
  await installPpeKitFixture(page);
  const norm = { id: ppeKitIds.norm, positionName: 'Электромонтёр по обслуживанию производственного оборудования', versionName: '2026 · проверка интерфейса', effectiveFrom: '2026-01-01', effectiveTo: null, sourceName: 'Тестовые данные интерфейса', status: 'draft', version: 7, rowsCount: 12, departmentName: 'Энерго-механический участок', positionAliases: ['Электромонтёр'], scopeConfirmed: false, requiresReview: true, readiness: { isReady: false, requiredCount: 12, approvedCount: 0, blockers: [{ code: 'review', rowId: null, message: 'Тестовый набор: требуется ручная проверка применимости и соответствий.' }] } };
  const rows = Array.from({ length: 12 }, (_, index) => ({ id: '00000000-0000-0000-0000-' + String(700 + index).padStart(12,'0'), rowType: 'item', parentRowId: null, sortOrder: index, normItemName: index ? 'Средство защиты ' + (index + 1) + ' для обслуживания оборудования участка' : 'Каска защитная для обслуживания оборудования производственного участка', normPoint: 'п. ' + (index + 1), issuePeriodText: '12 месяцев', quantity: 1, quantityText: '1 шт.', unitSymbol: 'шт.', periodMonths: 12, lifeMonths: 12, alternativeGroup: '', previousRequirementRowId: null, mappings: [{ id: 'mapping-' + index, normRowId: '00000000-0000-0000-0000-' + String(700 + index).padStart(12,'0'), itemId: 'item-' + index, itemName: 'СИЗ ' + (index + 1) + ' · проверка защитных свойств по документации', itemSku: 'UI-' + index, itemUnitSymbol: 'шт.', brandModelArticle: 'Модель UI-' + index, isDefault: true, comment: '', defaultUnitPriceMinor: 125050, isApproved: false, approvalEvidence: '', normUnitsPerItem: 1 }] }));
  const templates = Array.from({ length: 3 }, (_, index) => ({ id: 'legacy-' + index, name: 'Наследованный комплект ' + (index + 1), normSetId: null, ownerUserId: null, ownerName: '', isShared: false, version: 2, updatedAt: '2026-10-16T08:00:00Z', lines: [{ normRowId: 'old-row', itemId: 'old-item', itemName: 'Каска из прежнего шаблона', unitSymbol: 'шт.', quantity: 2, lifeMonths: 12, unitPriceMinor: 100000 }] }));
  const allNorms = [norm, ...Array.from({ length: 33 }, (_, index) => ({ ...norm, id: 'norm-' + (index + 2), positionName: 'Тестовая должность ' + (index + 2), rowsCount: 1 }))];
  const catalog = Array.from({ length: 45 }, (_, index) => ({ id: 'catalog-' + index, name: 'Каска защитная ' + String(index + 1).padStart(2,'0') + ' для обслуживания оборудования участка', sku: 'UI-CAT-' + String(index + 1).padStart(2,'0'), category: 'СИЗ головы', itemKind: 'ppe', unit: 'шт.', defaultUnitPriceMinor: 125050, isActive: true, article: '', brandName: '', modelName: '', protectionClass: '' }));
  rows[0].mappings.push({ ...rows[0].mappings[0], id: 'mapping-alternative', itemId: 'item-alternative', itemName: 'Каска дополнительная с утверждённым соответствием', isDefault: false, isApproved: true, brandModelArticle: 'Сохранённая модель', defaultUnitPriceMinor: 77777, comment: 'Комментарий, который требуется сохранить' });
  norm.readiness.approvedCount = 1;
  const requests = []; let failMutation = Boolean(options.failMutationOnce), failRefresh = false, release;
  let losePublicationResponse = Boolean(options.losePublicationResponseOnce);
  if (options.publicationReady) {
    norm.scopeConfirmed = true; norm.requiresReview = false;
    norm.readiness = { isReady: true, requiredCount: rows.length, approvedCount: rows.length, blockers: [] };
    for (const row of rows) for (const mapping of row.mappings) mapping.isApproved = true;
  }
  const gate = options.delayMutation ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  await page.route('**/api/v1/inventory/**', async route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname, method = request.method(), body = request.postDataJSON();
    const json = value => route.fulfill({ json: value });
    if (endpoint.endsWith('/settings')) return json({ categories: [], units: [], warehouses: [], custodyCategories: [], returnReasons: [], writeOffReasons: [], employeePositions: [], employeeDepartments: [], employeeGroups: [], positionNorms: [], itemSets: [] });
    if (endpoint.endsWith('/norm-sets') && method === 'GET') return json({ rows: allNorms, total: 34, page: 1, pageSize: 100, pageCount: 1 });
    if (endpoint.includes('/norm-sets/') && method === 'GET') {
      if (failRefresh) { failRefresh = false; return route.fulfill({ status: 503, json: { title: 'Норма сохранена, но обновление временно недоступно' } }); }
      const chosen = allNorms.find(value => endpoint.endsWith('/' + value.id)) ?? norm;
      const chosenRows = chosen.id === norm.id ? rows : rows.map(row => ({ ...row, id: chosen.id + '-' + row.id, mappings: row.mappings.map(mapping => ({ ...mapping, id: chosen.id + '-' + mapping.id, normRowId: chosen.id + '-' + row.id })) }));
      return json({ normSet: chosen, rows: chosenRows, itemRowsCount: chosenRows.length, mappedItemRowsCount: chosenRows.length, unmappedItemRowsCount: 0 });
    }
    if (endpoint.endsWith('/kit-templates/legacy')) return json(templates);
    if (endpoint.endsWith('/ppe/items')) return json({ rows: catalog, total: catalog.length, page: 1, pageSize: 100, pageCount: 1 });
    if (endpoint.endsWith('/publish') && method === 'POST') {
      requests.push({ endpoint, body }); await gate;
      norm.status = 'active'; norm.requiresReview = false; norm.version++;
      if (losePublicationResponse) { losePublicationResponse = false; return route.abort('failed'); }
      failRefresh = Boolean(options.failRefreshAfterWrite); return json(norm);
    }
    if (method === 'PUT') {
      requests.push({ endpoint, body }); await gate;
      if (failMutation) { failMutation = false; return route.fulfill({ status: 409, json: { title: 'Версия нормы изменена. Ввод сохранён.', errors: { conflict: ['Версия нормы изменена. Ввод сохранён.'] } } }); }
      if (endpoint.endsWith('/bind')) { const source = templates.find(value => endpoint.includes('/' + value.id + '/')); const saved = { ...source, ...body, ownerUserId: ppeKitIds.user, ownerName: 'Оператор проверки', version: source.version + 1 }; templates.splice(templates.indexOf(source), 1); return json(saved); }
      if (endpoint.endsWith('/mappings')) { const selected = catalog.find(value => value.id === body.itemId); let mapping = rows[0].mappings.find(value => value.itemId === body.itemId); if (!mapping) { mapping = { ...rows[0].mappings[0], id: 'mapping-' + body.itemId, itemId: body.itemId, itemName: selected.name, itemSku: selected.sku }; rows[0].mappings.push(mapping); } if (body.isDefault) for (const value of rows[0].mappings) value.isDefault = false; Object.assign(mapping, body, { isApproved: false, approvalEvidence: '' }); failRefresh = Boolean(options.failRefreshAfterWrite); return json(mapping); }
      norm.version++;
      if (endpoint.endsWith('/scope')) Object.assign(norm, body, { scopeConfirmed: true });
      if (endpoint.endsWith('/rules')) { Object.assign(rows[0], body); rows[0].quantityText = body.quantity + ' шт.'; }
      if (endpoint.endsWith('/approval')) { Object.assign(rows[0].mappings[0], { ...body, isApproved: true, approvalEvidence: body.evidence }); norm.readiness.approvedCount = 1; }
      failRefresh = Boolean(options.failRefreshAfterWrite);
      return json(endpoint.endsWith('/approval') ? rows[0].mappings[0] : norm);
    }
    return route.fallback();
  });
  return { requests, norm, rows, releaseMutation: () => release?.() };
}
export async function openPpeNormAdmin(page, origin = '') {
  await page.goto(origin + '/#inventory-settings');
  await page.getByRole('button', { name: 'Нормы СИЗ', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть категории и сопоставление', exact: true }).first().click();
}
