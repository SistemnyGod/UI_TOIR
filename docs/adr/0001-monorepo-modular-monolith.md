# ADR 0001: Monorepo and modular monolith

Дата: 18.05.2026

## Статус

Принято.

## Контекст

Patrol360 одновременно развивает backend API, административный frontend, worker, контракты, инфраструктуру и документацию. На этапе MVP доменные границы еще уточняются, поэтому преждевременное выделение микросервисов увеличит стоимость интеграции, тестирования и деплоя.

## Решение

Вести проект как monorepo с modular monolith backend:

- `apps/api` - HTTP host и composition root;
- `apps/web` - административный React frontend;
- `apps/worker` - фоновые задачи;
- `libs/domain` - доменная модель;
- `libs/application` - use cases и порты;
- `libs/contracts` - публичные DTO/read models;
- `libs/infrastructure` - EF Core и инфраструктурные adapters;
- `tests` - тестовые проекты и frontend smoke/unit tests;
- `docs` - архитектура, ADR, runbooks;
- `infra` - локальная и будущая deployment-инфраструктура;
- `tools` - локальные проверки.

## Последствия

Плюсы:

- проще синхронизировать frontend, API contracts и доменную модель;
- проще проводить сквозные изменения в одном pull request;
- ниже операционная сложность MVP;
- можно проверять архитектурные границы локальными тестами.

Минусы:

- нужно дисциплинированно соблюдать правила зависимостей;
- нельзя превращать `libs/infrastructure` или `apps/api` в общий склад логики;
- CI должен проверять весь репозиторий, иначе monorepo быстро теряет управляемость.

## Проверка

Структурные правила проверяются через `tools/Check-Structure.ps1` и CI.
