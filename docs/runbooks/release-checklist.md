# Release checklist

## Перед релизом

- `.\tools\Test-All.ps1` проходит локально.
- CI зеленый.
- Нет незакоммиченных generated artifacts.
- `docs/architecture.md`, `docs/modules.md` и профильные планы не противоречат фактическому состоянию.
- Миграции БД проверены на локальной базе.
- Frontend smoke по основным экранам пройден.
- Auth/RBAC изменения проверены отдельно, если затронуты.

## Минимальные проверки

```powershell
dotnet restore .\Patrol360.slnx
dotnet build .\Patrol360.slnx --no-restore
dotnet run --project .\tests\Patrol360.Structure.Tests\Patrol360.Structure.Tests.csproj --no-restore
.\tools\Verify-TextEncoding.ps1
cd .\apps\web
npm ci
npm run verify
npm run test:run
npm run test:e2e
```
