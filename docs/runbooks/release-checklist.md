# Release checklist

## Перед релизом

- `.\tools\Test-All.ps1` проходит локально.
- CI зеленый.
- В CI опубликован артефакт `test-results`, если запуск падал или нужен аудит.
- Нет незакоммиченных generated artifacts.
- `docs/architecture.md`, `docs/modules.md` и профильные планы не противоречат фактическому состоянию.
- Миграции БД проверены на локальной базе.
- Frontend smoke по основным экранам пройден.
- Auth/RBAC изменения проверены отдельно, если затронуты.

## Минимальные проверки

```powershell
dotnet restore .\Patrol360.slnx
dotnet build .\Patrol360.slnx --no-restore
dotnet format .\Patrol360.slnx --verify-no-changes --no-restore
dotnet test .\Patrol360.slnx --no-build --logger trx --results-directory .\TestResults\dotnet
dotnet run --project .\tests\Patrol360.Structure.Tests\Patrol360.Structure.Tests.csproj --no-restore
.\tools\Verify-TextEncoding.ps1
cd .\apps\web
npm ci
npm run verify
npm run test:ci
npm run test:e2e
```
