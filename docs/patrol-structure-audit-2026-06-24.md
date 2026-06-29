# Структурный аудит модуля "Обходы / Patrol 360"

Дата: 2026-06-24  
Область: backend, web, mobile, API, SQLite/outbox, БД, документация и тестовые контуры Patrol 360.  
Режим: source-level аудит текущей dirty working copy без изменения бизнес-логики.

## 1. Краткий вывод

Модуль "Обходы / Patrol 360" уже не находится в состоянии единого неуправляемого монолита: backend `EfPatrolStore` разнесен по partial-файлам, mobile service разнесен по partial-файлам, web частично переехал в `features/patrol`, а мобильное приложение имеет SQLite, outbox, background sync, индексы и lifecycle-статусы `accepted`, `inProgress`, `paused`, `completedLocal`, `needsDispatcherDecision`.

Главная проблема сейчас не в отсутствии модульности вообще, а в незавершенной структуризации и несовпадении границ между backend/web/mobile:

- web Patrol еще держит крупные экраны `AssignmentScreen` и `ResultsScreen`;
- mobile Patrol держит слишком крупный `patrolRepository.ts`;
- есть старые compatibility re-export пути в `apps/web/src/screens` и `apps/web/src/components`;
- lifecycle-статусы расширены, но русские backend-константы в `AssignmentStatusValues.cs` сейчас повреждены mojibake;
- API разложен по ресурсам, но нет единого документа "Patrol API contract map";
- mobile path пока кириллический: `Мобильное приложение`, перенос в `apps/mobile` нужно делать отдельным безопасным этапом.

Стратегия: не переписывать модуль с нуля. Сначала закрыть P0 gate-дефекты и статусную терминологию, затем дробить крупные web/mobile файлы и удалять compatibility-слой только после проверки импортов.

## 2. Карта текущего проекта

| Слой | Фактическое состояние | Ключевые пути |
| --- | --- | --- |
| Web shell | Есть `app/routing`, но еще присутствуют старые `screens/*` и `components/*` re-export/compatibility пути. | `apps/web/src/app/routing/ScreenRouter.tsx`, `apps/web/src/screens/*`, `apps/web/src/components/*` |
| Web Patrol feature | Основные экраны уже в `features/patrol`, часть компонентов разложена по `assignments`, `requests`, `results`, `routes`, `employees`, `schedule`. | `apps/web/src/features/patrol` |
| Web Dashboard | Dashboard выделен отдельно, но относится к Patrol operational loop. | `apps/web/src/features/dashboard` |
| Web Mobile accounts | Мобильные аккаунты вынесены в feature, но функционально связаны с Patrol. | `apps/web/src/features/mobileAccounts` |
| Backend API | Ресурсные контроллеры существуют отдельно: dashboard, assignments, results, routes, employees, mobile accounts, patrol requests, mobile, mobile-sync. | `apps/api/Controllers` |
| Backend contracts | Контракты разделены по доменам, mobile bootstrap/outbox в `MobileAppContracts.cs`. | `libs/contracts/*Contracts.cs` |
| Backend application interfaces | Интерфейсы разделены по query/service границам. | `libs/application/I*.cs` |
| Backend persistence Patrol | `EfPatrolStore` уже разрезан по областям. | `libs/infrastructure/Persistence/Patrol` |
| Backend persistence Mobile | `EfMobileAppService` уже разрезан по auth/bootstrap/outbox/files/helpers. | `libs/infrastructure/Persistence/MobileApp` |
| DB model | Единый `Patrol360DbContext`, конфигурации пока в одном большом файле. | `libs/infrastructure/Persistence/Patrol360DbContext.cs` |
| Mobile app | Отдельный Expo/React Native проект в кириллической папке; есть SQLite, outbox, sync, background task, feature screens. | `Мобильное приложение/src` |
| Tests/docs | Есть audit-документы, structure docs, frontend tests, backend/infrastructure tests. | `docs`, `tests`, `apps/web/src/__tests__` |

## 3. Целевая структура

Целевая модель остается modular monolith. Микросервисы не нужны.

### Web

```text
apps/web/src/
  app/
    routing/
    layout/
    bootstrap/
  shared/
    api/
    ui/
    styles/
    domain/
  features/
    patrol/
      dashboard/
      results/
      assignments/
      requests/
      routes/
      points/
      planned-patrols/
      employees/
      mobile-sync/
      shared/
    mobileAccounts/
    inventory/
    emu/
    perco/
```

Правило: новые Patrol-компоненты не добавлять в `apps/web/src/components`. Старые compatibility файлы удалять только после `rg`-проверки импортов.

### Backend

```text
libs/
  contracts/
    Patrol/
    Mobile/
    Shared/
  application/
    Patrol/
    Mobile/
    Shared/
  infrastructure/Persistence/
    Patrol/
    MobileApp/
    Configurations/
      Patrol/
      Mobile/
```

На ближайшем этапе не плодить новые `.csproj`. Переносить файлы внутри существующих проектов.

### Mobile

Текущий безопасный этап: оставить `Мобильное приложение` как рабочий проект.

Целевой этап после отдельной проверки APK/tooling:

```text
apps/mobile/
  app/
  src/
    api/
    auth/
    core/
    db/
    domain/
      patrol/
      sync/
      files/
    features/
      patrol/
        requests/
        request-detail/
        active-patrol/
        points/
        scan/
        attachments/
        submit/
      syncQueue/
      patrolHome/
    services/
    sync/
    ui/
```

## 4. Подмодули Patrol

| Подмодуль | Назначение | Текущее размещение | Что привести в порядок |
| --- | --- | --- | --- |
| Dashboard | Сводка смены, активные обходы, готовность, проблемные точки. | `features/dashboard`, `IPatrolDashboardQuery`, `EfPatrolStore.Dashboard.cs` | Зафиксировать как Patrol dashboard или оставить отдельной feature с явной связью в docs. |
| Results | Журнал и детальный просмотр результатов обходов, фото/видео, статусы меток. | `features/patrol/ResultsScreen.tsx`, `components/results/*`, `ResultsController`, `EfPatrolResultQuery`, `EfPatrolStore.Results.cs` | Разрезать `ResultsScreen`, вынести media viewer, point table, summary, side panel. |
| Assignments | Назначение сотрудников на маршруты, активные назначения, отмена/старт/завершение. | `features/patrol/AssignmentScreen.tsx`, `components/assignments/*`, `AssignmentsController`, `EfPatrolStore.Assignments.cs` | Разрезать `AssignmentScreen`; унифицировать отображение статусов и списков активных назначений. |
| Planned patrols | Плановые обходы по датам/сменам. | `features/patrol/ScheduleScreen.tsx`, `components/schedule/*` | Отделить calendar/grid/edit-panel от assignment runtime. |
| Routes | Каталог маршрутов и точек NFC/QR. | `features/patrol/RoutesScreen.tsx`, `components/routes/*`, `RoutesController`, `EfPatrolStore.Routes.cs` | Держать как отдельный route catalog bounded context. |
| Points | Точки маршрутов, порядок, NFC/QR, обязательность. | `RoutePointEntity`, `RoutePointTable`, mobile `assignment_route_points` | Вынести общие правила статусов точки в shared domain. |
| Mobile accounts | Логины, привязки сотрудников, сессии, аудит, push. | `features/mobileAccounts`, `MobileAccountsController`, `EfPatrolStore.MobileAccounts.cs` | Функционально оставить рядом с Patrol, но не смешивать UI с routes/results. |
| Issues | Неисправности, недоступные метки, ручное заполнение, заявки по результатам. | `PatrolResultIssueEntity`, `PatrolResultIssues`, result UI | Нужен явный словарь issue/status labels для web/mobile/report. |
| Offline & Sync | SQLite, outbox, conflict/retry/background, mobile sync admin. | mobile `src/sync`, `src/db/repositories`, `EfMobileAppService.Outbox.Patrol.cs`, `MobileSyncController` | Держать отдельно от UI. Зафиксировать lifecycle и failure modes в docs. |
| Reports & History | История обходов, экспорт, просмотр вложений. | `ResultsController`, `EfPatrolResultQuery`, web results | Разделить operational results и отчетные export/view сценарии. |

## 5. Сущности и связи

Подтвержденные сущности/таблицы:

- `RouteEntity` / `routes`
- `RoutePointEntity` / `route_points`
- `EmployeeEntity` / `employees`
- `PatrolRequestEntity` / `patrol_requests`
- `AssignmentEntity` / `assignments`
- `PatrolResultEntity` / `patrol_results`
- `PatrolResultIssueEntity` / `patrol_result_issues`
- `PatrolResultAttachmentEntity` / `patrol_result_attachments`
- `MobileAccountEntity` / `mobile_accounts`
- `MobileAccountEmployeeBindingEntity` / `mobile_account_employee_bindings`
- `MobileAccountSessionEntity` / `mobile_account_sessions`
- `MobileAccountAuditEventEntity` / `mobile_account_audit_events`
- `MobileNotificationEntity` / `mobile_notifications`
- `MobileOutboxOperationEntity` / `mobile_outbox_operations`
- `MobileUploadedFileEntity` / `mobile_uploaded_files`
- `MobileSyncConflictResolutionEntity` / `mobile_sync_conflict_resolutions`

Связи, подтвержденные кодом:

- Route -> RoutePoint: один маршрут содержит много точек.
- PatrolRequest -> Assignment: заявка может иметь связанное назначение.
- Assignment -> Route/Employee/PatrolRequest: назначение связывает сотрудника, маршрут и заявку.
- Assignment -> PatrolResult: результат уникален по assignment.
- PatrolResult -> Issues/Attachments: результат хранит проблемы и вложения.
- MobileAccount -> EmployeeBinding -> Employee: мобильный аккаунт привязан к сотруднику.
- MobileAccount -> Session/Audit/Notification/Outbox/File: мобильный контур имеет отдельные сессии, аудит, уведомления, outbox и файлы.

Нужно проверить вручную на данных:

- нет ли старых записей назначений, которые после новых lifecycle-статусов остаются "активными" в dashboard;
- как web отображает `NeedsDispatcherDecision` и `Paused` в разных списках;
- совпадает ли бизнес-ожидание по отмененным offline-обходам с текущим backend поведением.

## 6. Статусы и переходы

### Backend

В `libs/infrastructure/Persistence/AssignmentStatusValues.cs` есть статусы:

- Assigned
- Waiting
- Accepted
- InProgress
- Paused
- Completed
- Cancelled
- NeedsDispatcherDecision

Проблема P0: значения сейчас повреждены mojibake. Это влияет на читаемость, фильтры, badges и потенциально на сравнение строк. Нужно восстановить UTF-8 значения отдельным mechanical pass.

### Mobile

В `Мобильное приложение/src/domain/patrol/patrolTypes.ts` подтверждены статусы:

- request: `available`, `assigned`, `accepted`, `inProgress`, `paused`, `completed`, `completedServer`, `cancelled`, `cancelledServer`, `completedLocal`, `syncing`, `syncError`, `authRequired`, `needsDispatcherDecision`;
- assignment: `accepted`, `inProgress`, `paused`, `completedLocal`, `syncing`, `completedServer`, `conflict`, `cancelledServer`, `syncError`, `authRequired`, `needsDispatcherDecision`;
- point result: `pending`, `scanned`, `ok`, `issue`, `deferred`, `skipped`.

### Команды outbox

Подтверждены команды:

- `takePatrolRequest` legacy: принять и сразу начать.
- `acceptPatrolRequest`
- `releasePatrolRequest`
- `startPatrolAssignment`
- `pausePatrolAssignment`
- `resumePatrolAssignment`
- `handoffPatrolAssignment`
- `completePatrolAssignment`
- NFC/QR/mark point commands внутри patrol outbox.

Целевой lifecycle:

```text
available/assigned
  -> accepted
  -> inProgress
  -> paused
  -> inProgress
  -> completedLocal
  -> syncing
  -> completedServer

accepted
  -> release -> assigned/available

inProgress/paused/completedLocal + server cancellation/conflict
  -> cancelledServer or needsDispatcherDecision, depending on current business rule
```

Уточненное бизнес-решение пользователя: если offline-обход полностью пройден, затем пришла отмена, заявка не должна висеть вечным конфликтом у сотрудника. Результат должен быть доставлен на сервер или зафиксирован сервером как отмененный/неполный в истории, а мобильная активная задача должна перейти в терминальное состояние и исчезнуть из активной работы.

## 7. API-структура

Подтвержденные API-контроллеры:

| API | Контроллер | Назначение |
| --- | --- | --- |
| `/api/v1/dashboard`, `/api/v1/dashboards` | `DashboardController` | Patrol summary и активные назначения. |
| `/api/v1/assignments` | `AssignmentsController` | Назначения. |
| `/api/v1/results` | `ResultsController` | Результаты обходов. |
| `/api/v1/routes` | `RoutesController` | Маршруты и точки. |
| `/api/v1/employees` | `EmployeesController` | Сотрудники. |
| `/api/v1/patrol-requests` | `PatrolRequestsController` | Заявки на обход. |
| `/api/v1/mobile-accounts` | `MobileAccountsController` | Мобильные аккаунты. |
| `/api/v1/mobile` | `MobileController` | Mobile auth/bootstrap/outbox/files. |
| `/api/v1/mobile-sync` | `MobileSyncController` | Конфликты и решения синхронизации. |

Что нужно сделать:

- описать API map в `docs/patrol-api-contract.md`;
- зафиксировать compatibility: старый `takePatrolRequest` остается для старых APK;
- добавить contract tests для lifecycle outbox-команд;
- отделить "операционные API" от "отчетных API" в документации, не меняя routes.

## 8. Frontend-структура

Что уже хорошо:

- `features/patrol` существует;
- route/results/request/assignment/schedule компоненты уже частично разложены;
- `features/mobileAccounts` и `features/dashboard` вынесены отдельно;
- есть `app/routing`.

Крупные остатки:

| Файл | Размер | Риск |
| --- | ---: | --- |
| `apps/web/src/features/patrol/AssignmentScreen.tsx` | ~87 KB | Смешивает сотрудников, маршруты, создание заявки, историю, активные назначения и модалки. |
| `apps/web/src/features/patrol/ResultsScreen.tsx` | ~51 KB | Смешивает журнал, детальный просмотр, KPI, фильтры, media viewer и side panel. |
| `apps/web/src/features/mobileAccounts/components/MobileAccountCreateDrawer.tsx` | ~40 KB | Слишком крупная форма/мастер, связана с Patrol access. |
| `apps/web/src/features/dashboard/DashboardScreen.tsx` | ~30 KB | Сводка и панели могут быть дальше разнесены. |
| `apps/web/src/features/patrol/components/results/ResultsJournalPanel.tsx` | ~22 KB | Кандидат на дробление таблицы, фильтров, row rendering. |

Целевой порядок:

1. `AssignmentScreen` -> `assignments/AssignmentWorkspace`, `EmployeePickerPanel`, `RoutePickerPanel`, `ActiveAssignments`, `AssignmentHistory`, `RequestCreateModal`.
2. `ResultsScreen` -> `results/ResultsWorkspace`, `ResultsKpiStrip`, `PointResultTable`, `PatrolResultDetails`, `ResultMediaViewer`.
3. Удалить старые re-export из `screens`/`components` после `rg`-проверки.
4. Вынести повторяемые UI primitives в `shared/ui`: `ModalShell`, `ActionMenu`, `CompactTable`, `KpiStrip`, `PaginationBar`, `InspectorPanel`.

## 9. Backend-структура

Что уже хорошо:

- `EfPatrolStore` разрезан на:
  - `Assignments`
  - `Common`
  - `Dashboard`
  - `Employees`
  - `MobileAccounts`
  - `Requests`
  - `Results`
  - `Routes`
- `EfMobileAppService` разрезан на:
  - `Auth`
  - `Bootstrap`
  - `Files`
  - `Helpers`
  - `Outbox.Emu`
  - `Outbox.Patrol`
  - `Types`

Крупные остатки:

| Файл | Размер | Риск |
| --- | ---: | --- |
| `EfMobileAppService.Outbox.Patrol.cs` | ~37 KB | Содержит весь lifecycle/outbox Patrol. |
| `EfPatrolStore.MobileAccounts.cs` | ~29 KB | Много сценариев аккаунтов/сессий/аудита в одном файле. |
| `EfPatrolStore.Assignments.cs` | ~23 KB | Lifecycle назначений, настройки, история. |
| `EfMobileAppService.Helpers.cs` | ~16 KB | Общие helpers могут стать неявной свалкой. |

Следующие безопасные backend refactor passes:

1. `EfMobileAppService.Outbox.Patrol.cs` разделить на:
   - `Outbox.Patrol.RequestLifecycle.cs`
   - `Outbox.Patrol.PointResults.cs`
   - `Outbox.Patrol.Completion.cs`
   - `Outbox.Patrol.Validation.cs`
2. `EfPatrolStore.MobileAccounts.cs` разделить на:
   - `Queries`
   - `Lifecycle`
   - `Bindings`
   - `Sessions`
   - `Audit`
3. `Patrol360DbContext` mappings вынести в `Persistence/Configurations/Patrol` и `Persistence/Configurations/Mobile`.

## 10. Mobile-структура

Что уже хорошо:

- есть `api`, `auth`, `core`, `db`, `domain`, `features`, `services`, `sync`, `ui`;
- есть `SyncQueueScreen`;
- есть `backgroundSyncTask`;
- есть SQLite indexes для hot tables:
  - `patrol_request_board(owner_user_id, status, planned_start_at)`;
  - `patrol_assignments(owner_user_id, status, request_id)`;
  - `assignment_route_points(assignment_id, order_index)`;
  - `point_results(assignment_id, point_id)`;
  - `outbox_commands(status, created_at_local)`;
  - `outbox_commands(status, updated_at_local)`;
  - `files(status, assignment_id, point_id)`.

Крупные остатки:

| Файл | Размер | Риск |
| --- | ---: | --- |
| `Мобильное приложение/src/db/repositories/patrolRepository.ts` | ~47 KB | Смешивает request board, assignments, point results, submit, outbox, files. |
| `PointFillScreen.tsx` | ~20 KB | Смешивает статус точки, вложения, skipped/manual UX, навигацию. |
| `outboxRepository.ts` | ~19 KB | Много retry/reconciliation/status logic. |
| `database.ts` | ~18 KB | DDL/migrations/indexes в одном файле. |
| `bootstrapRepository.ts` | ~17 KB | Refresh/merge/preserve важные локальные состояния. |

Целевой порядок:

1. `patrolRepository.ts` разделить на:
   - `requestBoardRepository`
   - `assignmentLifecycleRepository`
   - `pointResultRepository`
   - `submitReportRepository`
   - `patrolOutboxRepository`
2. `PointFillScreen` разделить на:
   - `PointStatusSelector`
   - `UnavailableTagAction`
   - `AttachmentGallery`
   - `PointCommentBox`
3. `Screen` примитив оставить для простых экранов, а длинные списки переводить на `FlatList`/виртуализацию.
4. Mobile path `Мобильное приложение` переносить в `apps/mobile` только после отдельной проверки Android/APK update.

## 11. Database

Подтвержденные индексы backend:

- routes: name, archived;
- route_points: route/sequence, route/nfc;
- employees: personnel no, status, department, group;
- patrol_requests: number, status, scheduled date, source result;
- patrol_results: unique assignment, status, route, employee, actual date;
- assignments: employee/status, route, planned date;
- mobile sessions: account/last seen, token hash, refresh token hash;
- mobile notifications: account/date, idempotency, read/push;
- mobile outbox: account/date, status;
- mobile files: account/client file id, assignment/point, remark.

Что улучшить:

- вынести EF mappings из `Patrol360DbContext.cs` в `IEntityTypeConfiguration<>`;
- добавить smoke DB tests для новых status transitions;
- проверить production данные на "активные, но фактически завершенные" назначения.

## 12. Оптимизация

Уже сделано/подтверждено:

- backend Patrol store разрезан;
- mobile bootstrap/outbox имеет retry/reconciliation;
- mobile SQLite имеет индексы по hot tables;
- mobile outbox команды используют `clientOperationId`.

Следующие оптимизации:

- не грузить весь журнал результатов, если нужен постраничный список;
- проверить dashboard counts на SQL round-trips;
- web results media viewer должен открываться поверх текущей result modal, а не за ней;
- mobile lists `RequestBoardScreen`, `AllPointsScreen`, `SyncQueueScreen` держать на virtualized list при росте данных.

## 13. Документация

Существующие связанные документы:

- `docs/mobile-patrol-scenario-stabilization-plan.md`
- `docs/mobile-app-technical-requirements.md`
- `docs/security-api-audit-2026-06-23.md`
- `docs/code-quality-audit-2026-06-22.md`
- `docs/architecture-technical-decisions-audit-2026-06-22.md`
- `docs/refactor-structure-plan.md`
- `docs/structure-remaining-work.md`

Не хватает:

- `docs/patrol-api-contract.md`
- `docs/patrol-status-lifecycle.md`
- `docs/mobile-offline-recovery.md`
- `docs/patrol-web-structure.md`
- `docs/patrol-db-model.md`

## 14. Tests

Нужно держать четыре уровня:

1. Backend unit/API:
   - lifecycle assignment;
   - route point NFC uniqueness;
   - result completion;
   - skipped/manual point results;
   - duplicate `clientOperationId`.
2. DB integration:
   - mobile login/bootstrap/outbox;
   - complete report duplicate/reconciliation;
   - cancelled assignment handling;
   - file upload before report completion.
3. Frontend unit:
   - result point status rendering;
   - assignment status badges;
   - request modal defaults;
   - active assignments scroll/status visibility.
4. Mobile:
   - typecheck/lint;
   - offline submit/retry;
   - accept/release/start/pause/resume;
   - 401 authRequired with outbox preservation;
   - APK update over old version.

## 15. План работ

### P0: стабилизация статусов и gate

1. Восстановить UTF-8 строки в `AssignmentStatusValues.cs`.
2. Проверить все места сравнения русских статусов в backend/web.
3. Прогнать `Verify-TextEncoding.ps1`, `dotnet build`, `dotnet test`.
4. Зафиксировать lifecycle в `docs/patrol-status-lifecycle.md`.

### P1: web Patrol structure

1. Разрезать `AssignmentScreen.tsx`.
2. Разрезать `ResultsScreen.tsx`.
3. Вынести result media viewer в отдельный компонент с правильным z-index/modal layer.
4. Удалить старые `screens`/`components` compatibility re-exports после проверки импортов.

### P1: mobile structure

1. Разрезать `patrolRepository.ts`.
2. Разрезать `PointFillScreen.tsx`.
3. Уточнить терминальное состояние для "offline completed, then server cancelled".
4. Проверить APK update поверх старой версии.

### P2: backend structure

1. Разрезать `EfMobileAppService.Outbox.Patrol.cs`.
2. Разрезать `EfPatrolStore.MobileAccounts.cs`.
3. Вынести EF configurations по Patrol/Mobile.
4. Добавить contract drift checks для mobile/web.

### P2: docs/tests

1. Описать API map.
2. Описать DB model map.
3. Добавить тесты lifecycle/status/media.
4. Добавить browser smoke checklist для `/#assign`, `/#results`, `/#routes`, `/#mobile-accounts`, `/#dashboard`.

## 16. Top 10 первоочередных задач

1. Исправить mojibake в `AssignmentStatusValues.cs`.
2. Сверить отображение `Accepted`, `Paused`, `NeedsDispatcherDecision` в web assignment/dashboard/mobile.
3. Разрезать `AssignmentScreen.tsx`.
4. Разрезать `ResultsScreen.tsx` и вынести media viewer.
5. Исправить результатную модалку: фото/видео открывать поверх нее и возвращаться без повторного открытия отчета.
6. Разрезать mobile `patrolRepository.ts`.
7. Зафиксировать offline-cancel terminal behavior для полностью пройденной offline заявки.
8. Добавить `docs/patrol-status-lifecycle.md`.
9. Добавить DB integration tests для новых mobile outbox lifecycle-команд.
10. Удалить web compatibility re-export файлы после `rg`-проверки импортов.

## Подтверждено кодом

- Backend API-контроллеры Patrol существуют и разделены по ресурсам.
- `EfPatrolStore` и `EfMobileAppService` уже разнесены на partial-файлы.
- Mobile outbox lifecycle-команды добавлены в backend и mobile.
- Mobile SQLite имеет индексы для основных hot queries.
- `DisplayNumber` уже есть в mobile contract как nullable поле.
- `skipped` есть как технический статус точки.

## Подтверждено командами в этом проходе

- Проведена инвентаризация файлов через `rg --files`, `rg -n`, `Get-ChildItem`.
- Проверены размеры крупных web/mobile/backend файлов.
- Проверены API routes и основные contracts/status definitions.

## Нужно проверить вручную/на runtime

- Browser QA после исправления assignment statuses.
- Поведение старого APK с legacy `takePatrolRequest`.
- Полный offline сценарий: отчет отправлен, сервер принял, телефон не получил ответ.
- Полный сценарий: offline отчет готов, затем сервер отменил заявку.
- Video/photo preview в web result modal.
- Production данные на зависшие активные назначения.
