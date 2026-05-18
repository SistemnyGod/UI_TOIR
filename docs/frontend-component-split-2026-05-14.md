# Frontend Component Split Update - 2026-05-14

## Done

- `EmployeesScreen` is now a composition screen. Employee metrics, directory table and profile drawer live in `apps/web/src/components/employees`.
- `AssignmentScreen` is now a composition screen. Toolbar, employee selection, route selection, active assignments and assignment draft drawer live in `apps/web/src/components/assignments`.
- `SiteUsersScreen` is now a composition screen. User form, users table, roles panel and user profile drawer live in `apps/web/src/components/site-users`.
- `MobileAccountsScreen` is now a composition screen. Create-account drawer and security/analytics panels live in `apps/web/src/components/accounts`.
- `RoutesScreen` now delegates route workspace rendering to `components/routes/RouteWorkspacePanel`, point editing to `components/routes/RoutePointDrawer`, and editor state/CRUD orchestration to `hooks/useRoutesEditor`.
- `DashboardScreen` now delegates metrics, command/readiness block and empty panels to `components/dashboard`, while active patrol selection is handled by `hooks/useSelectedPatrol`.
- `ScheduleScreen` is now a composition screen. Toolbar, planning summary cards, schedule grid, side panels and edit drawer live in `apps/web/src/components/schedule`; derived schedule state lives in `hooks/useSchedulePlanning`.
- Existing behavior was preserved: mock/local data still flows through repositories, screens still receive callbacks from `App`, and temporary actions still use notifications until backend actions exist.

## UI Cleanup Pass

- Removed fake decorative route maps from assignment and routes views. Route data is now shown as lists/tables until a real map/scheme component is implemented.
- Removed non-clickable metric links and decorative round icons from KPI cards.
- Removed empty-state icons so empty panels read as clean operational placeholders.
- Removed decorative account-creation stepper and dashboard kicker badge.
- Flattened gradient-heavy panels in CSS so tabs keep a more restrained admin style.
- Replaced fake generated photo thumbnails in result details with neutral attachment rows until the files API exists.
- Kept functional controls, status chips, tables, filters, drawers and forms intact.
- Request modals now handle dirty-close protection consistently: Escape/backdrop close clean forms, but dirty create forms show an explicit confirmation before data is discarded.

## State Ownership

- Screens should keep only orchestration state that coordinates sibling components.
- Feature components should own local form state when that state does not need to leave the component.
- `MobileAccountsScreen` keeps the employee-name draft because both the account list action and create-account form need the same value.

## Remaining Large Screens

- `DashboardScreen`, `RoutesScreen`, `MobileAccountsScreen` and `ScheduleScreen` are now composition screens.
- Remaining cleanup should focus on moving helper factories into repositories/domain, preparing feature hooks, and adding tests around user flows.
- `styles.css` is still oversized and should be split after the current feature-component pass.

## Next Steps

1. Move route form draft constants/converters from form components into a route form domain module.
2. Add feature hooks above repositories for requests, assignments, schedule and accounts.
3. Prepare API repository stubs for `employees`, `mobileAccounts`, `results`, `schedule` and `users`.
4. Split `styles.css` into feature CSS files or a tokens/base/features structure.
5. Add component tests for create request, create route, edit point, create mobile account, schedule cell selection and assign patrol flows.
