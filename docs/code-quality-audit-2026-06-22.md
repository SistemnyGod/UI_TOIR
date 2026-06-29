# Аудит качества кода Patrol360

Дата: 2026-06-22  
Область: backend, frontend, mobile, тесты, структура репозитория, базовые quality gates.  
Состояние: аудит выполнен по текущей рабочей копии, без отката и без исправления чужих изменений.

## Краткий вывод

Проект находится в рабочем состоянии по базовым проверкам: backend собирается без предупреждений, frontend и mobile проходят typecheck, unit-тесты проходят, production build web проходит, UTF-8/BOM gate проходит.

Главная проблема качества сейчас не в компиляции, а в сопровождаемости: слишком крупные EF-сервисы, контроллеры, React-экраны и CSS-файлы; оставшиеся mojibake-строки в production-коде; грязное рабочее дерево; DB integration тесты пропущены, поэтому поведение на PostgreSQL и реальные SQL-регрессии не подтверждены этим запуском.

Итоговая оценка: кодовая база пригодна для дальнейшей разработки, но требует планового технического рефакторинга. Для production-уверенности нужны DB integration, runtime QA и устранение mojibake в production-строках.

## Проверки

Подтверждено командами:

| Проверка | Результат |
| --- | --- |
| `dotnet build .\Patrol360.slnx --no-restore` | успешно, 0 warnings, 0 errors |
| `dotnet test .\Patrol360.slnx --no-build` | успешно: 51 passed, 41 DB integration skipped |
| `dotnet run --project tests\Patrol360.Structure.Tests\Patrol360.Structure.Tests.csproj --no-restore` | успешно |
| `npm run typecheck --prefix apps\web` | успешно |
| `npm run test:unit --prefix apps\web -- --run` | успешно: 53 passed |
| `npm run build --prefix apps\web` | успешно, Vite build ~2s |
| `npm run typecheck` в `Мобильное приложение` | успешно |
| `.\tools\Verify-TextEncoding.ps1` | успешно: 778 text files |

Ограничения проверки:

- DB integration тесты пропущены: 41 skipped.
- SQL-производительность и PostgreSQL-specific поведение не измерялись.
- Browser QA в рамках этого аудита не выполнялся.
- ESLint mobile/web не запускался как обязательный gate.

## Состояние рабочей копии

`git status --short` показывает 382 измененных записи:

| Статус | Количество |
| --- | ---: |
| `M ` | 43 |
| ` M` | 111 |
| `MM` | 60 |
| `A ` | 43 |
| `D ` | 86 |
| ` D` | 7 |
| `MD` | 10 |
| `AM` | 3 |
| `AD` | 1 |
| `??` | 18 |

Риск: нельзя безопасно делать массовые перемещения, форматирование или cleanup без отдельного freeze/разбора staged и unstaged diff. Особенно опасны `MM`, `MD`, `AM`, потому что там смешаны уже staged и новые рабочие изменения.

## Структура

Сильные стороны:

- Архитектура уже близка к modular monolith: `apps/*`, `libs/domain`, `libs/application`, `libs/contracts`, `libs/infrastructure`, `tests`, `infra`, `tools`.
- Frontend частично переведен в `app`, `features`, `shared`.
- Есть Structure.Tests, которые защищают базовую раскладку.
- Включены `Nullable`, `ImplicitUsings`, `strict` TypeScript.

Проблемы:

- Backend-модули физически еще сильно связаны через крупные инфраструктурные файлы.
- `Patrol360DbContext` остается большим центральным файлом, конфигурации сущностей не вынесены полноценно по модулям.
- В frontend еще есть крупный глобальный `styles.css` и крупные feature CSS.
- Старые compatibility слои еще сохраняются, поэтому структура выглядит переходной.

## Backend качество

### Что хорошо

- Сборка без warnings.
- Основные слои разделены: domain/application/contracts/infrastructure.
- Тесты покрывают smoke/API/domain/application/worker и часть инфраструктуры.
- Контракты вынесены отдельно, REST API не смешан напрямую с UI.

### Основные риски

Крупные файлы, требующие разбиения:

| Файл | Размер | Риск |
| --- | ---: | --- |
| `libs/infrastructure/Persistence/EfEmuService.cs` | 192 KB | god service: work sessions, shifts, reports, decisions, dictionaries |
| `libs/infrastructure/Persistence/Patrol360DbContext.cs` | 128 KB | высокая связность EF-модели |
| `libs/infrastructure/Persistence/EfPatrolStore.cs` | 99 KB | смешаны маршруты, назначения, результаты, dashboard |
| `libs/infrastructure/Persistence/EfPercoIntegrationService.cs` | 91 KB | sync/matching/logs/settings в одном сервисе |
| `libs/infrastructure/Persistence/EfInventoryWorkflowService.cs` | 85 KB | workflow, PPE, операции, отчеты смешаны |
| `libs/infrastructure/Persistence/EfMobileAppService.cs` | 82 KB | auth/bootstrap/outbox/results/EMU bridge в одном классе |
| `apps/api/Controllers/InventoryController.cs` | 39 KB | много сценариев в одном контроллере |
| `apps/api/Controllers/EmuController.cs` | 37 KB | крупный API facade |

Рекомендация:

1. EMU: разделить на `WorkSessions`, `Shifts`, `Plans`, `Reports`, `Decisions`, `Dictionaries`.
2. Inventory: разделить на `Catalog`, `Cards`, `PpePrint`, `IssueReturnWriteOff`, `Reports`.
3. PERCo: разделить на `Sync`, `Matching`, `Logs`, `Settings`.
4. Patrol: разделить `Routes`, `Assignments`, `Requests`, `Results`, `Dashboard`.
5. `Patrol360DbContext` оставить единым, но вынести configurations в `Persistence/Configurations/<Module>`.

## Frontend качество

### Что хорошо

- `strict` TypeScript включен.
- Production build стабилен.
- Unit tests проходят.
- Уже есть feature-структура и lazy chunks: `emu`, `inventory`, `perco`, `patrol-results`.
- React 19/Vite build быстрый; самый крупный JS gzip chunk не выглядит критичным.

### Основные риски

Крупные файлы:

| Файл | Размер | Риск |
| --- | ---: | --- |
| `apps/web/src/styles.css` | 466 KB | глобальный CSS риск конфликтов и регрессий |
| `apps/web/src/hooks/useEmuWorkspace.ts` | 88 KB | слишком широкий hook-сервис |
| `apps/web/src/features/perco/PercoIntegrationScreen.tsx` | 86 KB | экран содержит много сценариев |
| `apps/web/src/features/patrol/AssignmentScreen.tsx` | 85 KB | высокая связность UI и состояния |
| `apps/web/src/features/emu/EmuCompletedWorkHistoryScreen.tsx` | 78 KB | отчетная логика + UI в одном файле |
| `apps/web/src/repositories/mockInventoryRepository.ts` | 64 KB | большой mock слой, риск расхождения с API |
| `apps/web/src/features/patrol/ResultsScreen.tsx` | 48 KB | сложная модалка результатов и нормализация статусов |
| `apps/web/src/features/inventory/InventorySettingsScreen.tsx` | 46 KB | настройки + справочники в одном экране |
| `apps/web/src/features/inventory/ppe/ppeWizard.tsx` | 43 KB | wizard, печать и выборы требуют дальнейшего дробления |

CSS-долг:

- `styles.css` все еще слишком большой.
- `inventory-admin-settings-overview.css`, `perco.css`, `inventory-issue-operations.css`, `inventory-ppe-parity.css`, `emu-history-report.css`, `emu-work-board.css`, `emu-dashboard.css` требуют дальнейшего дробления.

Рекомендация:

1. Дробить `styles.css` до shell/layout/tokens only.
2. Выносить повторяемые UI primitives в `shared/ui`: `ModalShell`, `ActionMenu`, `PaginationBar`, `CompactTable`, `InspectorPanel`, `KpiStrip`.
3. Дальше разбирать `PercoIntegrationScreen`, `AssignmentScreen`, `EmuCompletedWorkHistoryScreen`, `ResultsScreen`.
4. Для mock repository ввести контрактные fixtures и минимальные scenario builders, чтобы не держать один большой файл.

## Mobile качество

Подтверждено:

- `Мобильное приложение` является отдельным Expo/React Native проектом.
- `npm run typecheck` проходит.
- В `package.json` есть `lint`, `prebuild`, `build:android:apk`.
- `strict` TypeScript включен через `expo/tsconfig.base`.

Риски:

- Путь проекта кириллический. Сейчас оставляем, но для CI/Android tooling это постоянный риск.
- Android prebuild/build-output должны оставаться generated и не попадать в source baseline.
- Нужен отдельный проход `expo lint` и Android runtime QA на устройстве/эмуляторе.

## Кодировка и текстовые данные

`Verify-TextEncoding.ps1` проходит, но найден mojibake в production-коде:

- `libs/infrastructure/Persistence/EfMobileAppService.cs`
- `apps/web/src/features/patrol/ResultsScreen.tsx`

Также есть намеренная нормализация mojibake:

- `apps/web/src/domain/emuWorkBoard.ts`
- `apps/web/src/__tests__/emuWorkBoard.test.ts`

Риск: UTF-8 gate не ловит логически сломанные строковые литералы. Это может проявляться в мобильных ошибках, статусах, отчетах, route-name fallback и сравнении русских статусов.

Рекомендация:

1. Отдельным проходом заменить mojibake-литералы на нормальные русские строки.
2. Сохранить compatibility-normalization только для старых данных в БД, но не для новых строк.
3. Добавить тест, который запрещает mojibake в production `.cs/.ts/.tsx`, исключая явно разрешенный normalizer/test fixtures.

## Тестовое покрытие

Сильные стороны:

- Есть API smoke tests.
- Есть Structure.Tests.
- Есть domain/application/worker smoke.
- Есть frontend unit tests.
- Есть много DB integration тестов для EMU, mobile, assignments, inventory, results.

Проблемы:

- 41 DB integration тест пропущен в текущем запуске.
- Без Postgres не подтверждены критичные сценарии EF, migrations, concurrency, SQL фильтры и performance.
- Frontend tests проходят, но их всего 53; для объема UI этого мало.
- Browser/e2e не входил в обязательный gate текущего запуска.

Рекомендация:

1. Сделать два уровня CI: fast gates и nightly/full gates с Postgres.
2. Для модулей EMU, PPE, Results добавить targeted browser smoke.
3. Для frontend добавить unit tests на нормализацию статусов обходов, results modal, PPE print, users scopes.

## Настройки качества

Backend:

- `Nullable` включен.
- `TreatWarningsAsErrors=false`.
- Сборка сейчас без warnings, но лучше поднять качество постепенно: сначала включить warnings-as-errors для новых/малых проектов или CI-only.

Frontend:

- TypeScript strict включен.
- Нет web lint script в `apps/web/package.json`.
- Mobile lint script есть, но не был запущен в этом аудите.

Рекомендация:

1. Добавить web lint script и rule set без массового автоформатирования.
2. Ввести lightweight code-quality check: размер файла, запрещенный mojibake, запрет новых imports из compatibility paths.
3. Не запускать форматтер на весь репозиторий до стабилизации dirty tree.

## Приоритетный план улучшений

### P0: стабилизация качества

1. Зафиксировать dirty tree: staged/unstaged/untracked/deleted.
2. Исправить mojibake в `EfMobileAppService.cs` и `ResultsScreen.tsx`.
3. Добавить automated mojibake guard для production files.
4. Запустить DB integration на Postgres и зафиксировать результат.
5. Убедиться, что generated files (`apps/web/dist`, Android prebuild/build-output, artifacts) не попадают в source baseline.

### P1: уменьшение связности

1. Разбить `EfEmuService.cs`.
2. Разбить `EfMobileAppService.cs`.
3. Разбить `EfPatrolStore.cs`.
4. Вынести EF configurations из `Patrol360DbContext.cs`.
5. Разбить `ResultsScreen.tsx`, `AssignmentScreen.tsx`, `PercoIntegrationScreen.tsx`.

### P2: UI/shared cleanup

1. Довести `shared/ui`.
2. Убрать старые compatibility re-export файлы после проверки imports.
3. Разрезать `styles.css`.
4. Добавить visual/browser smoke для ключевых экранов.

## Acceptance для следующего quality-pass

- `dotnet build` и `dotnet test` проходят.
- DB integration проходит на Postgres или явно документирован блокер.
- Web typecheck/test/build проходят.
- Mobile typecheck и lint проходят.
- Encoding gate проходит.
- Mojibake guard проходит.
- Нет новых файлов > 80 KB без явного обоснования.
- Нет новых production imports из старых compatibility paths.
