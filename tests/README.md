# Tests

Тестовая структура разделяет backend, frontend и архитектурные проверки.

## Текущий состав

- `Patrol360.Structure.Tests` - zero-dependency runner для проверки структуры solution, правил project references и repository hygiene.
- `Patrol360.Domain.Tests` - xUnit smoke tests для доменного слоя.
- `Patrol360.Application.Tests` - xUnit smoke tests для application слоя.
- `Patrol360.Infrastructure.Tests` - xUnit smoke tests для infrastructure DI.
- `Patrol360.Api.Tests` - xUnit smoke tests для API assembly.
- `Patrol360.Worker.Tests` - xUnit smoke tests для worker assembly.
- `web/unit` - frontend structural/unit smoke tests без дополнительных npm-зависимостей.
- `web/e2e` - место для будущих Playwright smoke tests.

## Следующий шаг

Расширить smoke tests до сценарных тестов и добавить frontend Vitest/Playwright coverage.
