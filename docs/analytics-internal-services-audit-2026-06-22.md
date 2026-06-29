# Аудит аналитических инструментов и внутренних сервисов Patrol360

Дата: 2026-06-22  
Объект проверки: текущая рабочая копия `C:\Users\AI_server\Desktop\Proekt obhod`  
Формат: source-level аудит аналитики, отчетов, dashboard, export/import, worker jobs и внутренних application/infrastructure сервисов.

## 1. Краткий вывод

В Patrol360 уже есть несколько рабочих аналитических контуров:

- dashboard обходов;
- журнал и детальный просмотр результатов обходов;
- EMU dashboard, история выполненных работ, отчет по сотруднику, сменные и месячные сводки;
- Inventory overview, СИЗ KPI, отчеты, история, системный журнал, импорт legacy-данных;
- PERCo diagnostics/logs/sync status;
- system notifications;
- mobile sync diagnostics и очередь push-уведомлений.

Сильная сторона проекта: аналитика в основном строится на серверных DTO и application interfaces, а не только на клиентских подсчетах. Особенно это видно в EMU history report и Inventory PPE `summary/filteredSummary`.

Главные риски: нет отдельного аналитического/read-model слоя, часть отчетов и экспортов строится синхронно в памяти, DB integration tests пропущены, SQL-производительность не измерена, а крупные EF-сервисы совмещают write logic, read models, reports, audit и integration workflows.

## 2. Проверки

Подтверждено командами:

- `dotnet test tests\Patrol360.Api.Tests\Patrol360.Api.Tests.csproj --no-build` - 41 passed.
- `dotnet test tests\Patrol360.Infrastructure.Tests\Patrol360.Infrastructure.Tests.csproj --no-build` - 4 passed, 41 DB integration skipped.
- `npm run test:unit --prefix apps\web -- --run` - 53 passed.

Ограничения:

- PostgreSQL integration-сценарии не выполнялись;
- SQL `EXPLAIN ANALYZE` не снимался;
- реальные PERCo/Firebase/mobile upload runtime-сценарии не проверялись;
- выводы по производительности основаны на коде, а не на production traces.

## 3. Карта аналитических инструментов

### Patrol dashboard

Источник:

- `IPatrolDashboardQuery`
- `EfPatrolStore.GetSummary()`
- `DashboardController`
- frontend `features/dashboard`

Что считает:

- active patrols;
- delayed patrols;
- issues;
- completed today;
- shift coverage;
- completed/total points;
- online/total employees.

Плюсы:

- summary кэшируется через `IMemoryCache` на 30 секунд;
- endpoint защищен `dashboard.read`;
- есть API smoke test на permission.

Риски:

- кэш локальный in-memory, не distributed;
- summary собирается из нескольких SQL-запросов и части in-memory подсчетов;
- при нескольких API-инстансах значения могут расходиться на время TTL;
- invalidate завязан на вызовы внутри `EfPatrolStore`, но внешние сервисы могут не сбросить dashboard cache.

### Results analytics

Источник:

- `IPatrolResultQuery`
- `EfPatrolResultQuery`
- `ResultsController`
- frontend `features/patrol/ResultsScreen` и components/results

Функции:

- список результатов;
- детализация результата;
- выгрузка CSV;
- скачивание вложений;
- issues и attachment metadata.

Плюсы:

- фильтры применяются в SQL до materialize;
- detail включает issues, attachments, assignment times;
- export содержит расширенный набор полей по точке, NFC, фото и status.

Риски:

- `ExportResults` грузит весь filtered набор в память через `ToList()`;
- нет server-side pagination в `GetResults`, список возвращается целиком;
- CSV export синхронный, без фоновой job-модели;
- часть user-facing chronology строк в коде повреждена mojibake;
- аналитика по результатам пока не имеет отдельного aggregate endpoint: counters в UI могут считаться клиентом.

### EMU analytics

Источник:

- `IEmuWorkService`
- `IEmuShiftService`
- `IEmuPlanService`
- `IEmuMaintenanceService`
- `EfEmuService`
- `EmuController`
- frontend `features/emu`

Основные инструменты:

- `GET /api/v1/emu/dashboard`;
- `GET /api/v1/emu/work-sessions`;
- `GET /api/v1/emu/reports/work-history`;
- `GET /api/v1/emu/reports/work-history/employees/{employeeId}`;
- `GET /api/v1/emu/employees/{employeeId}/shift-summary`;
- `GET /api/v1/emu/employees/{employeeId}/month-summary`;
- decisions;
- work session audit;
- CSV export work sessions.

Плюсы:

- есть server-side work history snapshot;
- employee report вынесен в отдельный endpoint;
- section-scope передается в dashboard, reports, shifts, month summary, decisions;
- work history list постраничный;
- frontend уже использует server report snapshot для KPI/history counts;
- есть DB integration tests для EMU, но в текущем запуске они skipped.

Риски:

- `EfEmuService` слишком крупный: work, shifts, plans, reports, decisions, maintenance, audit в одном классе;
- month summary вызывает shift summary по дням месяца, что может быть дорогим без оптимизации;
- work session export в `EmuController` собирает все страницы по 500 и держит rows в памяти;
- report/summary correctness без DB integration не подтвержден;
- часть logic использует многочисленные `ToList()`/`AsEnumerable()`; без SQL traces нельзя оценить фактическую нагрузку.

### Inventory analytics

Источник:

- `IInventoryCatalogQuery`
- `IInventoryWorkflowService`
- `IInventoryExportService`
- `IInventoryLegacyImportService`
- `EfInventoryCatalogQuery`
- `EfInventoryWorkflowService`
- `EfInventoryExportService`
- `EfInventoryLegacyImportService`
- `InventoryController`
- frontend `features/inventory`

Основные инструменты:

- Inventory overview;
- stock balances;
- stock movements;
- custody history;
- PPE card journal with `summary` and `filteredSummary`;
- PPE movements;
- inventory reports list;
- report export;
- system log;
- legacy import run/report;
- employee import preview/import.

Плюсы:

- PPE journal KPI берутся из server-side summary/filteredSummary;
- PPE card list постраничный;
- stock balance query уже выглядит SQL-driven: group/filter/page выполняются в query;
- report definitions централизованы в workflow service;
- export jobs фиксируются в БД;
- legacy import пишет run status/tables/checksum.

Риски:

- `EfInventoryWorkflowService` и `EfInventoryExportService` совмещают много обязанностей;
- часть option endpoints в `InventoryController` грузит все страницы через `LoadAllPages`;
- `ExportReport` строит файлы синхронно и в памяти;
- `EfInventoryExportService` содержит mojibake в fallback DOC/PDF текстах;
- `InventoryOverview` материализует все items для части расчетов;
- report jobs имеют статус `completed` сразу, это скорее audit record, чем настоящая async job.

### PERCo diagnostics

Источник:

- `IPercoIntegrationService`
- `EfPercoIntegrationService`
- `PercoIntegrationController`
- frontend `features/perco`
- worker automatic sync

Функции:

- settings;
- connection test;
- secret status;
- employees sync;
- events sync;
- unmatched employees;
- matching;
- logs;
- diagnostics;
- manual presence close.

Плюсы:

- диагностика вынесена в API;
- логи доступны отдельно;
- worker может запускать automatic sync;
- секреты защищены DataProtection.

Риски:

- HTTP-клиент PERCo создан вручную внутри EF service;
- нет typed client/resilience;
- integration logic и persistence logic смешаны;
- real PERCo не проверен;
- diagnostics могут быть дорогими на больших таблицах без индексов/limits.

### System notifications

Источник:

- `ISystemNotificationService`
- `EfSystemNotificationService`
- `SystemNotificationsController`
- frontend repository `systemNotificationsRepository`

Функции:

- собирает уведомления для текущего web user;
- зависит от session user/permissions;
- ограничивает выдачу limit.

Риски:

- контроллер одновременно использует `RequirePermission("dashboard.read")` и ручное чтение bearer token;
- источник уведомлений агрегирует несколько доменов, но пока не выделен в отдельную event/read-model архитектуру.

### Mobile sync diagnostics

Источник:

- `IMobileSyncAdminService`
- `EfMobileSyncAdminService`
- `MobileSyncController`
- frontend `MobileSyncPanel`

Функции:

- список конфликтов/состояний outbox;
- device health;
- operations and notifications aggregation.

Риски:

- группировка части данных идет in-memory после `AsEnumerable()`;
- нет подтвержденного DB integration runtime в текущем запуске.

## 4. Внутренние сервисы

DI зарегистрирован в `libs/infrastructure/DependencyInjection.cs`.

Модель сейчас такая:

- application layer задает интерфейсы;
- infrastructure layer дает EF-реализации;
- часть EF-реализаций обслуживает сразу несколько интерфейсов.

Крупные реализации:

- `EfEmuService.cs` - около 193 KB;
- `Patrol360DbContext.cs` - около 128 KB;
- `EfPatrolStore.cs` - около 99 KB;
- `EfPercoIntegrationService.cs` - около 91 KB;
- `EfInventoryWorkflowService.cs` - около 85 KB;
- `EfMobileAppService.cs` - около 82 KB;
- `EfInventoryExportService.cs` - около 53 KB.

Вывод: интерфейсы уже достаточно понятные, но реализации слишком широкие. Это увеличивает риск регрессий, потому что аналитика, команды, audit, export и интеграции меняются в одних и тех же файлах.

## 5. Worker и фоновые сервисы

Источник:

- `apps/worker/Worker.cs`

Worker выполняет:

- EMU carry-over забытых работ после 00:05 по бизнес-часовому поясу;
- EMU notification refresh раз в минуту;
- PERCo automatic sync раз в maintenance cycle;
- mobile push delivery каждые 5 секунд.

Плюсы:

- фоновые задачи отделены от API process;
- используется DI scope на каждую операцию;
- push delivery может работать часто.

Риски:

- все jobs в одном `BackgroundService` и одном loop;
- нет независимого расписания/health per job;
- нет явных метрик длительности/ошибок по каждому job;
- ошибка одного job может влиять на общий цикл, если не изолирована внутри сервиса;
- нет distributed lock, если worker будет запущен в нескольких экземплярах.

## 6. Данные и аналитическая архитектура

Текущий подход:

- analytics строится напрямую из OLTP-таблиц EF Core;
- отдельного data warehouse/read-model слоя нет;
- часть агрегатов серверная, часть клиентская;
- export чаще synchronous in-memory;
- cache есть только точечно (`DashboardSummary`).

Это приемлемо для первого production-пилота на малых объемах, но на росте данных нужно разделять:

- operational reads;
- heavy analytical reports;
- exports;
- audit/history;
- integrations diagnostics.

Рекомендуемая целевая модель:

- оставить OLTP как source of truth;
- для горячих dashboard/KPI ввести read models или materialized views;
- для тяжелых exports ввести background export jobs;
- для audit/history обеспечить server-side pagination everywhere;
- для worker jobs добавить metrics и distributed coordination.

## 7. Производительность и масштабирование

Риски по коду:

- `ResultsController`/`EfPatrolResultQuery` export грузит все строки;
- `InventoryController.LoadAllPages` используется в option endpoints;
- Inventory exports строятся в памяти;
- EMU export собирает все pages в controller;
- month summary строится через цикл daily summaries;
- PERCo diagnostics делает несколько выборок/группировок;
- Mobile sync admin группирует часть данных после materialize;
- `IMemoryCache` локален и не решает multi-instance consistency.

Что уже улучшено:

- Patrol dashboard summary TTL 30 секунд;
- Inventory stock balance query в текущем виде применяет group/page в SQL;
- EMU history имеет server snapshot endpoint;
- PPE journal KPI берутся из server summary.

Что нужно измерить:

- `EXPLAIN ANALYZE` для dashboard summary;
- EMU work history report на период 1/3/12 месяцев;
- employee month summary;
- Inventory stock/items/PPE cards;
- Results export;
- PERCo diagnostics;
- Mobile sync admin.

## 8. Безопасность аналитики

Положительно:

- dashboard/results/inventory/emu/perco endpoints имеют permission checks;
- EMU section-scope прокидывается в ключевые отчеты;
- Inventory `system_log` report дополнительно требует audit permission;
- PERCo diagnostics/logs закрыты permissions.

Риски:

- нет полного endpoint allowlist/security reflection test;
- результаты обходов не имеют section/route scope, только permission-level access;
- exports могут выгружать большие наборы данных одним действием;
- download attachment отдает physical file при наличии `results.read`, без дополнительного point/route scope;
- чувствительность inventory reports нужно формально классифицировать.

## 9. UX и frontend аналитики

Плюсы:

- dashboard, EMU history, Inventory PPE уже имеют отдельные operational screens;
- EMU history получил server-driven report snapshot;
- PPE journal использует server filtered summary;
- web API client централизован.

Риски:

- `apps/web/src/api/contracts.ts` очень большой, все DTO смешаны в одном файле;
- крупные аналитические экраны еще монолитные: `EmuCompletedWorkHistoryScreen`, `ResultsScreen`, `PercoIntegrationScreen`, `InventorySettingsScreen`;
- часть UI все еще может считать derived values на клиенте;
- длинные таблицы/модалки требуют дальнейшей стандартизации через shared UI: `CompactTable`, `PaginationBar`, `InspectorPanel`, `ActionMenu`.

## 10. Приоритетные задачи

### P0

1. Запустить DB integration tests на PostgreSQL для EMU, Inventory, Results, Mobile sync, PERCo.
2. Добавить SQL performance baseline для ключевых report/dashboard queries.
3. Убрать mojibake в аналитических/export/user-facing строках backend.
4. Добавить security coverage test для report/export/diagnostics endpoints.

### P1

5. Перевести heavy exports на async export job model с сохранением файла/статуса.
6. Разделить `EfEmuService` на read/report/write/maintenance сервисы.
7. Разделить `EfInventoryWorkflowService` и `EfInventoryExportService`.
8. Вынести PERCo HTTP/diagnostics в отдельный integration client/service.
9. Добавить `IReportStorage` / `IFileStorage` abstraction для export/mobile/result files.
10. Добавить job metrics для worker.

### P2

11. Ввести read models/materialized views для dashboard и тяжелых KPI.
12. Перевести local `IMemoryCache` на configurable distributed cache, если будет несколько API-инстансов.
13. Разделить frontend contracts по features.
14. Стандартизировать аналитические таблицы и инспекторы через `shared/ui`.

## 11. Рекомендуемый порядок работ

1. DB integration + SQL traces.
2. Endpoint/security coverage для analytics/export.
3. Mojibake cleanup.
4. Async export jobs.
5. Worker observability.
6. EMU service decomposition.
7. Inventory service decomposition.
8. PERCo typed integration client.
9. Read models/materialized views для dashboard/KPI.

## 12. Итоговый статус

Аналитические инструменты и внутренние сервисы Patrol360 пригодны для текущей рабочей эксплуатации на ограниченных объемах, но требуют усиления перед полноценным production-режимом.

Готово:

- основные dashboard/report/history/export контуры есть;
- API и frontend unit tests проходят;
- EMU и Inventory частично перешли на server-driven aggregates;
- worker выполняет ключевые фоновые задачи.

Не подтверждено:

- SQL-производительность на реальной PostgreSQL БД;
- корректность всех DB integration flows;
- поведение exports на больших объемах;
- runtime устойчивость PERCo/Firebase/mobile sync;
- multi-instance consistency cache/jobs.

Главный технический долг: аналитика живет внутри широких EF-сервисов OLTP-слоя. Следующий архитектурный шаг - отделять read/report/export модели от write workflow и интеграционных side effects.
