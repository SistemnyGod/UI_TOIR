# Database migrations runbook

## Создание миграции

Команда выполняется из корня репозитория:

```powershell
dotnet ef migrations add <MigrationName> `
  --project .\libs\infrastructure\Patrol360.Infrastructure.csproj `
  --startup-project .\apps\api\Patrol360.Api.csproj `
  --context Patrol360DbContext
```

## Применение миграций локально

```powershell
dotnet ef database update `
  --project .\libs\infrastructure\Patrol360.Infrastructure.csproj `
  --startup-project .\apps\api\Patrol360.Api.csproj `
  --context Patrol360DbContext
```

## Правила

- Миграции живут только в `libs/infrastructure/Persistence/Migrations`.
- EF entities не используются как API contracts.
- Перед миграцией нужно прогнать `.\tools\Test-All.ps1`.
- Для destructive migrations нужен отдельный ADR или release note.
