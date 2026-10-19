import { installEmuApiDialogFixture } from './emuDialogs.mjs';
export async function installShiftReminder(page) {
  const fixture = await installEmuApiDialogFixture(page);
  await page.route('**/api/v1/emu/shift-reports/options', route => route.fulfill({ json: { employees: [], sections: [], shifts: [] } }));
  return fixture;
}
export async function openShiftReminder(page, origin = '') {
  await page.goto(origin + '/#emu-shift-report-entry');
  const trigger = page.locator('.emu-notification-settings-button'); await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Настройки уведомлений', exact: true }); await dialog.waitFor();
  return { dialog, trigger };
}
