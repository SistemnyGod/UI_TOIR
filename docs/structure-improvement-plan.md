# Structure improvement plan

Дата аудита: 18.05.2026

## Текущая оценка

Готовность структуры проекта: 80%.

Монорепо организовано правильно для текущего этапа: есть разделение на `apps`, `libs`, `docs`, `infra`, `tools`, слои backend разнесены на API/application/domain/contracts/infrastructure, frontend находится отдельно в `apps/web`, worker вынесен в отдельный host.

Главные причины, почему структура после первого прохода еще не выше 90%:

- Git инициализирован локально, но еще нет осмысленной истории коммитов, branch policy и review policy;
- есть первичный `tests` каркас, но нет полноценных xUnit/Vitest/Playwright test suites;
- есть CI workflow, но он еще не проверен на удаленном Git-хостинге;
- в рабочей области физически присутствуют generated artifacts: `bin`, `obj`, `dist`, `node_modules`, `output`;
- legacy-прототип перенесен в `legacy/territory-patrol-panel`, но еще не принято решение об окончательном удалении;
- ADR-структура создана, но будущие крупные решения еще нужно регулярно фиксировать;
- line endings policy переведен на LF, но `dotnet format` нужно держать в регулярном gate.

## Фактическая структура

```text
.
  apps/
    api/       ASP.NET Core API host
    web/       React + TypeScript + Vite frontend
    worker/    .NET Worker host
  libs/
    domain/          доменная модель
    application/     application/use-case слой
    contracts/       DTO/API contracts
    infrastructure/  EF Core/PostgreSQL и инфраструктурные реализации
  docs/       архитектура, модули, frontend/backend планы
  infra/
    docker/   локальный compose для PostgreSQL/Redis/RabbitMQ/MinIO
  tests/      структурные и будущие функциональные тесты
  tools/      локальные проверки и утилиты
  legacy/territory-patrol-panel/  старый статический UI-прототип
  output/     generated build/audit artifacts
```

## Реализовано в первом структурном проходе

- Инициализирован локальный Git-репозиторий.
- `.editorconfig` и `.gitattributes` переведены на LF policy.
- Добавлен `docs/adr` с первыми ADR по монорепо, правилам слоев и frontend data-source boundaries.
- Добавлен `docs/runbooks` для local dev, database migrations и release checklist.
- Добавлены `tools/Clean-Workspace.ps1`, `tools/Check-Structure.ps1`, `tools/Test-All.ps1`.
- Добавлен `tests/Patrol360.Structure.Tests` без внешних NuGet-зависимостей.
- Добавлены placeholders для `Domain`, `Application`, `Infrastructure`, `Api`, `Worker` test projects.
- Placeholders заменены на реальные xUnit-проекты со smoke-тестами по слоям.
- Добавлен Vitest + Testing Library smoke test для frontend.
- Добавлен Playwright smoke test для frontend на отдельном Vite-порту `5176`.
- Добавлен frontend structural test runner в `tests/web/unit`.
- Добавлен `tests/web/e2e` как место под будущие cross-app Playwright smoke tests.
- Добавлен `.github/workflows/ci.yml`.
- Добавлен `infra/env/.env.example` и `infra/README.md`.
- Старый `territory-patrol-panel` перенесен в `legacy/territory-patrol-panel`.

## Целевая структура

```text
.
  .github/
    workflows/
      ci.yml
  apps/
    api/
    web/
    worker/
  libs/
    domain/
    application/
    contracts/
    infrastructure/
  tests/
    Patrol360.Domain.Tests/
    Patrol360.Application.Tests/
    Patrol360.Infrastructure.Tests/
    Patrol360.Api.Tests/
    Patrol360.Worker.Tests/
    web/
      unit/
      e2e/
  docs/
    adr/
    architecture.md
    backend-implementation.md
    frontend-improvement-plan.md
    monorepo-structure.md
    structure-improvement-plan.md
  infra/
    docker/
    env/
    monitoring/
  tools/
    Verify-TextEncoding.ps1
    Clean-Workspace.ps1
    Test-All.ps1
  legacy/
    territory-patrol-panel/
```

Не все каталоги нужно создавать сразу. Цель этого дерева - зафиксировать направление, чтобы новые файлы не расползались по корню.

## Правила владения слоями

### `apps/api`

Назначение:

- HTTP endpoints;
- middleware;
- auth/RBAC;
- OpenAPI;
- request/response mapping;
- health checks;
- composition root.

Нельзя:

- держать доменную бизнес-логику в controllers;
- напрямую реализовывать persistence-алгоритмы;
- создавать DTO, которые дублируют `libs/contracts` без причины.

### `apps/worker`

Назначение:

- фоновые задачи;
- scheduled jobs;
- outbox/inbox processing;
- отчеты и тяжелые операции;
- интеграционные jobs.

Нельзя:

- дублировать use cases из API;
- выполнять бизнес-операции напрямую в `Program.cs`;
- держать отдельную модель данных, отличную от application/domain.

### `apps/web`

Назначение:

- React UI;
- typed API client;
- screen/feature composition;
- frontend repositories для API/mock/local draft;
- UI state, формы, навигация.

Нельзя:

- хранить бизнес-истину только в `localStorage` в API mode;
- импортировать backend/private contracts напрямую без generated/public API слоя;
- держать production-моки рядом с реальными API repository без явной маркировки.

### `libs/domain`

Назначение:

- сущности;
- value objects;
- доменные правила;
- инварианты;
- доменные события, если они появятся.

Разрешенные зависимости:

- только BCL/.NET base libraries.

Нельзя:

- ASP.NET;
- EF Core;
- PostgreSQL/Npgsql;
- Redis/RabbitMQ/MinIO;
- DTO из API;
- frontend concepts.

### `libs/application`

Назначение:

- use cases;
- commands/queries;
- ports/interfaces;
- orchestration бизнес-сценариев;
- application validation.

Разрешенные зависимости:

- `libs/domain`;
- `libs/contracts`, если contracts являются публичной границей application/API.

Нельзя:

- EF Core implementation;
- HTTP controllers;
- filesystem/storage SDK напрямую;
- UI-specific state.

### `libs/contracts`

Назначение:

- DTO;
- request/response contracts;
- read models;
- shared enum/value contracts для API и clients.

Нельзя:

- зависеть от `application`, `infrastructure`, `apps/api`;
- содержать EF entities;
- содержать внутренние persistence details.

### `libs/infrastructure`

Назначение:

- EF Core DbContext/entities/configurations;
- repositories/store implementations;
- migrations;
- adapters для PostgreSQL, Redis, RabbitMQ, MinIO, FCM, файлов и отчетов.

Разрешенные зависимости:

- `libs/application`;
- `libs/domain`;
- `libs/contracts`, если нужно маппить DTO/read models.

Нельзя:

- отдавать EF entities наружу в API/frontend;
- содержать UI-specific logic;
- превращаться в место для всех helper-функций.

## P0: зафиксировать repository hygiene

Цель: привести рабочую структуру к состоянию, где ясно отделены исходники от сгенерированных файлов.

Доработать:

- инициализировать Git в корне проекта или перенести проект в настоящий репозиторий;
- убедиться, что `.gitignore` реально исключает `bin`, `obj`, `.vs`, `node_modules`, `dist`, `.vite`, `output`, `TestResults`, `coverage`;
- удалить generated artifacts из индекса, если они уже попали под Git после инициализации;
- оставить `output/` только как локальную папку аудита/сборки, не как часть продукта;
- добавить `tools/Clean-Workspace.ps1` для очистки `bin/obj/dist/output/TestResults/coverage`;
- добавить `docs/adr/` и первый ADR по выбранной структуре монорепо;
- решить LF/CRLF policy и привести `.editorconfig`/`.gitattributes` к одному правилу.

Критерии готовности:

- `git status` показывает только осознанные исходные файлы;
- build artifacts не попадают в tracked files;
- новый разработчик понимает, какие каталоги являются source, а какие generated;
- `dotnet format --verify-no-changes --no-restore` не падает на ENDOFLINE.

## P1: добавить тестовую структуру

Цель: сделать тесты частью архитектуры, а не отдельной будущей задачей.

Рекомендуемое дерево:

```text
tests/
  Patrol360.Domain.Tests/
  Patrol360.Application.Tests/
  Patrol360.Infrastructure.Tests/
  Patrol360.Api.Tests/
  Patrol360.Worker.Tests/
  web/
    unit/
    e2e/
```

Минимальные .NET test projects:

- `Patrol360.Domain.Tests` - доменные правила, value objects, инварианты;
- `Patrol360.Application.Tests` - use cases, validation, ports через fakes;
- `Patrol360.Infrastructure.Tests` - EF mappings, migrations, repository integration;
- `Patrol360.Api.Tests` - endpoint smoke, validation, auth/RBAC, ProblemDetails;
- `Patrol360.Worker.Tests` - job orchestration и retry/idempotency logic.

Frontend tests:

- unit tests рядом с feature/domain/repository кодом или в `tests/web/unit`;
- e2e/smoke в `tests/web/e2e`;
- отдельные fixtures/factories, не общий `data.ts`.

Критерии готовности:

- test projects добавлены в `Patrol360.slnx`;
- есть единая команда запуска всех тестов;
- минимум один smoke test на API и один frontend smoke test;
- новые module changes требуют тестов в соответствующем слое.

## P2: добавить CI contract

Цель: структура должна проверяться автоматически.

Создать:

```text
.github/
  workflows/
    ci.yml
```

Минимальный CI pipeline:

```powershell
dotnet restore .\Patrol360.slnx
dotnet build .\Patrol360.slnx --no-restore
dotnet test .\Patrol360.slnx --no-build
.\tools\Verify-TextEncoding.ps1
cd .\apps\web
npm ci
npm run verify
npm run test:run
```

После появления e2e:

```powershell
npm run e2e
```

Критерии готовности:

- pull request не считается готовым без зеленого CI;
- CI проверяет backend, frontend, кодировку и тесты;
- локальные команды совпадают с CI, чтобы не было отдельной "магии" на сервере.

## P3: формализовать docs и ADR

Цель: документация должна объяснять не только что есть, но и почему структура такая.

Добавить:

```text
docs/
  adr/
    0001-monorepo-modular-monolith.md
    0002-layer-dependency-rules.md
    0003-frontend-data-source-boundaries.md
  runbooks/
    local-dev.md
    database-migrations.md
    release-checklist.md
```

Обновить:

- `docs/monorepo-structure.md` - сделать не только обзором, но и правилом размещения файлов;
- `README.md` - добавить ссылку на этот structure plan;
- `docs/stabilization.md` - привязать проверки к CI;
- `docs/frontend-improvement-plan.md` - сослаться на `tests/web` и source ownership.

Критерии готовности:

- при добавлении нового модуля понятно, куда класть API, use cases, domain, infrastructure, frontend и tests;
- крупные архитектурные решения фиксируются ADR;
- docs не противоречат фактическому дереву.

## P4: отделить legacy и active code

Цель: старый прототип не должен восприниматься как часть production frontend.

Статус: выполнено в первом структурном проходе. Старый прототип перенесен в `legacy/territory-patrol-panel`, внутри добавлен README со статусом `legacy prototype`.

Варианты:

- перенести `territory-patrol-panel` в `legacy/territory-patrol-panel`;
- или оставить на месте, но добавить `territory-patrol-panel/README.md` со статусом `legacy prototype`;
- или удалить после проверки, что все полезные UI-решения уже перенесены в `apps/web`.

Рекомендация: перенести в `legacy/territory-patrol-panel` и добавить короткий README.

Критерии готовности:

- в корне не лежит неочевидный второй frontend;
- новый разработчик не путает `apps/web` и старый статический прототип;
- CI не пытается собирать legacy-код.

## P5: укрепить infra/tools

Цель: локальный запуск и проверка структуры должны быть воспроизводимыми.

Добавить в `tools`:

- `Test-All.ps1` - единая локальная проверка backend/frontend/encoding/tests;
- `Clean-Workspace.ps1` - очистка generated artifacts;
- `New-Migration.ps1` или README-команды для EF migrations после стабилизации БД;
- `Check-Structure.ps1` - опционально, проверка запрещенных зависимостей и случайных artifacts.

Добавить в `infra`:

- `infra/env/.env.example`;
- описание портов локальных сервисов;
- runbook для поднятия PostgreSQL/Redis/RabbitMQ/MinIO;
- позже - monitoring и deployment manifests.

Критерии готовности:

- новый разработчик может поднять проект по README/runbook без ручных догадок;
- локальная инфраструктура не зависит от скрытых настроек;
- tools не дублируют CI, а повторяют те же проверки локально.

## Проверка зависимостей между проектами

Текущие зависимости в целом нормальные:

```text
apps/api -> application, contracts, infrastructure
apps/worker -> application, infrastructure
libs/application -> domain, contracts
libs/infrastructure -> application, domain, contracts
libs/domain -> no project refs
libs/contracts -> no project refs
```

Риски:

- `apps/api` напрямую ссылается на `infrastructure`, что нормально для composition root, но controllers не должны использовать infrastructure classes напрямую;
- `libs/application` зависит от `contracts`; это допустимо, если contracts являются публичными командами/read models, но нельзя превращать contracts в свалку API-only DTO;
- `libs/infrastructure` зависит от `contracts`; это допустимо для read models, но EF entities не должны утекать в contracts.

Доработать:

- добавить architecture tests на запрещенные зависимости;
- запретить references из `domain` наружу;
- запретить references из `contracts` наружу;
- проверить, что API controllers вызывают application/store abstractions, а не держат persistence rules.

## Структурные Definition of Done

Структуру можно считать готовой на 90%+, когда:

- проект находится в Git-репозитории;
- есть `.github/workflows/ci.yml`;
- `tests/` создан и добавлен в solution;
- backend и frontend тесты запускаются одной командой;
- generated artifacts не находятся в tracked files;
- legacy-прототип явно вынесен или помечен;
- есть `docs/adr`;
- dependency rules между слоями описаны и хотя бы частично проверяются тестом/скриптом;
- line endings policy единая и проходит `dotnet format`;
- `README.md` описывает актуальный запуск, проверки и структуру;
- `tools` содержит повторяемые команды для clean/test/encoding.

## Приоритетный порядок работ

1. Готово: инициализировать Git.
2. Готово: решить LF/CRLF policy в пользу LF.
3. Готово: добавить `docs/adr` и первые ADR.
4. Готово частично: добавить `tests/` и zero-dependency structural tests.
5. Готово: добавить `tools/Test-All.ps1`, `tools/Clean-Workspace.ps1`, `tools/Check-Structure.ps1`.
6. Готово локально: добавить CI workflow.
7. Готово: перенести `territory-patrol-panel` в `legacy`.
8. Готово: обновить `README.md` и `docs/monorepo-structure.md`.
9. Готово частично: xUnit/Vitest/Playwright подключены, следующий шаг - расширить smoke tests до сценарного покрытия.

## Обновленная оценка по структуре

| Направление | Готовность |
|---|---:|
| Monorepo layout | 90% |
| Backend layer split | 80% |
| Frontend placement | 80% |
| Infra placement | 75% |
| Docs placement | 85% |
| Tests structure | 45% |
| CI structure | 60% |
| Repository hygiene | 75% |
| Legacy separation | 90% |

После первого структурного прохода production-готовность структуры выше исходного состояния: добавлены Git, `tests`, `tools`, `docs/adr`, `docs/runbooks`, CI workflow, infra env-шаблон и legacy-раздел. Оставшиеся крупные риски: полноценные backend/frontend test frameworks еще не подключены, CI не проверен на удаленном Git-хостинге, generated artifacts все еще физически лежат в рабочей папке.

Главное условие роста до 90%: Git + tests + CI + единые правила source/generated/legacy.
