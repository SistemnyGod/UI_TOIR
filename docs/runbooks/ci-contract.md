# CI contract runbook

## Назначение

CI является обязательным gate для pull request и защищенных веток. Локальная команда `.\tools\Test-All.ps1` должна повторять тот же набор проверок, чтобы результат не отличался от GitHub Actions.

## Обязательные проверки

Workflow: `.github/workflows/ci.yml`

Job: `verify`

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

## Обязательные артефакты

CI публикует `test-results` через `actions/upload-artifact`:

- `TestResults/**`
- `apps/web/test-results/**`
- `apps/web/playwright-report/**`

Артефакты не коммитятся. Локально они очищаются через:

```powershell
.\tools\Clean-Workspace.ps1
```

## Pull request gate

Pull request считается готовым к merge только если:

- job `CI / verify` зеленый;
- структурные проверки прошли;
- backend и frontend checks прошли;
- generated artifacts не попали в diff;
- документация обновлена, если изменились структура, API, БД, инфраструктура или workflow.

## Изменение CI-контракта

Любое изменение `.github/workflows/ci.yml`, `tools/Test-All.ps1`, `tests/Patrol360.Structure.Tests` или frontend test scripts должно:

- обновить этот runbook;
- обновить `docs/runbooks/branch-review-policy.md`, если меняются правила merge;
- пройти `.\tools\Test-All.ps1 -IncludeE2E`;
- быть отмечено в PR checklist.
