# EMU feature

Target slice for work accounting, dashboard, history, dictionaries, reports, hooks, and EMU styles.

## History and browser reminders

`history/useHistoryReadScope.ts` separates history/page, section and employee-report reads. Replaced or closed views ignore earlier results, errors and finalizers. `EmuCompletedWorkHistoryScreen` keys the workspace by owner, permissions and data source. Refresh retains the applied query and any still-present selected row; the refresh button remains focusable while its read is pending. Employee and month failures are explicit rather than substituted with zero statistics.

`history/employeeReportDialog.css` and `dashboardDrilldown.css` own the report/drilldown layouts. The modal body is the main scroll area. Dashboard details stack below 800 px and keep two KPI columns on phones.

`ShiftReportReminder` renders the reminder preferences; `useShiftReportReminder` owns permission lifetimes and scheduling; `shiftReportReminderModel` owns validation, existing browser-wide keys and storage failures. Scheduling uses successfully saved settings, while failed edits remain protected in the form. Dismissed/sent day markers have an in-memory fallback for the current SPA session. This is a browser reminder while the entry form is mounted, not native mobile push or a server scheduler. Closing the settings invalidates the permission callback without preventing the user from answering the browser's own prompt.

## Work accounting

`EmuWorkAccountingScreen.tsx` owns the board filters, selection and dialog routing. `work-accounting/board` renders the cards, status filters and keyboard command menu; `side` owns employee workload and inspectors. Workload is calculated across all authorized sections, independently of the board's section filter.

`work-accounting/workAccountingWorkspace.css` is scoped to the accounting workspace and its dialogs. `ModalFrame` keeps scrolling in the body and action buttons in the footer. Mutation dialogs use `useWorkMutation` and `WorkFormActions` to keep failures visible, block repeated submission, capture the opened version and ignore callbacks after unmount. Creation drafts use an owner-specific storage key and are cleared synchronously after a successful save.

`WorkDetailsModal` separates employees, attachments and history. `WorkHistoryPanel` loads the existing audit endpoint on demand in pages of 50, with retry and cancellation guards; the audit tab requires `emu.audit.view`. Employee pickers paginate the full selection and keep selected employees visible through searches. Routing remounts the EMU workspace when the signed-in owner or data source changes.

`WorkEmployeeActions` shares participant commands between the viewer and sidebar and hides actions for finished or mistakenly added people. Viewer actions return to the same document after cancellation or a successful mutation. The screen retains `EmployeeWorkloadView` across sidebar inspector mounts, so search, availability filters and page do not reset when returning to the employee list. Adding an employee offers favorites first and searches the full directory; the chosen name remains visible even when it does not match the current query.

Pure list construction lives in `domain/emuEmployeeOptions.ts` and `domain/emuLists.ts`. The employee builder merges scoped active favorites missing from the general directory while preserving directory rows when IDs match. UI selection and local work mutations use the same source, so adding a favorite preserves its name in the resulting snapshot. `createWorkOptions.ts` retains its existing export for compatibility.

`useEmuWorkspace` coordinates API reads and commands; the existing demonstration state, calculations and local commands live in `domain/emuLocalWorkspace.ts`. The API board requests `boardOnly=true`: active work of any age plus work completed since the start of the business day in Asia/Yekaterinburg. Historical reports retain their separate server pagination. Initial list responses provide `serverTime`, captured before reading, so delta cursors do not depend on the browser clock. Overlapping refreshes share a promise, full reloads invalidate old deltas, owner changes clear previous data, and merges cannot replace a newer row version with an older one. After mutations the board reload remains bounded to board data.

## Shift reports

`shift-reports/EmuShiftReportsScreen.tsx` selects the entry or history screen and checks permissions.
Entry state and draft persistence live in `components/ShiftReportEntryScreen.tsx`; the form and work rows are separate components.
History filtering, report groups and expanded details stay in the history components. API access lives in `hooks/useEmuShiftReportsWorkspace.ts`.

`shift-report-workspace.css` owns the entry and history layout, scoped to `.emu-report-workspace`.
`shift-reports.css` retains the calendar, employee picker/directory, reminders and feature dialog styles.
Use feature selectors when changing report layout: shared table cell heights and other EMU panel styles must not constrain multiline editors or report details.
