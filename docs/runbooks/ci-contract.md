# CI contract runbook

## Назначение

CI является обязательным gate для pull request и защищенных веток. Локальная команда `.\tools\Test-All.ps1` должна повторять тот же набор проверок, чтобы результат не отличался от GitHub Actions.

## Обязательные проверки

Workflow: `.github/workflows/ci.yml`

Jobs: `verify`, `db-integration`

Минимальный контракт job:

```powershell
dotnet restore .\Patrol360.slnx
dotnet build .\Patrol360.slnx --no-restore
dotnet format .\Patrol360.slnx --verify-no-changes --no-restore
dotnet run --project .\tests\Patrol360.Structure.Tests\Patrol360.Structure.Tests.csproj --no-restore
dotnet test .\Patrol360.slnx --no-build --logger trx --results-directory .\TestResults\dotnet
.\tools\Verify-TextEncoding.ps1
cd .\apps\web
npm ci
npm run verify
npm run test:ci
npx playwright install chromium
npm run test:e2e
```

`TreatWarningsAsErrors=true` applies to all .NET projects. NuGet advisories `NU1901`-`NU1904` are errors. Local restore keeps `NU1900` as a warning when the advisory service is temporarily unreachable, while CI explicitly rejects any restore output containing `NU1900`; an unavailable vulnerability audit cannot produce a green pull request.

Отдельный обязательный job `CI / PostgreSQL integration` поднимает PostgreSQL 17 и запускает:

```bash
PATROL360_RUN_DB_INTEGRATION=true \
PATROL360_DB_INTEGRATION_ADMIN_CONNECTION_STRING="Host=localhost;Port=5432;Database=postgres;Username=patrol360;Password=patrol360_dev" \
dotnet test ./tests/Patrol360.Infrastructure.Tests/Patrol360.Infrastructure.Tests.csproj \
  --configuration Release \
  --logger "trx;LogFileName=db-integration.trx"
```

Job дополнительно проверяет TRX-счетчик `notExecuted`: пропуск хотя бы одного теста завершает job ошибкой. Это не позволяет получить ложнозеленый результат при потере `PATROL360_RUN_DB_INTEGRATION=true`.

Локальный DB-backed профиль:

```powershell
docker compose -f .\infra\docker\compose.yaml up -d postgres
.\tools\Test-All.ps1 -IncludeDbIntegration
```

## Обязательные артефакты

CI публикует `test-results` через `actions/upload-artifact`:

- `TestResults/**`
- `apps/web/test-results/**`
- `apps/web/playwright-report/**`

DB job публикует отдельный артефакт `db-integration-results` из `TestResults/db-integration/**`.

Артефакты не коммитятся. Локально они очищаются через:

```powershell
.\tools\Clean-Workspace.ps1
```

## Pull request gate

Pull request считается готовым к merge только если:

- jobs `CI / verify` и `CI / PostgreSQL integration` зеленые;
- структурные проверки прошли;
- backend и frontend checks прошли;
- generated artifacts не попали в diff;
- документация обновлена, если изменились структура, API, БД, инфраструктура или workflow.

## Изменение CI-контракта

Любое изменение `.github/workflows/ci.yml`, `tools/Test-All.ps1`, `tests/Patrol360.Structure.Tests` или frontend test scripts должно:

- обновить этот runbook;
- обновить `docs/runbooks/branch-review-policy.md`, если меняются правила merge;
- пройти `.\tools\Test-All.ps1 -IncludeE2E`;
- пройти `.\tools\Test-All.ps1 -IncludeDbIntegration`, если менялись EF mappings, migrations или DB-backed lifecycle;
- быть отмечено в PR checklist.

## Remote protection

Branch protection применяется к удаленному GitHub-репозиторию через `tools/Set-GitHubBranchProtection.ps1`. Локальный репозиторий должен иметь `origin`, а GitHub CLI должен быть авторизован через `gh auth login`.
