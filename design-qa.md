# Design QA: дашборд обходов — 2026-10-02

Scope: implementation of the exact selected compact dashboard in the existing web application. Previous reports are retained below.

- Selected source: user attachment `codex-clipboard-29c7adee-782c-457f-8454-10652a34c57d.png`, also saved as `artifacts/dashboard-ui-2026-10-02-concise/concise-dashboard.png` (1584 × 993).
- Actual implementation: `apps/web/src/features/dashboard/DashboardScreen.tsx`, period loader/hook, scoped styles, existing application navigation. Local application: http://127.0.0.1:5182/#dashboard. Visual fixture: http://127.0.0.1:5182/dashboard-ui-preview.html, using the same view and shell with synthetic records; no fixture API/storage mutations.
- Evidence: `artifacts/dashboard-ui-2026-10-02-implementation/`. Same-state desktop source/implementation comparison: `page-comparison-before.jpg`, `page-comparison-final.jpg`; readable table comparison: `table-focus-final.jpg`. Final source and desktop PNG are both 1584 × 993. Other evidence: `point-desktop.png`, `page-month-final.png`, `page-laptop-final.png`, `page-mobile-final.png`, `point-mobile-final.png`, `quick-assignment.png`.
- Additional CSS viewports: 1366 × 768 and 390 × 844. The capture provider sometimes crops/resizes scrollbar boundaries; these raster bounds are not assumed to equal CSS layout size. Temporary sidebar/modal animation frames were replaced by settled captures. Desktop final document width is 1584/1584 (client/scroll); laptop 1351/1351; mobile 375/375. Desktop tables measure 795/795 and 1250/1250; laptop 646/646 and 1021/1021. Mobile tables scroll within 329 px containers (650/680 px content) rather than expanding the page. Mobile action bounds stay within x=10…365; topbar controls within x=12…363. Point dialog close button is 44 × 44 px; its footer remains visible.

## Findings and corrections

- [P1, fixed] A first-page result list could produce incomplete period metrics/ranking. The dashboard now reads every bounded v3 group page, verifies pagination and unchanged total, deduplicates records, and publishes one complete result set. Failed later pages preserve the previous complete snapshot. This is not a transactional server snapshot; a changed total asks for retry rather than pretending to provide a complete ranking.
- [P1, fixed] Obsolete result responses could overwrite another period or owner. The dashboard hook coalesces refreshes, cancels obsolete requests and checks source/user/permission/period identity before applying data. Old-owner results are hidden immediately. Missing data displays a dash instead of a false zero.
- [P1, fixed] A quick-assignment intent remained positive after opening, so normal navigation back to Assignments could reopen its form. The intent is consumed once. Browser verification: ordinary reentry has zero dialogs; a second explicit quick-assignment command has one dialog. The button checks both assignment and request write access and does not inherit an unrelated selected report.
- [P2, fixed] Legacy table minimum width clipped ranking buttons and added an unwanted desktop scrollbar. Scoped table sizing removes the 840 px minimum, and the action column reserves enough space on laptops. All ranking buttons now fit in the inspected desktop/laptop layouts.
- [P2, fixed] Legacy paragraph styling reduced the page subtitle and card descriptions. Scoped typography restores the source hierarchy and compact density. The layout retains the four-metric strip, 1.9:1 upper panels, five ranked rows and three latest report rows.
- [P2, fixed] Mobile dialog close target inherited 36 px sizing. Scoped mobile styling restores a 44 px target and keeps the footer accessible.

## Implemented behavior and validation

- Calendar week (Monday–Sunday) or calendar month, bounded by the last successful refresh; future recordings are excluded. Counts distinguish patrol reports from point recordings. Latest reports are grouped by assignment, and a healthy final point cannot hide an earlier issue in that report.
- Top five points are ranked by issue recordings. Stable point IDs identify the history; legacy names include route identity. The point dialog retains its opening snapshot during background refresh so new records do not displace the user's reading position. It initially renders 50 records and supports loading more locally; exact report IDs are passed to existing result navigation. Permission, owner and period changes close the obsolete history.
- The live plan uses today's nonterminal requests and planned assignments; duplicates linked to the same request are removed, and completed/cancelled/future-day entries are excluded. Planned/waiting assignments do not count as currently in progress. Request rows open their existing request dialog, and unlinked planned assignments open the existing planning screen.
- Existing result and schedule navigation was verified in the actual local application. Quick assignment opens the actual assignment request form. No assignment was submitted during browser checks. Unit tests verify exact report/request ownership and retained history. Fixture report/request buttons explicitly describe synthetic data; they are not evidence of server mutations.
- Cached results remain visible during a refresh or network error. Initial loading, empty, missing-access and error/retry states are distinct. Background result refresh runs once per minute while visible and on focus, without clearing displayed rows. The existing application owns its request/assignment refresh. No point media or result details are downloaded for summary calculations.
- Automated validation: **83 tests passed in 5 files** (`dashboardRedesign`, `patrolResultsAssign`, `patrolDataLoading`, `assignmentRequestModal`, `ui`). Includes period boundaries/future exclusion, group/point counts, complete pagination, changing totals, stale responses, coalesced requests, failed later-page rollback, owner changes, permissions, exact navigation IDs, bounded history and consumed assignment intent.
- TypeScript and production Vite build passed. Existing large-chunk warning concerns other modules. Modified dashboard/router/assignment files pass `git diff --check`. Final browser error log is empty. No Playwright CLI was used, and no server deployment was performed.

## Intentional differences / follow-up polish

- Existing sidebar, topbar, official supplied brand asset and product font remain in use. Outline icons use the project's icon library; count bars use native progress controls. No generated imagery is needed for this text/table interface. Generated font/raster appearance and existing chrome differ slightly from the image (P3).
- Fixture figures (64 reports, 14 with issues, five points, two in progress) come from synthetic records. Some names/timestamps differ slightly from the generated image so the fixture remains internally consistent; no production numbers were hardcoded.
- The image's unassigned-row “Назначить” shortcut is represented by opening the existing request/planning flow. A standalone reassignment command is not fabricated. Global quick assignment is functional.
- Browser API delivery was checked in local mock mode; actual production data volumes and live server availability were not measured. For very large monthly journals, a server-side aggregate endpoint can reduce transfer; this frontend implementation bounds requests by the selected period and never silently truncates the summary.
- No remaining actionable P0/P1/P2 issue in the inspected final states. Temporary viewport overrides are reset before handoff; the local fixture remains open.

final result: passed

---
# Design QA: мобильные аккаунты — 2026-10-02

Scope: existing web «Обход → Мобильные аккаунты», account journal, activity, detail, creation and management dialogs. Previous reports are retained below.

- Source visual truth: `artifacts/design-patrol-2026-10-01/v2/02-accounts.png`, `03-account-detail.png`, `04-account-create.png`; each 1586 × 992.
- Local implementation: http://127.0.0.1:5182/accounts-ui-preview.html. Development-only fixture renders the actual application shell and account components; all mutation callbacks reject without API calls or storage writes. No production account, password, binding or server deployment was changed.
- Evidence directory: `artifacts/accounts-ui-2026-10-02/`. Final desktop evidence: `page-desktop.png`, `detail-desktop.png`, `create-desktop.png`. Additional states: `sessions-desktop.png`, `menu-laptop.png`, `edit-laptop.png`, `link-laptop.png`, `create-laptop.png`, `page-mobile-final.png`, `detail-mobile-final.png`, `create-mobile-final.png`.
- Combined source + implementation evidence: `create-comparison-before.jpg`, `page-comparison-final.jpg`, `detail-comparison-final.jpg`, `create-comparison-final.jpg`. Readable crops: `page-focus-final.jpg`, `detail-focus-final.jpg`, `create-focus-final.jpg`. Original pixels are retained without density rescaling; the two original images are placed side by side with labels.
- Desktop CSS viewport and final PNGs: 1586 × 992. Additional CSS viewports: 1366 × 768 and 390 × 844. Browser capture sometimes returns a scrollbar/content boundary crop (for example earlier mobile dialog PNGs 375 × 812); these crops are not compared as layout drift. Transient sidebar/modal animation frames were replaced with settled captures. Temporary viewport override is reset after QA.
- Fixture: one account with four employees, seven unfinished sessions and two distinct device IDs. Explicit offline status is retained despite unfinished sessions. Dates, versions and event descriptions are test data, rather than evidence of current production connections.

## Comparison findings and corrections

- [P1, fixed] Form autofocus could replace the dialog opener before focus restoration. The screen now snapshots the opener before mounting any account dialog; Escape restores focus to the account action. Dialog tab navigation uses roving focus and Arrow/Home/End controls.
- [P1, fixed] Management errors in editing, password reset and deletion could escape the form handler. Forms now keep entered values, display the error and permit retry. Pending requests disable mutation controls and prevent dismissal or duplicate submission.
- [P2, fixed] Legacy styles overrode the new filters, table type, activity headings and form spacing. Scoped styles restore readable control sizes, selected tab underlines, compact sections and the reference's white/navy/cobalt palette.
- [P2, fixed] Account actions inside the table could be clipped by its scrolling container. The menu is rendered in a fixed portal, positioned against its trigger and kept within the viewport. Opening the menu does not enlarge the page. Escape returns to the trigger.
- [P2, fixed] The employee-binding form shrank its table almost to the header at laptop height. Form sections no longer shrink; the content scrolls while footer controls remain accessible. Final 1366 × 768 binding dialog spans y=16…744 and its footer y=672…743. Keyboard navigation reaches the last employee and the footer without changing bindings.
- [P2, fixed] Mobile dialog close controls inherited a 36 px target. Final close controls are 44 × 44 px. At CSS viewport 390 × 844, inspected detail/create dialogs span x=10…365/y=6…834; content/client widths are equal (375 px), with no horizontal overflow. Creation footer spans y=733…833, detail footer approximately y=724…833.
- Remaining minor P3 differences: existing application chrome/sidebar, native selects and radio controls, real-data wrapping and generated font/raster rendering. The connection filter remains available as a disclosure, and refresh remains an explicit control. No remaining actionable P0/P1/P2 issue in the inspected final states.

## Implemented behavior and validation

- Account list has search by login/employee/role, role/access/device filters, optional connection filter, reset and 25-row pagination. A smaller refreshed list permanently clamps the current page. Cached rows and entered searches remain visible during background loading or a refresh error.
- Row commands target the clicked account, including when another account was selected. Creation, binding, editing, password and deletion controls respect management permissions; readers retain account inspection. Deletion still requires the existing confirmation.
- Detail dialog provides Overview, Employees, Sessions and Security, with employee information, actual device metadata, recent events and persistent actions. Activity/session/event records are filtered to the selected account's ID, preventing cached data from a previously selected account from appearing under a new owner.
- Device summaries are deduplicated by actual device ID and newest activity. Identical model names with different IDs are not merged. An unfinished refresh session is never interpreted as proof that a phone is online.
- Creation retains API payloads, password validation, temporary/manual modes, language and access options. The second roadmap stage refers to the existing employee-binding operation after creation, rather than fabricating an unsupported combined server operation. Collapsed language controls are excluded from the focus trap until opened.
- Editing/binding drafts are initialized on account identity changes; an ordinary same-account background refresh does not overwrite the user's form. Server API contracts and access checks remain in place.
- Browser checks: search by employee, empty search and reset, all-events transition, session data, account dialog, keyboard tab selection, Escape/focus return, desktop/laptop/mobile layouts, visible menu and binding footer. Final browser error log is empty. Actual production password/account changes were not executed.
- Automated checks: **81 tests passed** across `mobileAccountsRedesign`, `ui`, `resultsRedesign` and `assignmentRequestModal`. New account coverage includes permissions, clicked-row ownership, pagination, cached refresh, device grouping, keyboard/focus, form failures, preserved drafts, payload validation and pending-operation guards.
- TypeScript and production Vite build passed. Existing large-chunk warnings concern other modules. `git diff --check` passed for the touched account/shared files. Visual-only mobile target-size adjustment was verified again in the browser and rebuilt after the tests.

QA result: passed for the inspected local account UI and regression scenarios. Live server account mutations, device reconnection and mobile APK behavior are outside this frontend validation.

---

# Design QA: результаты обходов — 2026-10-01

Scope: existing web «Обход → Результаты обходов», results journal and patrol detail dialog. Previous QA reports are retained below.

- Visual references: `artifacts/design-patrol-2026-10-01/v2/05-results.png` and `06-result-detail.png`, both 1586 × 992.
- Local implementation: http://127.0.0.1:5182/#results in mock mode. Production server and production data were not modified.
- Evidence: `artifacts/results-ui-qa/page-desktop.png`, `modal-desktop.png`, `modal-remark.png`, `page-mobile.png`, `modal-mobile.png`, `modal-laptop.png`, `menu-laptop.png`.
- Full reference + implementation comparisons: `page-comparison-before.jpg`, `modal-comparison-before.jpg`, `page-comparison-final.jpg`, `modal-comparison-final.jpg`. Focused comparisons: `page-focus-final.jpg`, `modal-focus-final.jpg`. Each comparison combines source and implementation in one image; original pixels are retained, with no density rescaling.
- Desktop viewport and final captures: 1586 × 992. Additional CSS viewports: 1366 × 768 and 390 × 844. Temporary viewport override reset after QA.
- Fixture differences: one completed patrol with two points and two attachments, rather than the reference's 39 patrols and five-point selected patrol. Existing mock photo is a 1 × 1 image; existing mock video has an empty body. The reference equipment photograph was not substituted as real report evidence. Video playback on a valid production file remains an integration check.

## Comparison findings

- [P2, fixed] Duplicate workspace padding and oversized summary/table spacing reduced visible journal rows. Removed nested padding and compacted the four-metric strip and row spacing.
- [P2, fixed] Inline media controls were initially clipped because new CSS names did not match component classes. Corrected selectors; enlargement and gallery navigation remain visible.
- [P2, fixed] Dialog support text and filters were smaller than the reference. Increased search and footer controls, point metadata and filter labels, and restored cobalt selected filters.
- [P2, fixed] Legacy mobile header rules placed the close control below the title. Kept the close control at the upper right, with wrapping title and badge.
- [P2, fixed] Legacy mobile table cells retained 48 px fixed heights. Removed these heights for informational cells; action targets remain at least 44 px.
- Row action menu is rendered outside the scrolling table, so it remains visible on laptop-sized screens. Escape restores focus to its trigger; arrows move between actions.
- Remaining minor P3 differences: native select styling, inherited application shell typography, compact icon badges and real data-dependent wrapping differ from raster reference. No remaining actionable P0/P1/P2 layout issue in inspected final states.

## Implemented behavior and validation

- Separate date/time, route, employee, shift, checked points, remarks, media and actions columns. Six patrol groups per page; newest first by default; search and filters reset pagination, and a shorter refresh clamps the current page permanently.
- Date period is sent to the existing API for loading and exporting. Shift and alternate sorting apply to loaded groups; partial-result captions and load-more action make this boundary explicit. Shift-filtered export is a CSV of the loaded journal, rather than an incorrect unfiltered server export.
- Detail dialog uses a point list plus selected-point panel, including search, remarks/media filters, original order, comment, manual mark, actual media and fixed footer actions. Links and creation actions respect available callbacks and permissions.
- Shared point classification ignores empty issue values, and consistently distinguishes defects and unavailable marks in journal, dialog and enlarged media view.
- Attachment downloads are lazy for the selected attachment, with object URL cleanup, late-response protection, retry on request/decode failure, and original attachment index preserved in enlargement.
- Direct result links load point details as row clicks do. Failed detail requests show a retry action instead of an indefinite loading message.
- Server export now includes the media filter. Legacy patrols without an assignment ID use the selected patrol's local point CSV rather than exporting an unrelated server selection. CSV quoting protects formula-prefixed cells.
- Browser checks: period and shift empty states, point-name journal search, remarks selection, media navigation, enlargement, Escape return and restored focus. At 1366 × 768 dialog is y=24…744 and footer y=668…743. At 390 × 844 dialog is y=10…834, footer y=718…833, and close control x=312…348/y=27…63. No page or dialog horizontal overflow. Browser error log was empty in final inspection.
- Automated checks: 76 tests passed in resultsRedesign, patrolResultsAssign, resultsRenderStability, resultDetailDrawer and ui. TypeScript and production Vite build passed. Existing large-chunk warnings concern other modules. `git diff --check` passed.

QA result: passed for the inspected local UI and regression scenarios. Production integration and valid real-video playback were not claimed or tested. Existing production API endpoints and permissions are retained.

---

# Design QA: назначения — 2026-10-01

Scope: web «Обход → Назначения», creation modal. Previous unrelated QA is retained below.

- Source visual truth: `artifacts/design-patrol-2026-10-01/v2/01-assignments.png` and `07-assignment-create.png` (both 1586 × 992).
- Implementation: http://127.0.0.1:5182/#assign, local mock mode; production server not changed.
- Screenshots: `artifacts/assignment-ui-qa/page-desktop.jpg`, `modal-desktop.jpg`, `page-mobile.jpg`, `modal-mobile.jpg`, `modal-laptop.jpg`.
- Desktop CSS viewport 1586 × 992. Modal capture 1586 × 992; page capture 1571 × 983 returned by browser capture, including its scrollbar/content boundary difference. No density rescaling performed. Comparison preserves original pixels; minor capture boundary difference is not treated as layout drift.
- Additional CSS viewports: 1366 × 768 and 390 × 844. Temporary viewport override reset after QA.
- State: five favorite employees, one available route, selected employee, empty employee history, two existing mock assignments, saved local draft; modal with restored comment and medium priority. Reference has different employees, two routes and populated history. Counts/content differences are expected fixture differences, not fabricated production evidence.

## Comparison history and findings

1. Initial combined evidence: `page-comparison-before.jpg`, `modal-comparison-before.jpg` in `artifacts/assignment-ui-qa/`.
   - [P2, fixed] Extra workspace padding and oversized list spacing pushed bottom tabs below the viewport. Removed duplicate padding, compacted panel headers and employee rows.
   - [P2, fixed] Modal controls and actions were smaller than the reference, employee selector lacked its compact profile context. Enlarged controls to 48 px, footer actions to 46 px, added avatar and role/shift within the employee field.
2. Revised full-view evidence: `page-comparison-final.jpg`, `modal-comparison-final.jpg`; focused comparisons `page-focus-final.jpg`, `modal-focus-final.jpg`. Source and implementation are combined in each comparison image. No remaining actionable P0/P1/P2 layout issues in inspected states.

## Required fidelity surfaces

- Fonts: existing Segoe UI stack retained; 28 px page title, 24 px dialog title, 14 px form controls, 12–14 px supporting content. Exact generated font/raster appearance differs slightly (P3), but long employee names wrap and remain readable.
- Spacing/layout: three panels, one creation entry point, selection strip, lower tabs, two-column modal, separate persistent footer. At 1366 × 768 the dialog fits y=16…752 and actions y=672…751. At 390 × 844 fields scroll inside the dialog and actions remain visible; no horizontal overflow in page or dialog.
- Colors/tokens: white surfaces, light blue-gray borders, cobalt selected states and muted navy copy. Shared shell retained intentionally.
- Assets: existing brand and Lucide icons retained; no screenshot backgrounds, placeholder logos or fake illustrations. Employee avatars use the existing initials pattern.
- Copy/content: actual selected employee, route, dates, history and counters; message preview uses existing notification builder. Native disclosure markers and native select/date/time controls intentionally retained for accessibility. Day/night schedule information retained rather than hardcoding the single shift from the mockup.

## Functional checks

- Browser: employee search, favorite selection, route points, modal open/close and Escape, changing employee/priority/comment, draft save and reopening with values, automatic transition to drafts, tab keyboard navigation.
- Unit/regression: 64 tests passed across assignmentRequestModal, patrolResultsAssign and ui. New tests cover field callbacks, draft/send separation, pending-state guards, missing permissions, request errors, selected employee removed from favorites, ordered route points and opening a conflicting selection to correct its date.
- TypeScript and production Vite build passed. Existing unrelated large-bundle warning remains.
- Browser console: no error entries in tested local session.
- Production submission/delivery was not executed; no real assignments or notifications were created. Date/time callback behavior verified by unit tests; browser date/time automation did not change the native controls reliably, so no claim of browser date/time editing verification.

Implementation checklist: completed workspace layout; extracted modal and route choice; preserved existing command handlers; verified builds/tests; captured responsive evidence.

final result: passed

---

# Design QA: управление пользователями (previous task)

- Date: 2026-08-03
- Target: утверждённые desktop-макеты прав, участков ЭМУ, аудита и создания пользователя.
- Target viewport: 1920x1080; responsive breakpoints additionally implemented for 1380, 1120 and 820 px.
- Preview: http://192.168.2.194:5173/
- Build: production Vite build passed.
- Runtime: patrol360-web healthy; patrol360-api and patrol360-postgres container IDs unchanged.
- Asset verification: live HTML returns HTTP 200 and references index-CeK47Vs4.css.

## Implemented comparison corrections

- Compact user directory with search, filters, selection and pagination.
- Dense profile header with profile, password and blocking actions.
- Permission presets, filters, expandable module groups, role/personal/deny markers and module totals.
- EMU scope segmented mode, grouped compact selection and ordered assigned-section summary.
- Audit KPI/filter/table layout with localized compatibility empty state.
- Creation/edit modal localized and aligned to the two-column target.
- Removed the duplicate page-level create button for this workspace.
- Added graceful compatibility for an older API without access-catalog, audit and sessions endpoints.

## Visual verification

Final screenshot capture is blocked by the Windows browser-control sandbox:
`windows sandbox failed: helper_unknown_error: apply deny-read ACLs`.

The in-app preview was queued, but an automated same-viewport reference/prototype comparison could not be completed in this run.

## Result

Build and runtime verification: passed.
Automated visual comparison: blocked by browser ACL.
