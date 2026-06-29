# Архитектурный аудит Patrol360

Дата: 2026-06-22  
Объект: текущая рабочая копия `C:\Users\AI_server\Desktop\Proekt obhod`  
Формат: аудит структуры, слоев, рисков сопровождения и готовности к дальнейшему рефакторингу.

## 1. Краткий вывод

Patrol360 сейчас основан на правильной для проекта модели: modular monolith с отдельными приложениями `apps/api`, `apps/worker`, `apps/web`, отдельным мобильным приложением и библиотеками `libs/domain`, `libs/application`, `libs/contracts`, `libs/infrastructure`. Это хороший базис: границы проектов есть, dependency rules описаны в ADR и проверяются structure tests.

Главная проблема не в выбранной архитектуре, а в незавершенной декомпозиции. Внутри корректных верхнеуровневых слоев накопились крупные файлы-сгустки: EF-сервисы, `Patrol360DbContext`, глобальный `styles.css`, большие React-экраны и compatibility re-export слой. Из-за этого любые изменения в ЭМУ, СИЗ, PERCo, обходах и пользователях имеют повышенный риск побочных регрессий.

По проверенным критериям проект собирается и базовые тесты проходят. Но архитектурно его нельзя считать завершенно стабилизированным, пока не закрыты: грязное рабочее дерево, tracked/generated artifacts, DB integration в обычном gate, разбиение крупных EF-сервисов и cleanup старых web путей.

## 2. Проверки, выполненные в ходе аудита

Подтверждено командами:

| Проверка | Результат |
| --- | --- |
| `dotnet build .\Patrol360.slnx --no-restore` | Passed, 0 warnings/errors |
| `dotnet test .\Patrol360.slnx --no-build` | Passed: 51 passed, 41 DB integration skipped |
| `dotnet run --project tests\Patrol360.Structure.Tests\Patrol360.Structure.Tests.csproj --no-restore` | Passed |
| `npm run typecheck --prefix apps\web` | Passed |
| `npm run test:unit --prefix apps\web -- --run` | Passed: 53 tests |
| `.\tools\Verify-TextEncoding.ps1` | Passed: 775 text files |

Не подтверждено в этом проходе:

- DB integration на PostgreSQL.
- Runtime Docker health.
- Browser QA всех экранов после текущего dirty-состояния.
- SQL performance на реальной/крупной базе.
- Android APK regression после последних мобильных изменений.

## 3. Текущая архитектурная карта

### Backend

Solution `Patrol360.slnx` содержит:

- `apps/api/Patrol360.Api.csproj` - ASP.NET Core API.
- `apps/worker/Patrol360.Worker.csproj` - фоновые задачи.
- `libs/domain/Patrol360.Domain.csproj` - доменные типы и базовые правила.
- `libs/application/Patrol360.Application.csproj` - порты и application interfaces.
- `libs/contracts/Patrol360.Contracts.csproj` - DTO/контракты API.
- `libs/infrastructure/Patrol360.Infrastructure.csproj` - EF Core, PostgreSQL, интеграции, export, persistence.
- `tests/*` - тесты домена, application, infrastructure, API, worker и структуры.

Фактические dependency rules:

- API зависит от Application, Contracts, Infrastructure.
- Worker зависит от Application, Infrastructure.
- Infrastructure зависит от Application, Domain, Contracts.
- Application зависит от Domain, Contracts.
- Domain и Contracts не имеют проектных зависимостей.

Это соответствует ADR `0001` и `0002` и подтверждено structure tests.

### Frontend web

Текущий web слой находится в `apps/web`:

- React 19, Vite 7, TypeScript, Vitest.
- Новый слой уже появился: `src/app`, `src/features`, `src/shared`.
- Основные feature-модули: `dashboard`, `emu`, `inventory`, `mobileAccounts`, `patrol`, `perco`, `users`.
- `src/shared/ui` уже содержит `ActionMenu`, `CompactTable`, `KpiStrip`, `ModalShell`, `PaginationBar`.

Одновременно остались старые пути:

- `apps/web/src/components` - около 58 файлов.
- `apps/web/src/screens` - около 28 файлов.
- `apps/web/src/styles.css` - около 455 KB.

Это означает, что frontend сейчас в переходном состоянии: новая feature-структура появилась, но старый compatibility слой еще не снят.

### Mobile

Мобильный проект находится в `Мобильное приложение`.

Технологии:

- Expo SDK 56.
- React Native 0.85.
- React 19.
- expo-router, expo-sqlite, expo-camera, expo-file-system, expo-notifications, NFC.

Папка является реальным мобильным приложением, а не мусором. Путь кириллический, поэтому перенос в `apps/mobile` должен быть отдельным этапом. Android prebuild/build-output должны считаться generated и пересоздаваться, а не переноситься как исходники.

## 4. Сильные стороны

1. Верхнеуровневая архитектура выбрана правильно.

Modular monolith подходит Patrol360 лучше микросервисов: модули связаны общей БД, общими правами, отчетами, мобильным sync и административными сценариями.

2. Есть формальные архитектурные правила.

Structure tests реально защищают от грубых нарушений слоев: EF/ASP.NET/Npgsql не должны попадать в Domain/Contracts, API не должен напрямую использовать persistence entities и `Patrol360DbContext`.

3. Есть документация архитектурных решений.

ADR и `docs/refactor-structure-plan.md` фиксируют направление: `apps/*`, `libs/*`, `features/*`, `shared/*`, bounded contexts.

4. Код уже движется в нужную сторону.

Web shell, feature directories, shared UI, CSS entry-файлы и часть переносов уже сделаны. Это лучше, чем начинать рефакторинг с нуля.

5. Gate’ы базового качества сейчас зеленые.

Build, non-DB tests, web typecheck, web unit tests, structure tests и encoding gate прошли.

## 5. Главные архитектурные проблемы

### P0. Рабочая копия остается грязной

В дереве много staged, unstaged, untracked и deleted изменений. Часть из них - функциональные доработки, часть - generated artifacts, часть - результат структурных переносов.

Риск:

- нельзя уверенно отличить принятый baseline от временного состояния;
- высок риск потерять чужие изменения при массовом refactor;
- любые архитектурные выводы относятся именно к текущей рабочей копии, а не к чистому релизу.

Решение:

- зафиксировать freeze текущего состояния;
- отдельно завершить generated cleanup;
- не смешивать cleanup, behavior fixes и структурные moves в одном проходе.

### P1. Infrastructure перегружен бизнес-логикой

Крупнейшие backend-файлы:

- `libs/infrastructure/Persistence/EfEmuService.cs` - около 188 KB.
- `libs/infrastructure/Persistence/Patrol360DbContext.cs` - около 125 KB.
- `libs/infrastructure/Persistence/EfPatrolStore.cs` - около 97 KB.
- `libs/infrastructure/Persistence/EfPercoIntegrationService.cs` - около 89 KB.
- `libs/infrastructure/Persistence/EfInventoryWorkflowService.cs` - около 83 KB.
- `libs/infrastructure/Persistence/EfMobileAppService.cs` - около 80 KB.

Риск:

- persistence layer становится местом workflow/business decisions;
- трудно покрывать отдельные сценарии тестами;
- изменения в одном сценарии могут затрагивать весь сервис;
- performance fixes смешиваются с бизнес-логикой.

Решение:

- дробить EF-сервисы по bounded context и responsibility;
- выделять query services, command services, report services, decision/workflow policies;
- переносить чистую бизнес-логику в Application/Domain постепенно, без смены API.

### P1. `Patrol360DbContext` слишком крупный

`Persistence/Configurations` пока содержит только `README.md`, то есть entity configuration еще не вынесена.

Риск:

- DbContext остается центральным узлом изменений;
- миграции и entity mapping сложнее проверять;
- модули Inventory/Emu/Patrol/Perco не имеют прозрачных persistence boundaries.

Решение:

- оставить один DbContext;
- вынести `IEntityTypeConfiguration<T>` в `Persistence/Configurations/<Module>`;
- группировать DbSets и apply configurations по модулям.

### P1. Frontend refactor не завершен

Новая структура есть, но старые `screens/components` еще живут. `ScreenRouter.tsx` уже импортирует из `features/*`, но типы, callbacks и много shell-state остаются крупным композиционным узлом.

Риск:

- новые экраны могут импортировать старые compatibility файлы;
- shared UI не станет единым стандартом;
- удаление старых путей без анализа сломает сборку.

Решение:

- пройти `rg` по импортам из `src/screens` и `src/components`;
- заменить реальные импорты на `features/*`, `shared/*`, `app/*`;
- после зеленых тестов удалять re-export по одному модулю.

### P1. Глобальный CSS остается главным UI-риском

`apps/web/src/styles.css` около 455 KB. Даже после выделения feature styles это слишком большой глобальный слой.

Риск:

- визуальные регрессии в одном модуле ломают другой;
- трудно понять, какой CSS владеет модалкой/таблицей/кнопкой;
- повторяются hover/focus/table/modal rules.

Решение:

- оставить в `styles.css` только tokens, reset, shell/layout primitives;
- весь module-specific CSS перенести в `features/<module>/styles`;
- общие таблицы, модалки, action menu и pagination привязать к `shared/ui`.

### P1. DB integration не входит в текущий быстрый baseline

Обычный `dotnet test --no-build` пропустил 41 DB integration test.

Риск:

- архитектурные и performance решения в EF query/services могут проходить unit/API tests, но ломаться на реальной PostgreSQL модели;
- section-scope, reports, mobile sync и inventory aggregates требуют DB проверки.

Решение:

- сделать отдельный обязательный DB gate перед релизом и перед крупным persistence refactor;
- для горячих EF-запросов добавить `EXPLAIN ANALYZE`/performance fixtures.

### P2. Contracts и frontend API типы централизованы

`apps/web/src/api/contracts.ts` около 37 KB. Backend `libs/contracts` тоже пока не выглядит разложенным по bounded context в полной мере.

Риск:

- контрактные изменения разных модулей конфликтуют в одних файлах;
- сложно понять владельца DTO;
- frontend modules вынуждены тянуть широкий контрактный файл.

Решение:

- разложить contracts по модулям: `Emu`, `Inventory`, `Patrol`, `Users`, `Mobile`, `Perco`, `Shared`;
- на frontend сделать module-specific API contract exports с единым public barrel.

### P2. Тестовые файлы тоже становятся крупными

Примеры:

- `tests/Patrol360.Infrastructure.Tests/EmuDbIntegrationTests.cs` - около 87 KB.
- `tests/Patrol360.Api.Tests/ApiSmokeTests.cs` - около 44 KB.

Риск:

- сложно запускать точечные тесты;
- падающий сценарий труднее локализовать;
- тестовая архитектура не отражает bounded contexts.

Решение:

- разнести API/integration tests по модулям и сценариям;
- оставить smoke tests короткими;
- тяжелые scenario tests держать отдельно.

## 6. Backend: рекомендуемая целевая структура

Оставить текущие проекты, но внутри разложить по bounded context:

```text
libs/domain/
  Emu/
  Inventory/
  Patrol/
  Users/
  Mobile/
  Perco/
  Shared/

libs/application/
  Emu/
  Inventory/
  Patrol/
  Users/
  Mobile/
  Perco/
  Shared/

libs/contracts/
  Emu/
  Inventory/
  Patrol/
  Users/
  Mobile/
  Perco/
  Shared/

libs/infrastructure/
  Persistence/
    Configurations/
      Emu/
      Inventory/
      Patrol/
      Users/
      Mobile/
      Perco/
    Services/
      Emu/
      Inventory/
      Patrol/
      Users/
      Mobile/
      Perco/
```

Первый backend-кандидат на разбиение:

1. `EfEmuService.cs`
   - WorkSessions
   - Shifts
   - Plans
   - Reports
   - Decisions
   - Dictionaries

2. `Patrol360DbContext.cs`
   - entity configurations по модулям;
   - DbSet grouping;
   - seed/data setup отдельно.

3. `EfInventoryWorkflowService.cs`
   - PPE cards;
   - issue/return/write-off;
   - print/export;
   - reports.

4. `EfPercoIntegrationService.cs`
   - sync;
   - matching;
   - logs;
   - settings.

5. `EfMobileAppService.cs`
   - auth/session;
   - bootstrap;
   - patrol completion;
   - file upload/outbox;
   - mobile EMU/work tasks.

## 7. Frontend: рекомендуемая целевая структура

Текущий вектор правильный:

```text
apps/web/src/
  app/
    routing/
    shell/
    bootstrap/
  shared/
    api/
    styles/
    ui/
  features/
    dashboard/
    emu/
    inventory/
    mobileAccounts/
    patrol/
    perco/
    users/
```

Что важно доделать:

- убрать старые реальные imports из `screens` и `components`;
- оставить compatibility re-export только временно и удалить по модулю;
- продолжить дробить большие экраны:
  - `features/perco/PercoIntegrationScreen.tsx`;
  - `features/patrol/AssignmentScreen.tsx`;
  - `features/emu/EmuCompletedWorkHistoryScreen.tsx`;
  - `features/inventory/InventorySettingsScreen.tsx`;
  - `features/inventory/InventoryItemsScreen.tsx`;
  - `features/inventory/ppe/पेWizard.tsx` / `ppeWizard.tsx`.
- довести `shared/ui` до обязательного слоя для таблиц, модалок, KPI, pagination и action menu.

## 8. Mobile: архитектурный статус

Мобильное приложение нужно оставить как текущий продуктовый модуль. Оно не является мусорной папкой.

Риски:

- кириллический путь может ломать Android tooling, CI, shell scripts и некоторые пакетные команды;
- Android prebuild/build-output не должны жить как source;
- перенос в `apps/mobile` нельзя смешивать с web/backend refactor.

Рекомендация:

1. Сейчас оставить путь `Мобильное приложение`.
2. Добить ignore/generated cleanup для `android/`, `build-output/`, APK/prebuild artifacts.
3. Отдельным этапом подготовить безопасный move в `apps/mobile`:
   - проверить scripts;
   - проверить Expo config;
   - проверить docs;
   - пересобрать APK;
   - проверить login/bootstrap/patrol report flow.

## 9. Инфраструктура и DevOps

Сильные стороны:

- есть `infra`, Docker Compose, Caddy, scripts/tools;
- есть encoding gate;
- есть structure tests;
- есть документация запусков и release/checklist artifacts.

Риски:

- generated artifacts ранее попадали в Git baseline;
- runtime Docker health не был частью этого архитектурного прохода;
- DB integration зависит от доступности Postgres и часто пропускается.

Рекомендация:

- держать source tree чистым от `dist`, publish, APK, `.tmp`, `artifacts/api-publish`;
- добавить CI job matrix: source gates, DB integration, web build/tests, mobile typecheck/build smoke;
- DB integration запускать хотя бы nightly и перед релизом.

## 10. Приоритетный план работ

### Этап 1. Freeze и cleanup

1. Зафиксировать текущий `git status`.
2. Завершить удаление generated artifacts из индекса без физического удаления нужных файлов.
3. Проверить `.gitignore` для `.tmp`, `artifacts`, APK/build outputs, `apps/web/dist`.
4. Повторить build/test/typecheck/encoding.

### Этап 2. Frontend compatibility cleanup

1. Найти все реальные imports из `src/screens` и `src/components`.
2. Перевести imports на `features`, `app`, `shared`.
3. Удалять re-export файлы по одному модулю.
4. Держать `shared/ui` как единый слой.

### Этап 3. CSS ownership

1. Разделить `styles.css`.
2. Оставить глобально только tokens/reset/shell.
3. Перенести module-specific styles к владельцам.
4. Проверить ключевые экраны browser QA.

### Этап 4. Backend decomposition

1. Начать с `EfEmuService`.
2. Затем вынести EF configurations из `Patrol360DbContext`.
3. Потом Inventory, PERCo, Mobile, Patrol.
4. После каждого шага запускать build + relevant tests.

### Этап 5. DB и performance gate

1. Запустить DB integration на Postgres.
2. Проверить section-scope, reports, mobile sync, inventory aggregates.
3. Снять SQL traces для горячих запросов.

### Этап 6. Mobile move отдельно

1. Убедиться, что текущий проект стабилен.
2. Подготовить перенос в ASCII path `apps/mobile`.
3. Обновить scripts/docs/CI.
4. Собрать APK и проверить ключевые сценарии.

## 11. Что не делать сейчас

- Не переводить проект на микросервисы.
- Не дробить `.csproj` на десятки библиотек до стабилизации внутренних границ.
- Не смешивать UI redesign с structural refactor.
- Не переносить mobile path одновременно с backend/web cleanup.
- Не удалять compatibility files массово без `rg` по импортам и зеленых тестов.
- Не переписывать API/DTO/DB schema в рамках чистого структурного этапа.

## 12. Итоговый статус

Архитектурный фундамент Patrol360 адекватный: modular monolith, выделенные приложения, слои, tests и ADR. Проект можно дальше развивать без смены архитектурной модели.

Текущее состояние требует дисциплинированного стабилизационного рефакторинга:

- cleanup рабочего дерева;
- завершение web feature/shared перехода;
- разбиение глобального CSS;
- декомпозиция крупных EF-сервисов;
- DB integration как обязательный gate для persistence/report/mobile изменений.

Главный архитектурный риск на сегодня: высокая связность внутри Infrastructure и frontend global styles, а не неправильный выбор платформы или структуры monorepo.
