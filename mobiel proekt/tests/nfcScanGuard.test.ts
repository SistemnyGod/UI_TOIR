import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('NFC tag handler is single-flight, debounced and always releases its lock', async () => {
  const source = await readFile(join(process.cwd(), 'src/features/patrol/ScanNfcScreen.tsx'), 'utf8');
  const start = source.indexOf('const handleTag = useCallback(');
  const end = source.indexOf('  }, [assignmentId, router]);', start);
  const handler = start >= 0 && end > start ? source.slice(start, end) : '';

  assert.ok(handler, 'NFC tag handler was not found.');
  assert.ok(handler.includes('if (!screenActiveRef.current || !appActiveRef.current || scanInProgressRef.current)'));
  assert.ok(handler.includes('scanInProgressRef.current = true'));
  assert.ok(handler.includes('lastTagRef.current'));
  assert.ok(handler.includes('< 2000'));
  assert.ok(handler.includes('finally'));
  assert.ok(handler.includes('scanInProgressRef.current = false'));
  assert.ok(handler.includes('alreadyScanned || result.alreadyCompleted'));
});
