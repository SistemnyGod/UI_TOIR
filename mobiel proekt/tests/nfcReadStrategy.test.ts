import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('NFC uses one foreground reader session and does not invoke the system tag handler', async () => {
  const source = await readFile(join(process.cwd(), 'src/services/nfcService.ts'), 'utf8');

  assert.ok(!source.includes('requestTechnology'));
  assert.ok(source.includes('registerTagEvent'));
  assert.ok(source.includes('isReaderModeEnabled: true'));
  assert.ok(source.includes('invalidateAfterFirstRead: false'));
  assert.ok(source.includes('setEventListener(NfcEvents.DiscoverTag'));
  assert.ok(source.includes('unregisterTagEvent'));
  assert.ok(source.includes('FLAG_READER_NFC_A'));
  assert.ok(source.includes('FLAG_READER_NFC_V'));
});
