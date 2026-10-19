# Dashboard feature

The live dashboard follows the selected compact patrol overview: calendar week/month,
four metrics, top five issue points, today's plan and three latest patrol reports.

- `dashboardSummary.ts` groups by assignment (legacy employee/route/planned-time fallback),
  deduplicates point recordings, excludes future records and separates patrol counts
  from point counts. Stable point IDs identify history; missing IDs include the route.
- `dashboardResultsLoader.ts` reads every v3 group page for the bounded period before
  publishing a summary. Pagination errors or a changed total preserve the last complete
  snapshot rather than showing a partial ranking. This is not a transactional server snapshot.
- `useDashboardOverview.ts` coalesces refreshes, aborts obsolete requests and hides data
  when the user/source/period changes. Results refresh every minute while visible and on
  focus; the existing application owns request/assignment refresh.
- `DashboardScreen.tsx` wires the existing shared result modal, schedule and quick
  assignment navigation. The plan shows three rows plus the full count of today's open
  requests/assignments. Unassigned staff and current statuses remain visible; a missing
  employee name alone does not make an assigned request unassigned. No media is loaded
  for the summary.
- `dashboardWorkspace.css` is scoped to this tab. Tables reflow into compact rows on
  narrow screens using the same DOM and actions, without horizontal scrolling.

`/dashboard-ui-preview.html` is a development-only visual fixture using the actual view
and shell. Its records are synthetic; report/request callbacks do not mutate the server.
Production builds use `index.html` only. Source mockup and QA evidence are in the root
`artifacts/dashboard-ui-2026-10-02-*` directories; the current report is in `design-qa.md`.
