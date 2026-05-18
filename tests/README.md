# Tests

Тестовая структура разделяет backend, frontend и архитектурные проверки.

## Текущий каркас

- `Patrol360.Structure.Tests` - zero-dependency runner для проверки структуры solution, правил project references и repository hygiene.
- `Patrol360.Domain.Tests` - место под будущие доменные тесты.
- `Patrol360.Application.Tests` - место под будущие application tests.
- `Patrol360.Infrastructure.Tests` - место под будущие infrastructure tests.
- `Patrol360.Api.Tests` - место под будущие API tests.
- `Patrol360.Worker.Tests` - место под будущие worker tests.
- `web/unit` - frontend structural/unit smoke tests без дополнительных npm-зависимостей.
- `web/e2e` - место для будущих Playwright smoke tests.

## Следующий шаг

Когда будет разрешен restore внешних test packages, добавить:

- `Patrol360.Domain.Tests`
- `Patrol360.Application.Tests`
- `Patrol360.Infrastructure.Tests`
- `Patrol360.Api.Tests`
- `Patrol360.Worker.Tests`

Эти проекты должны быть добавлены в `Patrol360.slnx` и запускаться из `tools/Test-All.ps1`.
