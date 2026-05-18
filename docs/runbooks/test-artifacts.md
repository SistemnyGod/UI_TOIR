# Test artifacts runbook

## Назначение

Отчеты тестов нужны для аудита структуры и регрессий: локально они помогают понять, какой слой упал, а в CI сохраняются как артефакты запуска.

## Локальный запуск

```powershell
.\tools\Test-All.ps1
```

Для e2e-проверки frontend и Playwright-отчетов:

```powershell
.\tools\Test-All.ps1 -IncludeE2E
```

Для .NET coverage collector, если он подключен в тестовых проектах:

```powershell
.\tools\Test-All.ps1 -CollectCoverage
```

## Пути артефактов

- `TestResults/dotnet/` - `.trx` отчеты .NET test.
- `TestResults/vitest/junit.xml` - JUnit отчет Vitest.
- `apps/web/test-results/playwright-junit.xml` - JUnit отчет Playwright.
- `apps/web/playwright-report/` - HTML отчет Playwright.

## Правила хранения

- Эти файлы являются generated artifacts и не коммитятся.
- CI публикует их через `actions/upload-artifact`.
- Перед коммитом можно очистить рабочую область командой:

```powershell
.\tools\Clean-Workspace.ps1
```
