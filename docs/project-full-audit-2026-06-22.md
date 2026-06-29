# Patrol360: полный аудит проекта от 2026-06-22

## 1. Краткий вывод

Проект находится в рабочем, но не релизно-стабильном состоянии. Архитектурно это модульный монолит с правильным верхним разделением `apps/*`, `libs/*`, `tests`, `infra`, `docs`; frontend уже частично переведен в `app/features/shared`, backend держит доменные границы через контракты и application interfaces.

Главные проблемы сейчас не в отсутствии базовой архитектуры, а в управляемости: очень грязная рабочая копия, крупные EF-сервисы, крупные frontend-экраны/CSS, один падающий DB integration по PERCo/ЭМУ, user-facing mojibake-строки в backend и нестабильный root web build через `npm --prefix`.

Общий уровень готовности: для локальной разработки и демонстрации многие gates зеленые; для production/release нельзя считать готовым, пока не закрыты DB integration failure, сборочный gate `npm run build --prefix apps\web`, runtime SQL/health замеры и очистка baseline.

## Проверки

| Проверка | Результат |
| --- | --- |
| `dotnet build .\Patrol360.slnx --no-restore` | passed, 0 warnings/errors |
| `dotnet test .\Patrol360.slnx --no-build` | passed: 51 passed, 41 DB integration skipped |
| `PATROL360_RUN_DB_INTEGRATION=true dotnet test tests\Patrol360.Infrastructure.Tests --no-build` | failed: 44 passed, 1 failed |
| `npm run typecheck --prefix apps\web` | passed |
| `npm run test:unit --prefix apps\web -- --run` | passed: 53 tests |
| `npm run build --prefix apps\web` | failed: Vite emitted relative HTML asset path |
| `npm run build` inside `apps\web` | passed, largest gzip JS chunk `index` 81.42 kB |
| `dotnet run --project tests\Patrol360.Structure.Tests\Patrol360.Structure.Tests.csproj --no-restore` | passed |
| `.\tools\Verify-TextEncoding.ps1` | passed: 774 text files |
| `npm run typecheck` in `Мобильное приложение` | passed |

## 2. Критичные проблемы

| № | Проблема | Где находится | Почему критично | Как исправить | Приоритет |
| --- | --- | --- | --- | --- | --- |
| 1 | DB integration падает на PERCo lunch exit/return | `tests/Patrol360.Infrastructure.Tests/EmuDbIntegrationTests.cs:1147`, `libs/infrastructure/Persistence/EfEmuService.cs`, `EfPercoIntegrationService.cs` | Сценарий обеда через PERCo не дает `lunch-perco` interval; отчеты смен могут считать свободное/обеденное время неверно | Починить построение `percoLunchAbsenceRanges` и summary interval mapping, затем прогнать весь DB integration | P0 |
| 2 | User-facing mojibake в backend | `EfPercoIntegrationService.cs:1536-1560`, `EfEmuService.cs:1991-2041`, `InventoryController.cs:720-721` | Пользователь и API-клиент получают нечитаемые сообщения ошибок/решений | Декодировать строки, добавить тест/grep на `Рџ/Рќ/СЃ` в source strings | P0 |
| 3 | Корневой web build нестабилен | `npm run build --prefix apps\web` | Регрессионный gate из планов падает, CI может не собрать frontend | Запускать build с `cwd=apps/web` или исправить Vite/root config под `npm --prefix` | P0 |
| 4 | Грязный baseline слишком большой | `git status`: 378 строк, `git diff --stat`: 192 файла, 24k insertions / 64k deletions | Нельзя надежно отделить аудит, рефакторинг и чужие изменения | Freeze: разделить изменения по пакетам, принять/отклонить, не смешивать с новыми feature edits | P0 |
| 5 | Generated/temporary artifacts физически присутствуют | `.tmp`, `apk-check`, `apps/*/bin`, `tests/*/bin`, `apps/web/dist` | Риск случайной публикации мусора и неверных size-аудитов | Держать в `.gitignore`, очистить из индекса, аудитировать build-output отдельно | P1 |

## 3. Проблемы производительности

| № | Место | Проблема | Причина тормозов | Решение | Ожидаемый эффект |
| --- | --- | --- | --- | --- | --- |
| 1 | `EfInventoryCatalogQuery.GetOverview`, `GetItems` | Overview грузит все items в память | `InventoryItems.AsNoTracking().ToList()` до расчетов | Перевести KPI/facets в SQL aggregates | Меньше RAM и быстрее overview на большом справочнике |
| 2 | `InventoryController.IssueOptions/OperationsOptions:86-104` | Загружаются все employees/items/stock страницами по 100 | Options endpoint возвращает слишком широкий payload | Разделить options на searchable endpoints и lazy stock lookup | Быстрее открытие выдачи/операций |
| 3 | `EfInventoryWorkflowService.BuildPpeSummary:1427-1445` | 10+ отдельных `Count()` по одной query | Много SQL round-trips/подзапросов | Один grouped/projection aggregate или cached summary по фильтрам | Стабильнее PPE журнал на больших данных |
| 4 | `useEmuWorkspace.ts:167-173`, `2067-2081` | Initial API load забирает все work sessions | `getAllApiWorkSessions()` постранично дочитывает весь список | Initial load только settings/dashboard/current board; history только по запросу | Меньше сетевой трафик и быстрее ЭМУ |
| 5 | `EmuCompletedWorkHistoryScreen.tsx:402-406` | Non-API export собирает все строки на клиенте | CSV строится в UI-потоке | Для API всегда server export; для local ограничить/worker | UI не зависает на больших периодах |
| 6 | `EfMobileAppService.cs:235-335` | Несколько read-like mobile endpoints пишут `TouchSession` | `SaveChanges()` на частых мобильных обращениях | Распространить throttled touch на все mobile read endpoints | Меньше write load на мобильном polling |
| 7 | `EfPatrolStore.GetSummary:41-78` | Dashboard считает много отдельных счетчиков | Несколько count-запросов | Уже добавлен cache; дальше один projection query + invalidation по событиям | Меньше DB load при частом dashboard refresh |

## 4. Frontend-аудит

| Экран/компонент | Проблема | Что оптимизировать | Как исправить | Приоритет |
| --- | --- | --- | --- | --- |
| `features/perco/PercoIntegrationScreen.tsx` | 83.7 KB | Состояние, вкладки, tables/logs | Разбить на hooks + panels + log table | P1 |
| `features/patrol/AssignmentScreen.tsx` | 82.7 KB | Доска заявок/назначений/модалки | Вынести workspace components | P1 |
| `features/emu/EmuCompletedWorkHistoryScreen.tsx` | 76 KB | История, employee report, sections | Разделить filters, tabs, modal, section lazy list | P1 |
| `features/patrol/ResultsScreen.tsx` | 45.8 KB | Модалка результатов, фото, группировка | Вынести review modal/table/photo viewer | P1 |
| `features/inventory/InventorySettingsScreen.tsx` | 45.2 KB | Справочники и настройки | Разделить по доменам settings | P2 |
| `features/inventory/InventoryItemsScreen.tsx` | 43.5 KB | Таблица и формы номенклатуры | Shared compact table + form modal | P2 |
| `features/inventory/ppe/ppeWizard.tsx` | 41.7 KB | Wizard и picker | Дробить шаги, держать lazy set cache | P2 |
| CSS `apps/web/src/styles.css` | 444 KB | Глобальная смесь shell/feature styles | Оставить только tokens/layout; feature CSS держать рядом с module | P1 |
| Old `components/screens` | 70 файлов | Compatibility слой остается большим | Удалять re-export после import audit | P2 |

## 5. Backend-аудит

| Метод/API/сервис | Проблема | Причина | Решение | Приоритет |
| --- | --- | --- | --- | --- |
| `EfEmuService.cs` | 188 KB, много bounded contexts | Work sessions, shifts, plans, reports, decisions в одном файле | Разделить на services/query classes без смены API | P1 |
| `Patrol360DbContext.cs` | 125 KB | Конфигурации сущностей в одном DbContext | Вынести configurations по модулям | P1 |
| `EfPatrolStore.cs` | 97 KB | Patrol, mobile accounts, dashboard, notifications вместе | Разделить store/read models/mobile account service | P1 |
| `EfPercoIntegrationService.cs` | 88.8 KB + mojibake | Sync, matching, logs, presence analysis вместе | Разделить + исправить строки | P0 |
| `EfInventoryWorkflowService.cs` | 82.9 KB | PPE, custody, reports, users вместе | Split cards/issue/returns/export/reports | P1 |
| `EfMobileAppService.cs` | 80.1 KB | Mobile auth/bootstrap/outbox/patrol/EMU вместе | Split auth/bootstrap/sync/patrol/emu facades | P1 |

## 6. Аудит базы данных

| Таблица/запрос | Проблема | Индекс/изменение | Ожидаемый эффект | Приоритет |
| --- | --- | --- | --- | --- |
| `inventory.stock_moves` | Stock aggregation горячая на больших данных | Уже добавлен индекс `(item_id, warehouse_id, move_type)`; нужен `EXPLAIN ANALYZE` | Подтвердить SQL-пагинацию и buffers | P1 |
| `inventory.ppe_cards` + `ppe_card_lines` | Summary делает много correlated counts | Индексы по `status`, `archived_at`, `card_id/status`, `due_at` после EXPLAIN | Быстрее KPI PPE |
| `emu_work_sessions` | История/отчеты фильтруют период/участок/status | Проверить composite `(work_date, section_id, status, deleted_at)` | Быстрее история ЭМУ |
| `emu_employee_shifts` | Фильтр day/night/summary по employee/date | Проверить `(employee_id, shift_date)` | Быстрее сменные отчеты |
| `patrol_results` | Results detail/list с attachments/issues | Проверить `(assignment_id)`, `(completed_at/status)`, attachment `(patrol_result_id)` | Быстрее журнал результатов |

## 7. Аудит API

| Endpoint | Проблема | Что изменить | Новый формат ответа | Приоритет |
| --- | --- | --- | --- | --- |
| `GET /api/v1/inventory/issues/options` | Возвращает employees/items/settings/stock полностью | Разделить на `options`, `employees/search`, `items/search`, `stock?itemId` | Легкий initial payload + lazy lookup | P1 |
| `GET /api/v1/inventory/operations/options` | Аналогичная full-load проблема | То же | То же | P1 |
| `GET /api/v1/inventory/reports` | Для non-audit сначала берет 100 отчетов и фильтрует в памяти | Фильтровать system_log на уровне service/query | Тот же DTO, корректный total | P2 |
| `GET /api/v1/emu/work-sessions` | Есть пагинация, но frontend может обходить все страницы | Запретить full-load по умолчанию в UI hooks | Без изменения DTO | P1 |
| Mobile API read endpoints | Частые `TouchSession + SaveChanges` | Единый throttled touch helper | Без изменения DTO | P1 |

## 8. Аудит отчетов

| Отчет | Проблема | Что исправить | Как должно работать | Приоритет |
| --- | --- | --- | --- | --- |
| История ЭМУ | Snapshot есть, но stale/mojibake UI strings и client fallback full-load | Убрать full-load fallback, исправить строки | Таблица page-driven, KPI server snapshot | P1 |
| Смена сотрудника ЭМУ | DB test по PERCo lunch падает | Исправить lunch-perco intervals | Обед PERCo не закрывает смену и отражается отдельным interval | P0 |
| PPE печатные формы | Сейчас тесты есть, но runtime визуально надо сверять | Browser QA + DOCX diff smoke | Preview/print/DOCX одинаковы | P2 |
| Inventory reports export | Формирование синхронное | Для больших отчетов добавить async export/job | Быстрый preview, файл готовится в фоне | P2 |
| Results patrol detail | UI недавно менялся, нужна e2e фиксация фото/status/manual skip | Добавить тест detail modal + attachments | Отчет показывает статус точки, фото, ручное заполнение | P1 |

## 9. Аудит безопасности

| Область | Риск | Как проверить | Как исправить | Приоритет |
| --- | --- | --- | --- | --- |
| RBAC backend | В целом `RequirePermission` широко используется | API negative tests по каждому write/export/delete | Добавить permission matrix tests | P1 |
| EMU section-scope | Реализуется через `AllowedSectionIds`, но нужен полный negative suite | Scoped user against reports/decisions/plans/shifts | Закрыть DB tests на все endpoints | P0/P1 |
| Inventory reports | `system_log` закрывается вручную в controller | Direct API tests для no-audit user | Перенести фильтр в service/query | P2 |
| Персональные данные | Employees/results/mobile accounts доступны широкими DTO | Проверить роли auditor/operator | Field-level masking для read-only ролей | P2 |
| Mobile auth | Старый APK/новый API совместимы частично | Regression login/bootstrap/outbox на установленном APK | Версионировать mobile client/build protocol | P1 |

## 10. Аудит UI/UX

| Экран | Что неудобно | Как улучшить | Польза | Приоритет |
| --- | --- | --- | --- | --- |
| Results detail modal | Много карточек, повтор ФИО, фото не всегда inline | Компактная таблица точек + thumbnail + viewer | Быстрее разбор обхода | P1 |
| PERCo | Есть риск overflow из-за крупного экрана и длинных строк | Compact tables, sticky filters, log drawer | Меньше визуальных дефектов | P1 |
| Users | Уже улучшался, но сложная настройка прав остается большой | Shared permission matrix + section scope block | Быстрее администрирование | P2 |
| EMU history | Много фильтров/табов/модалок в одном файле | Sticky applied filters, server-driven counters | Меньше stale-состояний | P1 |
| Inventory PPE | UI сильно полировался, но CSS еще много | Закрепить shared action menu/table/drawer | Меньше регрессий | P2 |

## 11. Технический долг

| № | Технический долг | Чем мешает | Как исправить | Сложность |
| --- | --- | --- | --- | --- |
| 1 | 378 dirty status entries | Нельзя стабильно релизить | Freeze + пакетная приемка изменений | M |
| 2 | Крупные EF-сервисы | Риск регрессий и долгих ревью | Split by responsibility | L |
| 3 | Большой global CSS | Визуальные side effects | Feature CSS + tokens only global | M |
| 4 | Compatibility re-exports | Двойные пути импортов | Import audit + deletion pass | M |
| 5 | Mojibake content | Нечитаемые ошибки | Decode + guard test | S |
| 6 | Mixed mobile Cyrillic path | Скрипты/CI могут ломаться | Перенос в `apps/mobile` отдельным этапом | M |
| 7 | Runtime SQL не измерен | Нельзя подтвердить performance fixes | pg_stat_statements + EXPLAIN | M |

## 12. Быстрые улучшения

1. Исправить mojibake строки в `EfPercoIntegrationService`, `EfEmuService`, `InventoryController`.
2. Исправить `npm run build --prefix apps\web` или заменить root scripts на `npm --prefix apps/web run build` с корректным cwd.
3. Починить падающий DB integration `RefreshNotificationsTreatsPercoLunchExitAndReturnAsLunchBreak`.
4. Запретить full-load `getAllApiWorkSessions()` на initial load, если экрану не нужен весь архив.
5. Распространить throttled `TouchSession` на read-like mobile endpoints.
6. Добавить grep/test на mojibake-паттерны в source strings.
7. Зафиксировать dirty baseline: отдельные пакеты web/backend/mobile/docs/generated.

## 13. Крупные доработки

1. Разделить `EfEmuService` на work sessions, shifts, reports, plans, decisions, dictionaries.
2. Разделить `EfInventoryWorkflowService` на PPE cards, custody, reports, issue/return/write-off.
3. Разделить `EfMobileAppService` на auth/bootstrap/outbox/patrol/emu.
4. Вынести EF configurations из `Patrol360DbContext`.
5. Перевести тяжелые reports/export на async jobs с хранением результата.
6. Перенести мобильное приложение в ASCII path `apps/mobile` после отдельной проверки.

## 14. План оптимизации

| Этап | Что сделать | Результат | Приоритет | Сложность |
| --- | --- | --- | --- | --- |
| 1 | Срочные исправления: DB test, mojibake, build gate | Зеленый baseline | P0 | S/M |
| 2 | SQL/DB: EXPLAIN, индексы, агрегаты PPE/EMU | Подтвержденная SQL-производительность | P1 | M |
| 3 | Frontend: убрать full-load, split big screens | Меньше UI лагов и проще сопровождение | P1 | M/L |
| 4 | Отчеты: server snapshots/export jobs | Большие периоды не блокируют UI | P2 | L |
| 5 | Архитектура: split EF services/configurations | Управляемый backend | P1 | L |
| 6 | Безопасность: negative RBAC/section tests | Меньше риска доступа к чужим данным | P1 | M |
| 7 | DevOps: root scripts, health, logs, backup docs | Повторяемый деплой | P2 | M |

## 15. Итоговый список задач для разработчика

| № | Задача | Модуль | Что сделать | Критерий готовности | Приоритет |
| --- | --- | --- | --- | --- | --- |
| 1 | Починить PERCo lunch DB test | EMU/PERCo | Вернуть `lunch-perco` interval | DB integration 45/45 passed | P0 |
| 2 | Исправить mojibake строки | Backend | Декодировать user-facing strings | grep/test не находит mojibake | P0 |
| 3 | Починить root web build | Web/DevOps | Стабилизировать `npm run build --prefix apps\web` | Команда проходит из root | P0 |
| 4 | Freeze dirty baseline | Repo | Разделить staged/unstaged/untracked | Понятный набор changesets | P0 |
| 5 | Убрать full-load EMU initial sessions | Web EMU | Не вызывать `getAllApiWorkSessions()` на старте | Network не грузит весь архив | P1 |
| 6 | Оптимизировать Inventory options | Inventory API | Lazy employees/items/stock | Options payload меньше и быстрее | P1 |
| 7 | Свести PPE summary counts | Inventory DB | Один aggregate/projection | Меньше SQL round-trips | P1 |
| 8 | Split `EfEmuService` | Backend EMU | Выделить сервисы | Файл <80 KB, тесты проходят | P1 |
| 9 | Split Results modal | Web Patrol | Таблица точек + thumbnails + viewer | Browser QA без overflow | P1 |
| 10 | Включить SQL traces | DevOps/DB | pg_stat_statements + EXPLAIN scripts | Есть before/after метрики | P1 |

## Топ-10 действий в первую очередь

1. Исправить `RefreshNotificationsTreatsPercoLunchExitAndReturnAsLunchBreak`.
2. Исправить mojibake user-facing строк.
3. Починить root `npm --prefix` build gate.
4. Зафиксировать и разделить dirty baseline.
5. Убрать full-load `getAllApiWorkSessions()` с initial load.
6. Оптимизировать `IssueOptions/OperationsOptions` в Inventory.
7. Добавить SQL traces для stock/PPE/EMU/results.
8. Разделить `EfEmuService`.
9. Разделить `PercoIntegrationScreen` и `ResultsScreen`.
10. Добавить negative RBAC/section-scope тесты.
