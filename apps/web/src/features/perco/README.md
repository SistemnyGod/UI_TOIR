# PERCo feature

PERCo synchronization, matching, logs, settings and presence diagnostics.

- `PercoIntegrationScreen.tsx` owns permissions, API actions and editable forms. The
  workspace resets on owner/permission changes; stale responses don't notify a new owner.
  Settings input and explicit matching choices survive read refreshes. Diagnostics reads
  are coalesced; polling does not blank the lists.
- `PercoOverview.tsx` provides the compact operational summary, current presence, review
  queue and latest events. Manual actions require the corresponding permission.
- `PercoTabs.tsx` renders connection, synchronization, matching, diagnostics and logs.
  The screen retains API ownership, editable state and mutation handlers; tabs receive
  those values and callbacks without creating another repository or polling loop.
- `PercoAnalytics.tsx` is the shared, collapsible analytics view for overview/diagnostics.
- `percoScreenSupport.tsx` contains presentation/aggregation helpers, pagination and
  dialogs using the shared portal/focus handling. Pagination resets on filter changes,
  preserves the page during refresh and clamps pages when rows disappear.
- `perco.css` keeps existing widgets; `percoWorkspace.css` owns the current layout and
  typography. Obsolete dashboard polish has been removed from the former stylesheet.

`e2e/fixtures/perco.ts` contains synthetic frontend fixtures, never production data.
API endpoints and payload contracts remain the existing PERCo integration contracts.
