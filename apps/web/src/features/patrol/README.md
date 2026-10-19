# Patrol feature

Target slice for routes, assignments, service requests, patrol results, schedules, employees, and patrol data adapters.

`AssignmentScreen.tsx` owns selection, API commands and dialog routing. `assignments/AssignmentPanels.tsx` renders employee/route selection, history, active assignments and shift settings; shared status/date helpers remain feature-local. Existing compatibility exports from the screen are retained.

`RequestCreateModal` waits for creation, prevents repeated submission and closing while pending, retains input and displays API errors. Date and time are required. An unchanged retry reuses `clientRequestId`; a background refresh failure after a successful POST does not turn the creation into a failed operation.

Scoped legacy styles in `assignments/scoped-legacy.css` and `results/scoped-legacy.css` load with their owning screens. Shared selectors remain global. Preserve the order of CSS imports when organizing TypeScript imports: alphabetic ordering can change the cascade.

Local assignment drafts are split into `assignmentDrafts` (storage/model), `AssignmentDraftsCard` (search/pages), preview and recovery components. Recovery of the old ownerless key requires an explicit admin action and manual current employee/route choices; it creates a new owned local copy and preserves the original raw record. The local storage comparison detects already changed records but is not an atomic cross-tab database transaction.

Employee help receives `canManageAccounts` independently of employee editing and assignment permissions. Only `mobile_accounts.write` exposes navigation to account management. Deactivation uses the shared modal pending policy; selection and session changes remount the relevant employee workspace.
