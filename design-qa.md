# Design QA: управление пользователями

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
