# Frontend architecture

## Baseline

Frontend is a React + TypeScript + Vite application in `apps/web`. The UI is still a backend-free prototype, but screens are prepared for a typed data layer through `apps/web/src/api` and domain helpers through `apps/web/src/domain`.

## Current boundaries

- `screens/*` compose full tabs and own screen-level state only.
- `components/*` contain reusable shell, modal, dashboard, employee and UI primitives.
- `domain/*` contains UI-safe business helpers that do not render React. Example: active patrol checkpoint sorting and service request draft creation.
- `hooks/usePatrolWorkspaceData.ts` owns the temporary local workspace state for routes, requests, active patrols and dashboard metrics.
- `api/*` contains typed DTO contracts and the mock/API data source switch.
- `types.ts` contains shared UI contracts until backend OpenAPI generation is connected.

## Local data model before backend

The prototype now uses localStorage-backed state for frontend workflows that must behave like real product flows before the backend is ready:

- `patrol360.routes.v1` stores local routes and route points.
- `patrol360.patrolRequests` stores patrol assignment requests.
- `patrol360.activePatrols.v1` stores active patrols created from requests.
- `patrol360.mobileAccounts.v2` stores mobile login account drafts.

This is intentionally temporary. The UI screens should not depend on localStorage directly. Local workspace state is owned by `hooks/usePatrolWorkspaceData.ts`, validated by domain helpers, and passed into feature screens through `App.tsx` and `ScreenRouter`.

## Workspace state hook

`usePatrolWorkspaceData` is the frontend boundary between the application shell and temporary data behavior:

- reads and validates localStorage-backed routes, requests and active patrols;
- merges local active patrol drafts with API active patrols when the data source is switched to API;
- builds dashboard metrics from local state when API metrics are not available;
- owns route CRUD, point CRUD and point ordering;
- owns request creation and creation of the matching active patrol draft.

`App.tsx` should stay mostly as a composition layer: navigation, global filters, modals, topbar actions and screen routing. New domain workflows should first go into `domain/*`, then be exposed through a hook or a feature component rather than added directly into `App.tsx`.

## Routes and points decision

Routes are editable in the frontend without backend:

- create, edit and delete route;
- create, edit and delete route point;
- move route points up and down;
- persist the route directory in localStorage;
- allow the same NFC/tag value to be reused across different routes.

The rule about duplicate NFC tags is explicit: frontend does not enforce global uniqueness for point tags. A future backend validation can warn about duplicates, but it must not block cross-route reuse.

Implementation boundaries:

- `screens/RoutesScreen.tsx` owns screen composition and selected route/point flow.
- `components/routes/RouteDirectoryPanel.tsx` owns route list search, empty state and archive entry point.
- `components/routes/RoutePointTable.tsx` owns route point table rendering, row selection and order controls.
- `components/routes/RouteEditorForm.tsx` owns route form rendering.
- `components/routes/PointEditorForm.tsx` owns route point form rendering.
- `domain/routes.ts` owns route draft creation, point draft creation, validation and point reordering.

## Patrol request decision

The create request modal is the first real assignment flow:

- date defaults to the current local date;
- employee is selected or typed manually;
- route is selected or typed manually;
- scheduled time is optional;
- notification text is generated and can be edited;
- after submit, a request is created and an active patrol draft is created from that request.

The active patrol draft is generated in `domain/activeAssignments.ts`. It copies route points into checkpoint placeholders so the dashboard detail drawer can immediately show route progress structure.

Request modals own their own interaction safety:

- create forms track dirty state after the first user edit;
- Escape and backdrop clicks close clean modals immediately;
- Escape and backdrop clicks on a dirty create form show a confirmation dialog first;
- closing without saving is explicit, while returning to the form keeps entered values;
- modal focus returns to the previously focused element after close.

## Dashboard decision

Active patrol rows intentionally show only:

- employee;
- route name;
- route progress bar.

Clicking a row selects the patrol and opens details in the right drawer. The detail drawer is prepared for:

- actual start time;
- total spent time;
- checkpoint activation/scanning time;
- checkpoint status: `Исправно`, `Неисправно`, `Ожидает`, `Пропущено`;
- employee comments;
- photo/video attachments;
- real order sorting by first actual checkpoint scan time, not static route order.

The sorting logic lives in `apps/web/src/domain/activePatrolDetails.ts`.

## Mobile account decision

Employees and mobile phone accounts are separate concepts:

- employee is a personnel directory entry;
- mobile account is a login credential for the mobile app;
- mobile account can later be bound to one employee, multiple allowed employees, or all employees depending on backend rules.

The Employees tab now includes this workflow, while detailed account operations remain in the Mobile Accounts tab.

Current frontend model:

- `employeeScope: "selected"` means the phone account is bound to one or more named employees.
- `employeeScope: "all"` means the phone account is a shared mobile login for all allowed employees.
- `boundEmployees` keeps the selected employee list for future backend/API binding.
- The legacy `employee` field remains as a display label until generated API DTOs replace the temporary UI type.

Implementation boundaries:

- `screens/MobileAccountsScreen.tsx` owns create-account form state and screen composition.
- `components/accounts/MobileAccountMetrics.tsx` owns the summary counters for account/session status.
- `components/accounts/MobileAccountListPanel.tsx` owns tabs, filters, account table, session cards and binding cards.
- `components/accounts/MobileAccountAccessScope.tsx` owns the selected/all-employees access selector used by create flows.

## Planned patrol decision

The planned patrol tab is intentionally split into visual and workflow blocks before backend scheduling rules are implemented:

- `screens/ScheduleScreen.tsx` composes the tab and owns only selected cell orchestration;
- `components/schedule/ScheduleToolbar.tsx` owns week/month/exceptions mode controls and draft actions;
- `components/schedule/PlanningSummaryCards.tsx` owns compact day/night/exception/coverage summaries;
- `components/schedule/ScheduleGridPanel.tsx` owns the weekly grid, empty states and cell selection;
- `components/schedule/ScheduleSidePanels.tsx` owns exception, correction, conflict and coverage panels;
- `components/schedule/ScheduleEditPanel.tsx` owns the selected-cell edit drawer shell.
- `hooks/useSchedulePlanning.ts` owns temporary derived state for selected cell, planned count and exception count.

Current schedule data is still empty by design. The grid is ready for real or mock schedule entries, and selected cells are routed back to `App.tsx` through `ScreenRouter`.

## Next frontend steps

1. Add feature hooks above repositories for requests, assignments, schedule and account workflows.
2. Replace remaining static arrays with typed mock repositories that match future API contracts.
3. Split `styles.css` into base tokens, shared components and feature styles.
4. Generate frontend DTOs from OpenAPI once the backend contract is stable.
5. Add lightweight component tests for domain helpers and modal submit flows.

## Repository layer update

Дата: 14.05.2026

Начат перенос frontend к целевой схеме из UI-ТЗ:

```text
screen -> feature hook -> repository -> api client
                         -> browser storage
                         -> mock data
```

Сделано:

- `apps/web/src/api/client.ts` - единый HTTP client с поддержкой `problem+json` ошибок;
- `apps/web/src/api/dataSource.ts` - правила переключения `mock/api`;
- `apps/web/src/repositories/patrolDataRepository.ts` - первый repository для dashboard/routes snapshot;
- `apps/web/src/repositories/browserStorageRepository.ts` - чтение/запись `localStorage` вынесены из React hook;
- `apps/web/src/repositories/routesRepository.ts` - локальные операции CRUD маршрутов и точек;
- `apps/web/src/repositories/patrolRequestsRepository.ts` - локальное создание заявок на обход;
- `apps/web/src/repositories/activePatrolsRepository.ts` - локальное создание активного обхода из заявки;
- `apps/web/src/repositories/employeesRepository.ts` - источник и метрики сотрудников;
- `apps/web/src/repositories/resultsRepository.ts` - источник, фильтрация и метрики результатов;
- `apps/web/src/repositories/mobileAccountsRepository.ts` - источник и локальные действия мобильных аккаунтов;
- `apps/web/src/repositories/siteUsersRepository.ts` - источник пользователей сайта и роли;
- `apps/web/src/repositories/scheduleRepository.ts` - источник расписания;
- `apps/web/src/repositories/navigationRepository.ts` - реестр экранов;
- `usePatrolDataSource` теперь зависит от repository, а не напрямую от API/mock client;
- `usePatrolWorkspaceData` теперь использует repositories для маршрутов, заявок и активных обходов;
- `RequestModals` разнесен на feature-компоненты в `components/requests`.
- `DashboardScreen` частично разнесен на feature-панели в `components/dashboard`.
- `ResultsScreen` частично разнесен на journal/detail компоненты в `components/results`.
- `DashboardScreen`, `ResultsScreen`, `EmployeesScreen`, `MobileAccountsScreen`, `SiteUsersScreen`, `RoutesScreen`, `AssignmentScreen`, `ScheduleScreen`, `App` и `useHashScreen` больше не импортируют `data.ts` напрямую. Seed/mock данные теперь проходят через repositories.

Следующий шаг:

1. Перевести `EmployeesScreen`, `AssignmentScreen`, `ScheduleScreen`, `MobileAccountsScreen`, `SiteUsersScreen` на feature-компоненты.
2. Добавить feature hooks поверх repositories.
3. Подготовить API repository-заглушки для `employees`, `mobileAccounts`, `results`, `schedule`, `users`.
