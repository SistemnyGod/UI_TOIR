import fs from 'node:fs';
import { installEmuDialogFixture } from './emuDialogs.mjs';
const people = JSON.parse(fs.readFileSync(new URL('../../src/fixtures/accountingEmployees.json', import.meta.url), 'utf8'));
export async function installRemainingWindows(page) {
  await installEmuDialogFixture(page);
  await page.addInitScript(ids => { if (location.hostname === '127.0.0.1') localStorage.setItem('patrol360.patrolEmployees.favoriteIds.v1', JSON.stringify(ids)); }, people.slice(0, 2).map(person => person.id));
}
