import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { patchExpoActivityResult, patchSpec } = require('../scripts/patch-expo-activity-result.cjs');
const configPath = require.resolve('../app.config.js');
const roots: string[] = [];
const sha256 = (source: string) => createHash('sha256').update(source).digest('hex');

function originalSource() {
  const installedRoot = path.dirname(require.resolve('expo-modules-core/package.json'));
  let source = readFileSync(path.join(installedRoot, patchSpec.relativeSource), 'utf8');
  // Tests work after prebuild as well as after a fresh install. Reconstruct the
  // pinned pristine fixture only if this exact known patch was already applied.
  if (sha256(source) !== patchSpec.sourceSha256) {
    for (const edit of [...patchSpec.edits].reverse()) source = source.replace(edit.after, edit.before);
  }
  expect(sha256(source)).toBe(patchSpec.sourceSha256);
  return source;
}

function fixture(version = patchSpec.packageVersion) {
  const root = mkdtempSync(path.join(tmpdir(), 'patrol360-native-patch-')); roots.push(root);
  const packageRoot = path.join(root, 'node_modules', 'expo-modules-core');
  const sourcePath = path.join(packageRoot, patchSpec.relativeSource);
  mkdirSync(path.dirname(sourcePath), { recursive: true });
  writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'expo-modules-core', version }));
  const original = originalSource();
  writeFileSync(sourcePath, original);
  return { root, sourcePath, original };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
  delete require.cache[configPath]; vi.unstubAllEnvs();
});

it('patches the actual pinned native source atomically and is idempotent', () => {
  const { root, sourcePath, original } = fixture();
  const first = patchExpoActivityResult(root);
  expect(first.changed).toBe(true);
  const patched = readFileSync(sourcePath, 'utf8');
  expect(patched).not.toBe(original);
  expect(first.sha256).toBe(sha256(patched));
  for (const edit of patchSpec.edits) expect(patched).toContain(edit.after);
  const second = patchExpoActivityResult(root);
  expect(second).toEqual({ ...first, changed: false });
  expect(readFileSync(sourcePath, 'utf8')).toBe(patched);
});

it('refuses an unexpected dependency version without altering its source', () => {
  const { root, sourcePath, original } = fixture('56.0.15');
  expect(() => patchExpoActivityResult(root)).toThrow('expects expo-modules-core 56.0.14, got 56.0.15');
  expect(readFileSync(sourcePath, 'utf8')).toBe(original);
});

it.each([false, true])('refuses drift in native source, previously patched=%s', (alreadyPatched) => {
  const { root, sourcePath } = fixture();
  if (alreadyPatched) patchExpoActivityResult(root);
  const drifted = readFileSync(sourcePath, 'utf8') + '\n// unreviewed native change\n';
  writeFileSync(sourcePath, drifted);
  expect(() => patchExpoActivityResult(root)).toThrow('unexpected native source');
  expect(readFileSync(sourcePath, 'utf8')).toBe(drifted);
});

it('runs the real app config dangerous mod against the requested build root', async () => {
  const { root, sourcePath, original } = fixture();
  vi.stubEnv('PATROL360_ENVIRONMENT', 'test');
  vi.stubEnv('PATROL360_SOURCE_COMMIT', 'native-patch-test');
  vi.stubEnv('PATROL360_SOURCE_DIRTY', 'false');
  const { expo } = require(configPath);
  const plugin = expo.plugins.find((entry: any) => typeof entry === 'function' && entry.name === 'withPatrol360ActivityResultFix');
  expect(plugin).toBeTypeOf('function');
  const config = plugin({ name: 'Patrol360', slug: 'patrol360-mobile' });
  await config.mods.android.dangerous({ ...config, modRequest: { projectRoot: root, platform: 'android', modName: 'dangerous' } });
  expect(readFileSync(sourcePath, 'utf8')).not.toBe(original);
  expect(patchExpoActivityResult(root).changed).toBe(false);
  // Native Activity recreation remains enabled; the patch never writes a
  // manifest or hides font/density changes from Android.
  expect(config.mods.android.manifest).toBeUndefined();
});
