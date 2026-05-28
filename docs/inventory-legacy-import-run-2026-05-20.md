# Inventory Legacy Import Run - 2026-05-20

## Source

- Source system: `IT-inventarizaci`
- Source database: PostgreSQL copy `inventory_app_migration_copy`
- Target database: local Patrol360 PostgreSQL database `patrol360`
- Production inventory database and `admin` password were not changed.

## Result

The real import completed through `POST /api/v1/inventory/legacy/import`.

| Metric | Value |
| --- | ---: |
| Tables scanned | 14 |
| Rows read | 2255 |
| Rows inserted in final successful run | 681 |
| Rows updated in final successful run | 1573 |
| Rows skipped | 1 |
| Stock checksum balances | 25 |

The single skipped row is an orphan legacy `ppe_card_line_event` whose `line_id` has no matching `ppe_card_line` in the source copy.

## Repeat Run

The import was repeated after restarting the source copy database container. The first repeat attempt failed before reading data because the source container was stopped and Docker DNS could not resolve `inventory_app-db-1`. After `inventory_app-db-1` was started again, the repeat import completed successfully and proved idempotency:

| Metric | Value |
| --- | ---: |
| Tables scanned | 14 |
| Rows read | 2255 |
| Rows inserted | 0 |
| Rows updated | 2254 |
| Rows skipped | 1 |

The target counts stayed unchanged after the repeat run, which confirms that the import updates existing legacy-linked rows instead of creating duplicates.

## Target Counts

| Table | Rows |
| --- | ---: |
| `employees` | 174 |
| `inventory.categories` | 10 |
| `inventory.units` | 8 |
| `inventory.warehouses` | 1 |
| `inventory.items` | 1347 |
| `inventory.custody_documents` | 11 |
| `inventory.custody_records` | 11 |
| `inventory.custody_record_events` | 31 |
| `inventory.ppe_cards` | 24 |
| `inventory.ppe_card_lines` | 32 |
| `inventory.ppe_card_line_events` | 79 |
| `inventory.stock_moves` | 91 |
| `inventory.system_log` | 413 |

## Fixes Applied During Import

- Enabled runtime migration through existing EF migrations while the local `dotnet ef` tool is blocked by sandbox NuGet access.
- Added EF migration metadata to `20260520165000_InventoryLegacyImport` so Patrol360 applies `legacy_import_runs`, `employee_legacy_links`, and `user_legacy_links`.
- Added fallback to the default warehouse for legacy `custody_record` rows, because the legacy table has no `warehouse_id` column while the Patrol360 model requires one.
- Fixed inventory history and system log projections by materializing `DateTimeOffset` before converting to DTO `DateTime`.

## Verification

- Docker API build: passed.
- Patrol360 API `/api/v1/inventory/overview`: passed.
- Inventory items list endpoint: passed.
- PPE cards list endpoint: passed.
- Custody records endpoint: passed.
- Inventory history endpoint: passed after projection fix.
- System log endpoint: passed after projection fix.
- UTF-8 verification: passed for 314 text files.
- .NET build/tests in `tools/Test-All.ps1`: passed; integration tests that require explicit DB settings remained skipped by project rules.
- Frontend `npm run test --prefix apps/web`: passed, 4 files and 27 tests.
- Frontend `npm run typecheck --prefix apps/web`: passed.
- Frontend `npm run build --prefix apps/web`: passed outside sandbox.

## Remaining Environment Issue

`tools/Test-All.ps1` still cannot complete the `npm ci` step on this workstation because Windows denies unlinking a locked Rollup native module under `apps/web/node_modules/@rollup/.rollup-win32-x64-msvc-*`. Running `npm install --prefix apps/web --no-audit --no-fund` restored dependencies, and the actual frontend tests/build passed. A clean shell or reboot should clear the stale native module lock so the full script can pass end-to-end.
