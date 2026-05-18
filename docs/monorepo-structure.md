# Структура monorepo

Проект ведется как monorepo, потому что на первом этапе одновременно развиваются backend, frontend, worker, API-контракты, инфраструктура и документация. Это снижает риск рассинхронизации между вкладками интерфейса, API и доменной моделью.

План доработки структуры зафиксирован отдельно: `docs/structure-improvement-plan.md`.

## apps/api

ASP.NET Core API host.

Назначение:

- REST API `/api/v1`.
- Health endpoints.
- OpenAPI в следующем этапе.
- Browser/mobile/internal endpoint groups в будущем.
- Подключение application/infrastructure слоев.

Текущее состояние:

- Health endpoints.
- Seed read endpoints для dashboard и routes.

## apps/web

React + TypeScript + Vite frontend.

Назначение:

- Административная веб-панель.
- Операционные вкладки обходов территории.
- Пустые UI-состояния до подключения API, без фальшивого доменного наполнения.
- Локальные UI-черновики для проверки модалок и сценариев без backend.
- В будущем typed API client и design-token слой.

Текущее состояние:

- Перенесены вкладки: дашборд, результаты, назначения, сотрудники, планирование, мобильные аккаунты, маршруты и точки, пользователи сайта.
- Данные вкладок не заполнены seed-записями; интерфейс показывает пустые состояния и готов к API.
- Worklog намеренно отсутствует в первом UI-проходе.

## apps/worker

.NET Worker host.

Будущие задачи:

- Генерация отчетов.
- Импорт/экспорт.
- Outbox processing.
- Уведомления.
- Плановые фоновые операции.

Hangfire/RabbitMQ пока не подключены, границы будут закреплены после NFR discovery.

## libs/domain

Доменный слой без инфраструктурных зависимостей.

Содержит:

- сущности;
- value objects;
- доменные правила;
- инварианты.

## libs/application

Application слой.

Содержит:

- use cases;
- command/query contracts;
- интерфейсы портов;
- orchestration без деталей БД/очередей/файлов.

## libs/contracts

Контракты обмена.

Содержит:

- DTO для API;
- read-model contracts;
- схемы, которые позже будут синхронизироваться с OpenAPI.

## libs/infrastructure

Инфраструктурный слой.

Будущие реализации:

- EF Core + PostgreSQL;
- MinIO/S3 storage;
- Redis cache;
- RabbitMQ/MassTransit;
- FCM;
- document/report adapters.

Сейчас содержит временный read-store/scaffolding для раннего frontend/API skeleton; production persistence будет добавляться отдельно через PostgreSQL и EF Core.

## infra

Инфраструктурные артефакты разработки и deployment.

Сейчас:

- `infra/docker/compose.yaml` для PostgreSQL, Redis, RabbitMQ, MinIO.

Позже:

- nginx;
- monitoring;
- deployment manifests;
- runbooks.

## tests

Тестовая структура проекта.

Сейчас:

- `tests/Patrol360.Structure.Tests` - zero-dependency структурные проверки solution, project references и repository hygiene;
- `tests/Patrol360.Domain.Tests` - xUnit smoke tests доменного слоя;
- `tests/Patrol360.Application.Tests` - xUnit smoke tests application слоя;
- `tests/Patrol360.Infrastructure.Tests` - xUnit smoke tests infrastructure DI;
- `tests/Patrol360.Api.Tests` - xUnit smoke tests API assembly;
- `tests/Patrol360.Worker.Tests` - xUnit smoke tests worker assembly;
- `tests/web/unit` - frontend structural smoke tests;
- `tests/web/e2e` - место для будущих Playwright smoke tests.

Позже:

- расширить xUnit smoke tests до сценарных тестов;
- добавить Vitest;
- добавить Playwright smoke.

## tools

Локальные команды, которые повторяют CI-проверки и обслуживание рабочей папки.

Сейчас:

- `Verify-TextEncoding.ps1`;
- `Check-Structure.ps1`;
- `Clean-Workspace.ps1`;
- `Test-All.ps1`.

## legacy

Каталог для старых прототипов и материалов, которые больше не являются активной production-частью проекта.

Сейчас:

- `legacy/territory-patrol-panel` - старый статический UI-прототип без backend.

Legacy-код не должен участвовать в CI и новой feature-разработке.

## docs

Документация проекта ведется рядом с кодом.

Минимальный обязательный набор:

- `architecture.md`;
- `technology-stack.md`;
- `modules.md`;
- `tz-normalization.md`;
- ADR при принятии крупных решений.
