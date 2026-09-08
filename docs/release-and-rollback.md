# Patrol360 release and rollback

This stabilization build is a release candidate until both gates are recorded: a signed Release APK has been installed and exercised on a physical Android device, and a database backup has been restored into an isolated PostgreSQL instance and verified.

## Prepare

1. Set `ASPNETCORE_ENVIRONMENT=Production`, `SOURCE_REVISION` to the exact Git commit, and all required database/service secrets. For a fresh database only, set `PATROL360_BOOTSTRAP_ADMIN_PASSWORD` to a unique secret of at least eight characters. Remove it after the first successful migration. Existing administrators are not changed.
2. Establish certificate trust on each target device and verify the canonical HTTPS URL without disabling certificate validation. A user-installed CA alone may not be trusted by a production Android app; validate the actual managed/system trust configuration. The certificate/key pair was checked locally; device trust is still an acceptance gate.
3. Create and verify a PostgreSQL backup. Record its hash and storage location.
4. Run repository, PostgreSQL integration, web, worker, and Android checks. A failed command stops the release; do not reuse an old `apps/web/dist` after a failed web build.

## Build and inspect

Run `tools/Start-Patrol360.ps1` only in the intended deployment window. It builds fresh web assets, builds images, waits for health, checks the HTTPS entrypoint, and writes `artifacts/build-manifest.json`. The manifest records the commit, dirty state, tool versions, lock-file hashes, and selected artifact hashes. API and worker images carry the same commit in the OCI `org.opencontainers.image.revision` label.

Before acceptance, require `dirty: false`, compare image labels with the manifest commit, and archive the manifest with the APK and database backup. `infra/scripts/update-patrol360-web-only.ps1` retains one previous asset generation for already open browser tabs and stops before merging or publishing if `npm run build` fails.

For direct API execution the bootstrap setting is `Patrol360__BootstrapAdminPassword`; Compose maps `PATROL360_BOOTSTRAP_ADMIN_PASSWORD` to it. Inspect `SELECT * FROM mobile_attachment_migration_review;` after migration. These rows identify ambiguous historical links excluded from public output; retain their files and resolve ownership manually. The migration does not delete files.

`tools/New-BuildManifest.ps1` accepts artifact directories and hashes every contained file, records source-file hashes and `sourceTreeSha256`, and marks an uncommitted candidate as dirty. Preserve this manifest together with image digests. A commit label alone does not identify dirty source changes.

## Roll back

1. Stop application traffic and retain the failed release logs and manifest.
2. Restore the previously tagged API, worker, and web images as one set. Do not mix revisions.
3. If the release applied a data migration that cannot run safely with the previous binaries, restore the verified pre-release database backup into an isolated database first, validate it, then switch the application connection during the rollback window.
4. Start the previous set, verify API readiness, worker heartbeat freshness, HTTPS login, and one read-only workflow. Keep the failed release artifacts for diagnosis.

No script in this stabilization stage switches the production server or phones automatically.

Older binaries do not enforce the new confirmed-attachment boundary. Do not roll back only the binaries against data containing newly staged attachments. Coordinate the previous image set, database backup and attachment storage; retain post-backup files separately for reconciliation rather than deleting them.

## Dependency advisory baseline

On 2026-09-08, NuGet reported no known vulnerable packages. Web Vite was updated to 7.3.6 and compatible transitive patches were installed. `npm audit fix` reported zero vulnerabilities; all six previously observed remaining advisory ranges were independently compared with the final lockfile and removed. A later fresh audit endpoint request timed out, so repeat online audit before release.

Mobile compatible updates could not be installed because official registry tarball requests repeatedly timed out. The original dependency graph was restored, preserving application fixes and version 0.1.30 / Android code 31. The online baseline has 15 affected package entries (10 high, 4 moderate, 1 low); see `TestResults/stabilization/npm-mobile-audit.json`. Router/query-string/decode-uri-component require runtime review; Metro, Babel and related build dependencies are tooling findings. A signed APK built from this graph is an internal candidate, not an accepted production release. Resolve this dependency gate without forced major upgrades, then rebuild and repeat acceptance.
