# Patrol360 structural refactor plan

## Current freeze notes

This repository is currently in a dirty working state with staged, unstaged, untracked, and deleted files. The first refactor pass must not reset or revert existing work. Treat the current working tree as the product state to stabilize.

Known freeze risks:

- Multiple files have mixed staged and unstaged changes (`MM`), especially in web, EMU, Inventory/PPE, site users, and infrastructure services.
- Generated publish outputs are already tracked under `.tmp/`, `apk-check/`, and `artifacts/api-publish/`. They should be removed from source control in a separate cleanup commit after owner confirmation.
- The mobile app currently lives under a Cyrillic path, while git also reports deleted Android files under a mojibake path. Do not move mobile sources until this path issue is audited.
- Large source files make behavior changes hard to review: `apps/web/src/styles.css`, `apps/web/src/screens/inventory/inventoryWeb.css`, `apps/web/src/screens/emu/emu.css`, `EfEmuService.cs`, `EmuWorkAccountingScreen.tsx`, `AssignmentScreen.tsx`, `useEmuWorkspace.ts`, and several EF services.

## Target repository layout

Patrol360 remains a modular monolith. Do not split services or add new `.csproj` files in the first pass.

Target top-level layout:

- `apps/api` - ASP.NET Core API host.
- `apps/worker` - background worker host.
- `apps/web` - React/Vite web application.
- `apps/mobile` - future ASCII path for the Expo mobile app after path audit.
- `libs/domain` - domain entities and rules with no infrastructure dependency.
- `libs/application` - application ports and use-case interfaces.
- `libs/contracts` - API DTOs and shared wire contracts.
- `libs/infrastructure` - EF Core, integrations, exports, and external adapters.
- `tests` - backend, structure, and frontend test entrypoints.
- `docs`, `infra`, `tools`, `scripts`, `legacy`.

## Backend module map

Use the same bounded-context names in `domain`, `application`, `contracts`, and `infrastructure` as code is split:

- `Patrol`
- `Assignments`
- `Results`
- `Inventory`
- `Emu`
- `Users`
- `Mobile`
- `Perco`
- `Shared`

Rules:

- Public REST routes, DTO names, database schema, migrations, and mobile sync protocol stay stable during structural moves.
- Start by moving interfaces/contracts into module folders, then split EF services by responsibility.
- Keep one `Patrol360DbContext` initially. Move EF configurations into `Persistence/Configurations/<Module>` before considering multiple DbContexts.
- Do not mix mechanical moves with behavioral fixes.

## Frontend module map

Use feature slices for new and moved web code:

- `src/app` - app bootstrap, routing shell, screen registry integration.
- `src/shared/ui` - reusable UI primitives and operational layout components.
- `src/shared/api` - HTTP client and shared API error helpers.
- `src/shared/styles` - tokens, layout primitives, reset, and cross-feature contracts.
- `src/features/emu`
- `src/features/inventory`
- `src/features/users`
- `src/features/perco`
- `src/features/patrol`
- `src/features/dashboard`
- `src/features/mobileAccounts`

Rules:

- Keep compatibility re-exports while consumers are migrated.
- Split CSS by feature; keep `styles.css` for app shell and shared tokens only.
- Shared UI must stay behavior-neutral: no module-specific business logic.
- Feature components own their screens, hooks, api adapters, local domain helpers, and styles.

## Verification gates

Run these before and after each large move:

- `dotnet build .\Patrol360.slnx --no-restore`
- `dotnet test .\Patrol360.slnx --no-build`
- `npm run typecheck --prefix apps\web`
- `npm run test:unit --prefix apps\web`
- `npm run build --prefix apps\web`
- `.\tools\Verify-TextEncoding.ps1`

For UI-impacting moves, also verify these routes in browser:

- `/#users`
- `/#emu-work-accounting`
- `/#emu-completed-work-history`
- `/#emu-dashboard`
- `/#inventory-ppe`
- `/#perco`

## Synchronization check 2026-06-18

Source of truth for this pass is the current working copy. No git remote is configured, so there is no external branch to fetch or merge in this step.

Working tree classification at freeze time:

- Staged changes: about 160 files.
- Unstaged changes: about 123 files.
- Untracked files: about 29 files.
- Mixed staged/unstaged files are present in backend services, web screens/styles, EMU, Inventory/PPE, SiteUsers, and tests.
- Tracked generated artifacts are present under `.tmp/`, `apk-check/`, and `artifacts/api-publish/`; do not remove them from the index without owner confirmation.

Stabilization completed in this pass:

- Removed UTF-8 BOM without content changes from the seven files reported by `tools/Verify-TextEncoding.ps1`.
- Updated EMU DB integration expectations for the current business rules: default night shifts do not auto-take lunch, and 0-30 minutes after shift end is tolerated without overtime.
- Confirmed Docker runtime is available; all listed Patrol360 containers were healthy via `docker ps`.
- Confirmed `http://localhost:5173/health/ready` returns `200`.

Verification results after stabilization:

- `dotnet build .\Patrol360.slnx --no-restore` - passed.
- `dotnet test .\Patrol360.slnx --no-build` - passed for normal suite; DB integration remains opt-in.
- `dotnet run --project tests\Patrol360.Structure.Tests\Patrol360.Structure.Tests.csproj` - passed.
- `npm run typecheck --prefix apps\web` - passed.
- `npm run test:unit --prefix apps\web` - passed.
- `npm run build --prefix apps\web` - passed.
- `.\tools\Verify-TextEncoding.ps1` - passed.
- `npm run typecheck` in `Мобильное приложение` - passed.
- `PATROL360_RUN_DB_INTEGRATION=true dotnet test .\tests\Patrol360.Infrastructure.Tests\Patrol360.Infrastructure.Tests.csproj --no-restore` - passed.

Remaining risks before larger structural moves:

- The repository still contains a large mixed dirty state. Do not squash, reset, or mass-stage it without review.
- Generated outputs should be removed from source control in a dedicated cleanup step, after confirming no delivery artifact is intentionally tracked.
- The mobile app still needs a dedicated path audit before moving it to `apps/mobile`, because the current tree includes a Cyrillic path and mojibake Android deletions.
- Browser QA of `/#users`, `/#emu-work-accounting`, `/#emu-completed-work-history`, `/#emu-dashboard`, `/#inventory-ppe`, and `/#perco` should be done before accepting a UI-heavy baseline.

## Refactor pass 2026-06-18: generated cleanup and mobile path audit

Generated artifact cleanup completed:

- Removed 50 tracked generated files from the Git index only, without deleting local files from disk.
- Cleaned groups: `.tmp/apk-check`, `.tmp/publish-api`, `apk-check`, and `artifacts/api-publish`.
- Verification: `git ls-files .tmp apk-check artifacts` now returns no files.
- After owner approval, physically removed generated local folders: `.tmp`, `apk-check`, `artifacts/api-publish`, `artifacts/publish`, `output`, `tmp`, `TestResults`, `.vs`, `apps/web/dist`, and `Мобильное приложение/build-output`.
- Existing ignore coverage already includes `.tmp/`, `apk-check/`, `artifacts/`, `output/`, `tmp/`, `TestResults/`, `.vs/`, `dist/`, and `apps/web/.tmp/`.

Mobile path audit result:

- Current physical mobile project directory: `Мобильное приложение`.
- Current tracked files in the normal Cyrillic mobile path: 100.
- The old mojibake mobile Android path contained 36 tracked generated prebuild files. They were accepted as removed from the Git index because they are not source code.
- `apps/mobile` has no tracked files yet.
- `Мобильное приложение/package.json` defines the Expo app `patrol360-mobile` and keeps Android scripts on the current path.
- `Мобильное приложение/scripts/build-apk.ps1` already copies the mobile project to a stable ASCII build root before `expo prebuild`, which confirms the current Cyrillic path is a known tooling risk.
- `Мобильное приложение/README.md` and Android permission texts in `app.config.js` are readable UTF-8 in the current working copy.

Decision for this pass:

- Do not move the mobile app to `apps/mobile` yet.
- Treat the removed mojibake Android path as generated/prebuild residue. Do not restore it and do not move it into `apps/mobile`.
- Keep functional behavior unchanged; this pass only reduces source-control noise and records migration risks.

## Refactor pass 2026-06-18: web app shell and first feature moves

Web shell structure now has a behavior-neutral app layer:

- Moved `App` implementation to `apps/web/src/app/App.tsx`.
- Moved screen routing to `apps/web/src/app/routing/ScreenRouter.tsx`.
- Kept compatibility exports at `apps/web/src/App.tsx` and `apps/web/src/components/ScreenRouter.tsx`.
- Connected `apps/web/src/main.tsx` directly to `src/app/App`.
- Moved shared UI primitives behind `apps/web/src/shared/ui`, while keeping `components/ui.tsx` as a temporary re-export.

First feature-slice moves completed:

- `DashboardScreen` moved to `apps/web/src/features/dashboard/DashboardScreen.tsx`.
- `PercoIntegrationScreen` and its local stylesheet moved to `apps/web/src/features/perco/`.
- `SiteUsersScreen` moved to `apps/web/src/features/users/SiteUsersScreen.tsx`.
- `MobileAccountsScreen` moved to `apps/web/src/features/mobileAccounts/MobileAccountsScreen.tsx`.
- `AssignmentScreen`, `ResultsScreen`, `RoutesScreen`, `ScheduleScreen`, and `EmployeesScreen` moved to `apps/web/src/features/patrol/`.
- `LoginScreen` moved to `apps/web/src/app/auth/LoginScreen.tsx`.
- `EmuScreen`, `screens/emu/*`, and `emu.css` moved to `apps/web/src/features/emu/`.
- `InventoryScreen`, `screens/inventory/*`, and `inventoryWeb.css` moved to `apps/web/src/features/inventory/`.
- Old `screens/*` imports for the moved screens remain as compatibility re-exports.
- `apps/web/vite.config.ts` manual chunks now recognize `features/emu`, `features/inventory`, and `features/perco`, so production build keeps the same module-level split after the move.

Rule for the next feature moves:

- Move one feature at a time.
- Update `app/routing/ScreenRouter.tsx` to import the feature implementation directly.
- Leave a temporary re-export at the old `screens/*` path.
- Run web typecheck/tests/build and encoding gate before moving larger modules such as EMU or Inventory.

Remaining web cleanup after this pass:

- Feature-specific component groups moved out of `components/*` into owning feature folders:
  - `components/accounts/*` -> `features/mobileAccounts/components/*`.
  - `components/site-users/*` -> `features/users/components/*`.
  - `components/dashboard/*` -> `features/dashboard/components/*`.
  - `components/assignments/*`, `components/employees/*`, `components/requests/*`, `components/results/*`, `components/routes/*`, and `components/schedule/*` -> `features/patrol/components/*`.
- Old `components/*` paths remain as temporary compatibility re-exports.
- App shell components moved to `apps/web/src/app/shell`: `Sidebar`, `Topbar`, `WorkspaceHeader`, `ChromeIcon`, and `NavIcon`.
- Runtime app code now imports feature components from `features/*`, app shell from `app/shell`, and shared primitives from `shared/ui`; remaining `components/*` imports are compatibility-oriented tests or re-export files.
- Split `inventoryWeb.css` and `emu.css` into feature substyles once behavior is stable.
- Remove temporary `screens/*` compatibility re-exports only after all imports and tests point at `features/*`.

## Refactor pass 2026-06-18: feature CSS split

The large feature stylesheets were split without changing selectors or UI behavior. The old entry files remain in place so existing imports and compatibility re-exports keep working.

EMU CSS split:

- `apps/web/src/features/emu/emu.css` is now an import-only entry file.
- New substyles:
  - `features/emu/styles/emu-core.css`
  - `features/emu/styles/emu-history-report.css`
  - `features/emu/styles/emu-modal-pass.css`
  - `features/emu/styles/emu-unified-pass.css`
  - `features/emu/styles/emu-catalog-modal-fixes.css`
- Compatibility entry `apps/web/src/screens/emu/emu.css` still imports the feature entry.

Inventory CSS split:

- `apps/web/src/features/inventory/inventoryWeb.css` is now an import-only entry file.
- New substyles:
  - `features/inventory/styles/inventory-shell.css`
  - `features/inventory/styles/inventory-issue-operations.css`
  - `features/inventory/styles/inventory-history-reports.css`
  - `features/inventory/styles/inventory-admin-settings-overview.css`
  - `features/inventory/styles/inventory-ppe-custody-items.css`
  - `features/inventory/styles/inventory-responsive.css`
  - `features/inventory/styles/inventory-legacy-bridge.css`
  - `features/inventory/styles/inventory-ppe-parity.css`
  - `features/inventory/styles/inventory-ppe-redesign.css`
  - `features/inventory/styles/inventory-modal-pass.css`
  - `features/inventory/styles/inventory-ppe-operational-cleanup.css`
  - `features/inventory/styles/inventory-ppe-drawer-v2.css`
- Compatibility entry `apps/web/src/screens/inventory/inventoryWeb.css` still imports the feature entry.

Verification for this pass:

- `npm run typecheck --prefix apps\web` - passed.
- `npm run test:unit --prefix apps\web` - passed, 53 tests.
- `npm run build --prefix apps\web` - passed.
- `.\tools\Verify-TextEncoding.ps1` - passed for 736 text files.

Remaining CSS cleanup:

- `inventory-ppe-custody-items.css` was reduced to an entry file and split by owner:
  - `features/inventory/styles/ppe/ppe-journal-drawer.css`
  - `features/inventory/styles/ppe/ppe-wizard-picker.css`
  - `features/inventory/styles/custody/custody.css`
  - `features/inventory/styles/items/items.css`
- `inventory-ppe-redesign.css` was reduced to an entry file and split by PPE surface:
  - `features/inventory/styles/ppe/ppe-redesign-shell.css`
  - `features/inventory/styles/ppe/ppe-redesign-wizard.css`
  - `features/inventory/styles/ppe/ppe-redesign-picker.css`
  - `features/inventory/styles/ppe/ppe-redesign-print.css`
  - `features/inventory/styles/ppe/ppe-redesign-responsive.css`
- Continue shrinking remaining broad Inventory files only after a separate UI QA pass confirms current behavior.
- Move repeated table, modal, action-menu, pagination and inspector primitives into `shared/ui` after feature CSS ownership is stable.

EMU core CSS cleanup:

- `features/emu/styles/emu-core.css` was reduced to an entry file and split by surface:
  - `features/emu/styles/core/emu-shell-panels.css`
  - `features/emu/styles/core/emu-work-board.css`
  - `features/emu/styles/core/emu-history-forms.css`
  - `features/emu/styles/core/emu-modals-references-plans.css`
  - `features/emu/styles/core/emu-dashboard.css`
  - `features/emu/styles/core/emu-responsive.css`
- No selectors or rule bodies were changed; only file ownership and import order were clarified.

## Refactor pass 2026-06-18: EMU work accounting screen split

`EmuWorkAccountingScreen` was reduced from about 3300 lines to a composition container of about 560 lines without changing API calls, DTOs, routes, CSS selectors, or user scenarios.

New local ownership under `apps/web/src/features/emu/work-accounting`:

- `types.ts` - modal, filter, density, preferences and draft types/constants.
- `workAccountingUtils.ts` - pure local helpers for board state, filters, labels, dates and validation.
- `WorkAccountingBoard.tsx` - KPI summary, toolbar filters, board sections and work cards.
- `WorkSidePanel.tsx` - right-side work/employee panel, shift summary, decisions and decision resolution.
- `components/EmployeePicker.tsx`, `components/ModalFrame.tsx`, `components/WorkSummary.tsx` - local UI primitives used only by this workflow.
- `modals/WorkSessionModals.tsx` - create/edit/pause/resume/complete/carry-over/delete/details and employee participation modals.
- `modals/DirectoryModals.tsx` - catalogs, templates and favorites modals.
- `modals/PlanBoardModal.tsx` - weekly plan workflow.

Verification during the split:

- `npm run typecheck --prefix apps\web` - passed after each major extraction.

Remaining EMU frontend cleanup:

- `WorkSidePanel.tsx` and `WorkSessionModals.tsx` were split further in the next pass:
  - `modals/WorkSessionModals.tsx` is now a compatibility barrel.
  - `modals/CreateEditWorkModals.tsx` owns create/edit work session forms.
  - `modals/EmployeeParticipationModals.tsx` owns add/finish/mistaken employee participation flows.
  - `modals/WorkLifecycleModals.tsx` owns pause/resume/complete/carry-over/delete flows.
  - `modals/WorkDetailsModal.tsx` owns the read-only work details/audit modal.
  - `WorkSidePanel.tsx` now owns only the side-panel composition and re-exports `ResolveDecisionModal`.
  - `side/ShiftPanels.tsx`, `side/DecisionPanels.tsx`, and `side/EmployeeWorkloadPanel.tsx` own side-panel sub-surfaces.
- Keep old `apps/web/src/screens/emu/EmuWorkAccountingScreen.tsx` compatibility re-export until a separate import cleanup confirms no legacy consumers remain.
- Next EMU candidates: split `WorkAccountingBoard.tsx` into cards/filters/summary, or move to `EmuCompletedWorkHistoryScreen.tsx`.
- `WorkAccountingBoard.tsx` was then reduced to a compatibility barrel:
  - `board/BoardSummaries.tsx` owns catalog and attention summaries.
  - `board/BoardFilters.tsx` owns filter tabs, section quick filter and density switch.
  - `board/WorkBoardSection.tsx` owns board section grouping and delegates cards.
  - `board/WorkCard.tsx` owns the work card and quick command menu.
- Next EMU candidates: move to `EmuCompletedWorkHistoryScreen.tsx` or split `workAccountingUtils.ts` into board/date/label helpers after coverage is clear.
