# Патруль 360

Monorepo для новой веб-системы обходов территории.

Основной целевой стек:

- Backend: ASP.NET Core на C#.
- Frontend: React + TypeScript + Vite.
- Worker: .NET Worker для фоновых задач.
- БД и инфраструктура: PostgreSQL, Redis, RabbitMQ, MinIO через `infra/docker`.

Текущий этап: skeleton проекта и перенос вкладок интерфейса без backend-интеграции.
Frontend уже имеет переключатель источника данных `Mock/API`; API-режим подключен к текущим endpoint-ам dashboard и routes.

## Структура

```text
apps/
  api/       ASP.NET Core API host
  web/       React + TypeScript + Vite frontend
  worker/    .NET Worker host
libs/
  domain/          доменные типы
  application/     use cases, query/command interfaces
  contracts/       DTO/API contracts
  infrastructure/  инфраструктурные реализации
docs/
  architecture.md
  technology-stack.md
  modules.md
  monorepo-structure.md
  tz-normalization.md
infra/
  docker/    локальные PostgreSQL/Redis/RabbitMQ/MinIO
tests/
  Patrol360.Structure.Tests/      структурные проверки solution и слоев
  Patrol360.Domain.Tests/         каркас будущих доменных тестов
  Patrol360.Application.Tests/    каркас будущих application-тестов
  Patrol360.Infrastructure.Tests/ каркас будущих infrastructure-тестов
  Patrol360.Api.Tests/            каркас будущих API-тестов
  Patrol360.Worker.Tests/         каркас будущих worker-тестов
  web/                            frontend smoke/unit/e2e каркас
tools/
  локальные проверки и утилиты
legacy/
  territory-patrol-panel/     старый статический UI-прототип без backend
```

## Локальный запуск

Backend API:

```powershell
dotnet run --project .\apps\api\Patrol360.Api.csproj
```

Frontend:

```powershell
cd .\apps\web
npm install
npm run dev
```

Для прямого обращения frontend к backend без Vite proxy можно задать `VITE_API_BASE_URL` по примеру `apps/web/.env.example`.

Проверка сборки:

```powershell
dotnet build .\Patrol360.slnx
.\tools\Verify-TextEncoding.ps1
cd .\apps\web
npm run verify
```

Единая локальная проверка структуры, backend, frontend и кодировки:

```powershell
.\tools\Test-All.ps1
```

С e2e smoke-тестом frontend:

```powershell
.\tools\Test-All.ps1 -IncludeE2E
```

## Текущие API endpoints

- `GET /health/live`
- `GET /health/ready`
- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/active-assignments`
- `GET /api/v1/routes`
- `GET /api/v1/routes/{id}`

## Frontend data-source

- `apps/web/src/api/contracts.ts` — временные typed DTO для текущих endpoint-ов.
- `apps/web/src/api/patrolData.ts` — mock/API клиенты и маппинг DTO в UI-модель.
- `apps/web/src/hooks/usePatrolDataSource.ts` — загрузка выбранного источника данных.
- Переключатель `Mock/API` находится в верхней панели интерфейса.

## Документация

- `docs/architecture.md` — целевая архитектура и границы приложений.
- `docs/technology-stack.md` — принятый технологический стек.
- `docs/modules.md` — модули системы и их функциональные границы.
- `docs/monorepo-structure.md` — правила структуры репозитория.
- `docs/structure-improvement-plan.md` — план и критерии доработки структуры.
- `docs/structure-remaining-work.md` — остаток работ по структуре до 90%+.
- `docs/runbooks/ci-contract.md` — обязательный CI gate и публикуемые test artifacts.
- `docs/runbooks/branch-review-policy.md` — правила веток, PR и ревью.
- `docs/stabilization.md` — текущие правила стабилизации и обязательные проверки.
- `docs/tz-normalization.md` — нормализация ТЗ перед MVP.
- `tools/Verify-TextEncoding.ps1` — проверка текстовых файлов на UTF-8 без BOM.
- `tools/Check-Structure.ps1` — структурные проверки solution и project references.
- `tools/Clean-Workspace.ps1` — очистка generated artifacts.
- `tools/Test-All.ps1` — единый локальный gate.
- `tools/Set-GitHubBranchProtection.ps1` — применение GitHub branch protection после настройки remote.
- `apps/web/playwright.config.ts` — Playwright smoke-конфигурация frontend.

## Ближайшие шаги

1. Подключить EF Core + Npgsql и заменить seed read-store на PostgreSQL.
2. Добавить OpenAPI-контракты.
3. Подключить frontend к API через typed client.
4. Добавить auth/RBAC skeleton.
5. Подключить MinIO для фото и файлов.
