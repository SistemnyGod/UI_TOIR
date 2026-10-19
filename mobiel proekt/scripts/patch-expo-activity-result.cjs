/*
 * Pinned workaround for retained Expo AppContext / recreated Android Activity.
 * Expo's deferred onDestroy can arrive after RN selected the next Activity, so
 * hostWasDestroyed alone does not guarantee activity-result re-registration.
 * Remove this patch only after the dependency's replacement is verified on a
 * device through Activity recreation, font changes and image-picker return.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const patchSpec = Object.freeze({
  packageVersion: '56.0.14',
  sourceSha256: '53072909167ce440fc8fd854a4d366b8b0901decabdd631508586677c1a364b8',
  relativeSource: 'android/src/main/java/expo/modules/kotlin/AppContext.kt',
  edits: [
    {
      before: '  private var hostWasDestroyed = false\n',
      after: '  private var hostWasDestroyed = false\n\n' +
        '  // patrol360-activity-result-registration: retain identity, not the Activity.\n' +
        '  private var activityForContracts: WeakReference<AppCompatActivity>? = null\n',
    },
    {
      before: [
        '    // We need to re-register activity contracts when reusing AppContext with new Activity after host destruction.',
        '    if (hostWasDestroyed) {',
        '      hostWasDestroyed = false',
        '      registry.registerActivityContracts()',
        '    }',
        '',
        '    activityResultsManager.onHostResume(activity)',
      ].join('\n'),
      after: [
        '    // A delayed host-destroy callback may be skipped after RN selected a new Activity.',
        '    // A cleared weak reference also means a previously observed Activity was replaced.',
        '    val activityChanged = activityForContracts != null && activityForContracts?.get() !== activity',
        '    activityResultsManager.onHostResume(activity)',
        '    if (hostWasDestroyed || activityChanged) {',
        '      hostWasDestroyed = false',
        '      registry.registerActivityContracts()',
        '    }',
        '    activityForContracts = WeakReference(activity)',
      ].join('\n'),
    },
  ],
});

const sha256 = source => createHash('sha256').update(source).digest('hex');
function replaceExactlyOnce(source, before, after) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error('Patrol360 Expo activity-result patch: unexpected native source; refusing to patch.');
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function patchExpoActivityResult(projectRoot) {
  if (!projectRoot) throw new Error('Patrol360 Expo activity-result patch requires an explicit project root.');
  const packageRoot = path.join(path.resolve(projectRoot), 'node_modules', 'expo-modules-core');
  const installed = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  if (installed.version !== patchSpec.packageVersion) {
    throw new Error(`Patrol360 Expo activity-result patch expects expo-modules-core ${patchSpec.packageVersion}, got ${installed.version}. Review the native lifecycle before upgrading.`);
  }
  const sourcePath = path.join(packageRoot, patchSpec.relativeSource);
  const source = fs.readFileSync(sourcePath, 'utf8');
  if (sha256(source) !== patchSpec.sourceSha256) {
    // Only our exact patch is accepted as an idempotent second invocation.
    let original = source;
    for (const edit of [...patchSpec.edits].reverse()) original = replaceExactlyOnce(original, edit.after, edit.before);
    if (sha256(original) !== patchSpec.sourceSha256) {
      throw new Error('Patrol360 Expo activity-result patch: unexpected native source checksum; refusing to continue.');
    }
    return { changed: false, sourcePath, sha256: sha256(source), version: installed.version };
  }
  let patched = source;
  for (const edit of patchSpec.edits) patched = replaceExactlyOnce(patched, edit.before, edit.after);
  const temporary = `${sourcePath}.patrol360-${process.pid}.tmp`;
  const descriptor = fs.openSync(temporary, 'wx');
  try {
    try { fs.writeFileSync(descriptor, patched, 'utf8'); }
    finally { fs.closeSync(descriptor); }
    fs.renameSync(temporary, sourcePath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return { changed: true, sourcePath, sha256: sha256(patched), version: installed.version };
}

module.exports = { patchExpoActivityResult, patchSpec };
if (require.main === module) {
  const result = patchExpoActivityResult(process.argv[2]);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
