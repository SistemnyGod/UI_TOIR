# ADR 0002: Layer dependency rules

Дата: 18.05.2026

## Статус

Принято.

## Контекст

В проекте уже есть понятное разделение на `apps` и `libs`, но без формального правила зависимостей новые файлы могут начать обходить application/domain слои и напрямую смешивать HTTP, EF Core, DTO и бизнес-логику.

## Решение

Зафиксировать допустимые зависимости:

```text
apps/api -> libs/application, libs/contracts, libs/infrastructure
apps/worker -> libs/application, libs/infrastructure
libs/infrastructure -> libs/application, libs/domain, libs/contracts
libs/application -> libs/domain, libs/contracts
libs/domain -> no project references
libs/contracts -> no project references
```

Дополнительные правила:

- controllers не должны содержать доменные алгоритмы;
- `domain` не зависит от ASP.NET, EF Core, PostgreSQL, Redis, RabbitMQ, MinIO и frontend;
- `contracts` не зависит от implementation layers;
- EF entities не выходят наружу как API contracts;
- worker использует application use cases, а не дублирует бизнес-логику API.

## Последствия

Плюсы:

- проще добавлять тесты на домен и application слой;
- проще заменить persistence adapters;
- contracts можно стабилизировать отдельно от EF entities.

Минусы:

- часть mapping-кода придется держать явно;
- для быстрых прототипов потребуется больше дисциплины.

## Проверка

Минимальная проверка зависимостей реализована в `tests/Patrol360.Structure.Tests`.
