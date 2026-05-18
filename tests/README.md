# Tests

Тестовая структура разделяет backend, frontend и архитектурные проверки.

## Текущий состав

- `Patrol360.Structure.Tests` - zero-dependency runner для проверки структуры solution, правил project references и repository hygiene.
- `Patrol360.Domain.Tests` - xUnit scenario smoke tests для маршрута и назначения обхода.
- `Patrol360.Application.Tests` - xUnit scenario smoke tests для result contracts application слоя.
- `Patrol360.Infrastructure.Tests` - xUnit smoke tests для infrastructure DI и application ports.
- `Patrol360.Api.Tests` - xUnit scenario smoke tests для routes controller.
- `Patrol360.Worker.Tests` - xUnit smoke tests для worker assembly.
- `apps/web/src/__tests__` - Vitest smoke tests для UI primitives и frontend domain workflows.
- `web/unit` - frontend structural smoke tests без дополнительных npm-зависимостей.
- `web/e2e` - Playwright smoke tests для frontend shell.

## Следующий шаг

Расширить сценарные smoke tests до DB-backed integration tests и основных пользовательских e2e-потоков.
