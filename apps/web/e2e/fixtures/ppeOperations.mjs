import { installPpeKitFixture, ppeKitIds, ppeKitItemName } from './ppeKit.mjs';
export async function installPpeOperationsFixture(page, options = {}) {
  const kit = await installPpeKitFixture(page);
  await page.addInitScript(id => localStorage.setItem('patrol360.inventory.ppe.employee', id), ppeKitIds.employee);
  const employee = { id: ppeKitIds.employee, fullName: 'Иванов Иван Иванович', personnelNo: 'UI-001', position: 'Электромонтёр', department: 'Производственный участок', status: 'active', employeeGroup: '', hiredAt: null, birthDate: null };
  const line = { id: 'operation-line', itemId: 'item-0', itemName: ppeKitItemName, printItemName: ppeKitItemName, quantity: 2, unit: 'шт.', status: 'issued', warehouseId: null, warehouseName: '', issuedAt: '2026-10-16T08:00:00Z', dueAt: null, modelDescription: '', brandModelArticle: 'UI-001', normPoint: 'п. 1', issueMethod: 'personal', unitPriceMinor: 125050, amountMinor: 250100 };
  const card = { id: 'operation-card', employeeId: employee.id, employeeName: employee.fullName, employeePersonnelNo: employee.personnelNo, employeeDepartment: employee.department, position: employee.position, status: 'active', createdAt: '2026-10-16T08:00:00Z', employeeDetails: { gender: '', height: '', clothingSize: '', shoeSize: '', headSize: '', respiratorSize: '', handProtectionSize: '' }, lines: [line], version: 7 };
  const workspace = { employee, card, activeNormSet: null, normRows: [], recentHistory: [], normsTotal: 0, issued: 1, notIssued: 0, partial: 0, overdue: 0, errors: 0 };
  let attempts = 0, accepted = false, failedRefresh = false, release;
  const gate = options.delayAction ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  await page.route('**/api/v1/inventory/ppe/issue-documents/journal?**', route => route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 25, pageCount: 1, summary: { total: 0, confirmed: 0, draft: 0, cancelled: 0, overdue: 0 }, departments: [] } }));
  await page.route('**/api/v1/inventory/ppe/employees/*/workspace', route => {
    if (accepted && options.failRefreshOnce && !failedRefresh) { failedRefresh = true; return route.fulfill({ status: 503, json: { title: 'Нет связи при обновлении карточки' } }); }
    return route.fulfill({ json: workspace });
  });
  const mutations = [];
  await page.route('**/api/v1/inventory/ppe/cards/*/lines/*/actions', async route => {
    const payload = route.request().postDataJSON(); mutations.push(payload); await gate;
    if (++attempts === 1 && options.failActionOnce) return route.fulfill({ status: 409, json: { title: 'Операция отклонена. Проверьте дату и повторите.', errors: { operation: ['Операция отклонена. Проверьте дату и повторите.'] } } });
    accepted = true; card.version++; line.quantity -= payload.quantity ?? 0;
    return route.fulfill({ json: line });
  });
  return { ...kit, mutations, workspace, releaseAction: () => release?.() };
}
export async function openPpeOperations(page, origin = '') {
  await page.goto(origin + '/#inventory-ppe');
  await page.getByRole('button', { name: 'Нормы и личные карточки', exact: true }).click();
  await page.getByRole('tab', { name: /^Фактическая выдача/ }).click();
}
export async function openPpeOperation(page, name) {
  const menu = page.locator('.ppe-v2-row-menu').first();
  if (!await menu.evaluate(el => el.open)) await menu.locator('summary').click();
  await menu.getByRole('button', { name, exact: true }).click();
  await page.getByRole('dialog', { name, exact: true }).waitFor();
}
