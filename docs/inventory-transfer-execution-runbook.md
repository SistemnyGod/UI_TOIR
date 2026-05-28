# Inventory transfer execution runbook

Дата: 22.05.2026

Этот документ фиксирует безопасный порядок реального переноса Web-инвентаря в Patrol360.

## Обязательные правила

- Рабочую базу Web-инвентаря не менять.
- Пароль `admin` не менять автоматически.
- Реальный импорт выполнять только на копии или staging-базе.
- Перед импортом сохранить readiness baseline.
- После импорта сохранить новый readiness baseline и smoke-результаты.

## Подготовка PostgreSQL копии

1. Поднять PostgreSQL Patrol360:

```powershell
docker compose -f .\infra\docker\compose.yaml up -d postgres
```

2. Применить миграции Patrol360 к целевой копии:

```powershell
.\scripts\prepare-migration-database.ps1 -StartPostgres -ApplyMigrations
```

3. Проверить readiness baseline:

```powershell
.\scripts\export-migration-readiness.ps1 -OutputPath output\inventory-migration-readiness-baseline.json
```

## Dry-run импорта legacy Inventory

API должен быть запущен с доступом к целевой базе Patrol360.

```powershell
.\scripts\prepare-migration-database.ps1 -LegacyConnectionString "<legacy PostgreSQL connection string>" -ApiBaseUrl "http://127.0.0.1:5080" -DryRunImport
```

## Реальный импорт на копии

```powershell
.\scripts\prepare-migration-database.ps1 -LegacyConnectionString "<legacy PostgreSQL connection string>" -ApiBaseUrl "http://127.0.0.1:5080" -RunImport -IUnderstandThisIsCopy
```

После импорта:

```powershell
.\scripts\export-migration-readiness.ps1 -OutputPath output\inventory-migration-readiness-after-import.json
npm run typecheck --prefix apps\web
dotnet build .\Patrol360.slnx
node .\apps\web\e2e\run-playwright.mjs inventory-ppe-smoke.spec.ts
node .\apps\web\e2e\run-playwright.mjs inventory-custody-smoke.spec.ts
```

## Модули, уже подготовленные для UI/API parity

- `Inventory.PPE`: journal, wizard, drawer, repository hooks, print/detail smoke.
- `Inventory.Custody`: journal, composer, drawer, detail/history/actions, print endpoints, smoke.

## Следующий read-only этап

После успешного readiness baseline на копии БД начинать read-only parity с:

1. `Inventory.Catalog`;
2. `Inventory.Stock`;
3. `Inventory.Operations`;
4. `Inventory.Custody`;
5. `Inventory.PPE`;
6. `Inventory.Reports`.
