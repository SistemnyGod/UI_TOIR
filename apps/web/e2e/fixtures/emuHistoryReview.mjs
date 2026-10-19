import { installEmuApiDialogFixture } from './emuDialogs.mjs';
import { workAccountingSessions } from './workAccounting.ts';
export const historyPeople = [
  { employeeId: 'employee-1', employeeName: 'Иванов Андрей Сергеевич', personnelNo: '001', position: 'Слесарь', department: 'ЭМУ', workCount: 3, workMinutes: 180, waitingMinutes: 20, otherWorkMinutes: 0, totalMinutes: 200, sectionCount: 1 },
  { employeeId: 'employee-2', employeeName: 'Петров Михаил Александрович', personnelNo: '002', position: 'Электрик', department: 'ЭМУ', workCount: 2, workMinutes: 120, waitingMinutes: 10, otherWorkMinutes: 0, totalMinutes: 130, sectionCount: 1 },
];
export async function installEmuHistoryReview(page, { delayFirst = false, failFirst = false } = {}) {
  await installEmuApiDialogFixture(page);
  const requests = []; let release;
  const gate = delayFirst ? new Promise(done => { release = done; }) : Promise.resolve();
  const work = { ...structuredClone(workAccountingSessions[0]), status: 'completed', operationalStatus: 'completed', resultStatus: 'completed', completedAt: '2026-10-13T12:00:00+05:00' };
  const works = { rows: [work], total: 1, page: 1, pageSize: 25, pageCount: 1 };
  const sections = [{ sectionId: work.sectionId, sectionName: work.sectionName, workCount: 3, employeeCount: 2, workMinutes: 300, waitingMinutes: 30, otherWorkMinutes: 0, totalMinutes: 330, problemWorks: 0 }];
  await page.route('**/api/v1/emu/work-sessions/*/audit**', route => route.fulfill({ json: { rows: [], total: 0, page: 1, pageSize: 25, pageCount: 1 } }));
  await page.route('**/api/v1/emu/employees/*/month-summary**', route => route.fulfill({ json: { shifts: [] } }));
  await page.route('**/api/v1/emu/reports/work-history**', async route => {
    const url = new URL(route.request().url()), id = url.pathname.split('/employees/')[1];
    if (!id) return route.fulfill({ json: { generatedAt: '2026-10-13T13:30:00+05:00', appliedQuery: {}, employees: historyPeople, sections, exceptions: [], totals: { totalWorks: 5, completedWorks: 5, problemWorks: 0, deletedWorks: 0, employeeCount: 2, sectionCount: 1, workMinutes: 300, waitingMinutes: 30, otherWorkMinutes: 0, totalMinutes: 330, averageWorkMinutes: 60 } } });
    requests.push(id); const index = requests.length;
    if (index === 1) await gate;
    if (index === 1 && failFirst) return route.fulfill({ status: 503, json: { title: 'Отчёт временно недоступен' } });
    return route.fulfill({ json: { generatedAt: '2026-10-13T13:30:00+05:00', appliedQuery: {}, employee: historyPeople.find(person => person.employeeId === id), sections, works } });
  });
  return { requests, release: () => release?.() };
}
export async function openHistoryEmployee(page, index = 0, origin = '') {
  await page.goto(origin + '/#emu-completed-work-history');
  await page.getByRole('button', { name: /По сотрудникам/ }).click();
  const trigger = page.locator('.emu-history-card-row button').nth(index); await trigger.click();
  const dialog = page.getByRole('dialog', { name: `Отчет по сотруднику: ${historyPeople[index].employeeName}`, exact: true }); await dialog.waitFor();
  return { dialog, trigger };
}
