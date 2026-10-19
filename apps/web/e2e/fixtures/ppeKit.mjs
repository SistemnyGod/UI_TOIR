// Local API fixtures shared by responsive checks and real browser zoom checks.
export const ppeKitIds = { user: 'ppe-kit-operator', document: '00000000-0000-0000-0000-000000000601', norm: '00000000-0000-0000-0000-000000000301', employee: '00000000-0000-0000-0000-000000000201' };
export const ppeKitItemName = 'Каска защитная для обслуживания оборудования производственного участка';
export const ppeKitAlternateNormId = '00000000-0000-0000-0000-000000000302';
export async function installPpeKitFixture(page, options = {}) {
  const requests = [];
  let releaseApply;
  const applyGate = options.delayApply ? new Promise(resolve => { releaseApply = resolve; }) : Promise.resolve();
  let releaseCancel, releaseConfirm, cancelAttempts = 0, confirmAttempts = 0;
  const cancelGate = options.delayCancel ? new Promise(resolve => { releaseCancel = resolve; }) : Promise.resolve();
  const confirmGate = options.delayConfirm ? new Promise(resolve => { releaseConfirm = resolve; }) : Promise.resolve();
  let releaseAlternateNorm, alternateAttempts = 0;
  const alternateGate = options.delayAlternateNorm ? new Promise(resolve => { releaseAlternateNorm = resolve; }) : Promise.resolve();
  await page.addInitScript(ids => {
    if (location.hostname !== '127.0.0.1') return;
    localStorage.setItem('patrol360.dataSourceMode', JSON.stringify({ version: 1, value: 'api' }));
    localStorage.setItem('patrol360.sessionToken', 'local-ui-fixture');
    sessionStorage.setItem(`ppe.open-document.${ids.user}`, ids.document);
  }, ppeKitIds);
  const employee = { id: ppeKitIds.employee, fullName: 'Иванов Иван Иванович', personnelNo: 'UI-001', position: 'Электромонтёр', department: 'Производственный участок', status: 'active', employeeGroup: '', hiredAt: null, birthDate: null };
  const details = { gender: '', height: '', clothingSize: '', shoeSize: '', headSize: '', respiratorSize: '', handProtectionSize: '' };
  const rows = Array.from({ length: options.positions ?? 30 }, (_, index) => ({ id: `row-${index}`, parentRowId: null, rowType: 'item', sortOrder: index, normItemName: `Защита ${index + 1}`, normPoint: `п. ${index + 1}`, issuePeriodText: '12 месяцев', quantity: 1, quantityText: '1 шт.', lifeMonths: 12, unitSymbol: 'шт.', periodMonths: null, requirementKey: `requirement-${index}`, alternativeGroup: '', mappings: [{ id: `mapping-${index}`, normRowId: `row-${index}`, itemId: `item-${index}`, itemName: index === 0 ? ppeKitItemName : `СИЗ ${String(index).padStart(2, '0')} — защита при обслуживании оборудования`, itemSku: `UI-${String(index).padStart(2, '0')}`, itemUnitSymbol: 'шт.', brandModelArticle: '', defaultUnitPriceMinor: 125050, isDefault: true, comment: '', isApproved: true, normUnitsPerItem: 1, approvalEvidence: 'Local UI fixture', standards: [{ designation: 'ГОСТ EN 397', name: 'Средства индивидуальной защиты головы. Требования и методы испытаний' }] }] }));
  const norm = { id: ppeKitIds.norm, positionName: employee.position, versionName: '2026 · тест интерфейса', effectiveFrom: '2026-01-01', effectiveTo: null, sourceName: 'Local UI fixture', status: 'active', requiresReview: false, version: 1, rowsCount: rows.length, departmentName: employee.department, positionAliases: [employee.position], scopeConfirmed: true };
  const alternateRows = rows.slice(0, 5), alternateNorm = { ...norm, id: ppeKitAlternateNormId, versionName: '2026 · обновлённый комплект', rowsCount: alternateRows.length };
  const line = { id: 'line-0', normRowId: rows[0].id, itemId: 'item-0', itemName: ppeKitItemName, unitSymbol: 'шт.', normPoint: 'п. 1', issueDate: '2026-10-16', quantity: 1, lifeMonths: 12, unitPriceMinor: 125050, sizeText: '58', exceptionReason: '', manualControlConfirmed: false };
  let document = { id: ppeKitIds.document, version: 1, status: options.documentStatus ?? 'draft', createdAt: '2026-10-16T08:00:00Z', confirmedAt: options.documentStatus === 'confirmed' ? '2026-10-16T09:00:00Z' : null, content: { employee: { ...employee, details }, normSetId: ppeKitIds.norm, normSetVersion: 1, normVersionName: norm.versionName, normSourceName: norm.sourceName, documentDate: '2026-10-16', responsibleName: 'Оператор проверки', basis: 'Проверка интерфейса', normRows: rows, lines: [line] }, validation: { errors: [], warnings: [], entitlements: [], totalMinor: 125050 } };
  if (options.positions) document.content.lines = rows.map((row, index) => ({ ...line, id: `line-${index}`, normRowId: row.id, itemId: row.mappings[0].itemId, itemName: row.mappings[0].itemName, normPoint: row.normPoint }));
  const template = { id: 'template-1', name: 'Защита при обслуживании оборудования · личный комплект', normSetId: ppeKitIds.norm, ownerUserId: ppeKitIds.user, ownerName: 'Оператор проверки', isShared: false, version: 1, updatedAt: '2026-10-16T08:00:00Z', lines: [{ normRowId: rows[0].id, itemId: 'item-0', itemName: ppeKitItemName, unitSymbol: 'шт.', quantity: 1, lifeMonths: 12, unitPriceMinor: 125050 }] };
  let templates = [template];
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.hostname !== '127.0.0.1') throw new Error(`Non-local fixture request: ${url}`);
    const endpoint = url.pathname, body = request.postDataJSON();
    requests.push({ method, endpoint, body });
    const fulfill = value => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    if (endpoint.endsWith('/auth/me')) return fulfill({ id: ppeKitIds.user, login: 'ui-test', displayName: 'Оператор проверки', roles: ['admin'], permissions: ['inventory.view', 'inventory.ppe.manage', 'inventory.ppe.norms.manage', 'inventory.ppe.templates.manage'] });
    if (endpoint.endsWith(`/inventory/employees/${ppeKitIds.employee}`)) return fulfill(employee);
    if (endpoint.endsWith('/inventory/employees')) return fulfill({ rows: [employee], total: 1, page: 1, pageSize: 50, pageCount: 1 });
    if (endpoint.endsWith('/issue-documents/capabilities')) return fulfill({ enabled: true });
    if (endpoint.endsWith('/issue-documents/norms')) return fulfill(options.includeAlternateNorm ? [norm, alternateNorm] : [norm]);
    if (endpoint.endsWith(`/norm-sets/${ppeKitIds.norm}`)) return fulfill({ normSet: norm, rows, itemRowsCount: rows.length, mappedItemRowsCount: rows.length, unmappedItemRowsCount: 0 });
    if (endpoint.endsWith(`/norm-sets/${ppeKitAlternateNormId}`)) {
      await alternateGate;
      if (++alternateAttempts === 1 && options.failAlternateOnce) return route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ title: 'Unavailable', errors: { norm: ['Состав нормы временно недоступен. Выбор сохранён.'] } }) });
      return fulfill({ normSet: alternateNorm, rows: alternateRows, itemRowsCount: alternateRows.length, mappedItemRowsCount: alternateRows.length, unmappedItemRowsCount: 0 });
    }
    if (endpoint.endsWith(`/issue-documents/${ppeKitIds.document}`)) {
      if (method === 'PUT') document = { ...document, version: document.version + 1, content: { ...document.content, ...body, normRows: body.normSetId === ppeKitAlternateNormId ? alternateRows : rows, normVersionName: body.normSetId === ppeKitAlternateNormId ? alternateNorm.versionName : norm.versionName, lines: body.lines.map(value => ({ ...value, itemName: rows.find(row => row.id === value.normRowId)?.mappings[0].itemName ?? ppeKitItemName, unitSymbol: 'шт.' })) } };
      return fulfill(document);
    }
    if (endpoint.endsWith(`/issue-documents/${ppeKitIds.document}/validate`)) return fulfill(document);
    if (endpoint.endsWith(`/issue-documents/${ppeKitIds.document}/cancel`)) {
      await cancelGate;
      if (++cancelAttempts === 1 && options.failCancelOnce) return route.fulfill({ status: 409, contentType: 'application/problem+json', body: JSON.stringify({ title: 'Conflict', errors: { version: ['Версия черновика изменена. Ввод сохранён.'] } }) });
      document = { ...document, status: 'cancelled', version: document.version + 1 }; return fulfill(document);
    }
    if (endpoint.endsWith(`/issue-documents/${ppeKitIds.document}/confirm`)) {
      await confirmGate;
      if (++confirmAttempts === 1 && options.failConfirmOnce) return route.fulfill({ status: 409, contentType: 'application/problem+json', body: JSON.stringify({ title: 'Conflict', errors: { version: ['Подтверждение не выполнено. Повторите проверку документа.'] } }) });
      document = { ...document, status: 'confirmed', version: document.version + 1, confirmedAt: '2026-10-16T09:00:00Z' }; return fulfill(document);
    }
    if (endpoint.endsWith('/kit-templates')) {
      if (method === 'POST') { const created = { ...template, ...body, id: `template-${templates.length + 1}` }; templates = [created, ...templates]; return fulfill(created); }
      return fulfill(templates);
    }
    if (endpoint.endsWith('/kit-templates/template-1/apply')) { await applyGate; return fulfill(templates.find(value => value.id === template.id) ?? template); }
    if (endpoint.endsWith('/kit-templates/template-1/name')) { templates = templates.map(value => value.id === template.id ? { ...value, name: body.name, version: value.version + 1 } : value); return fulfill(templates.find(value => value.id === template.id)); }
    return fulfill([]);
  });
  return { requests, releaseApply: () => releaseApply?.(), releaseCancel: () => releaseCancel?.(), releaseConfirm: () => releaseConfirm?.(), releaseAlternateNorm: () => releaseAlternateNorm?.() };
}
export async function openPpeKit(page, origin = '') {
  await page.goto(`${origin}/#inventory-ppe-create`);
  await page.getByRole('heading', { name: 'Проверка данных', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить СИЗ', exact: true }).waitFor();
}
