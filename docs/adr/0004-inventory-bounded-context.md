# ADR 0004: Inventory bounded context

Дата: 20.05.2026

## Статус

Принято.

## Контекст

В Patrol360 планируется перенести Web-инвентарь из проекта `inventory_app`. Текущий Inventory покрывает сотрудников, номенклатуру, склад, выдачу, возврат, списание, СИЗ, выдачу под запись, отчеты, пользователей, права, системный журнал и пользовательские настройки интерфейса.

Patrol360 уже ведется как modular monolith с `apps/api`, `apps/web`, `apps/worker`, `libs/domain`, `libs/application`, `libs/contracts`, `libs/infrastructure`. В проекте уже есть домены обходов, сотрудников, пользователей сайта, ролей, permissions, мобильных аккаунтов и результатов обходов.

Главный риск переноса - смешать похожие термины разных доменов:

- `Assignment` в Patrol означает назначение обхода.
- `Assignment` в Inventory означает выданный предмет на руках.
- `Document` в Inventory означает документ выдачи/возврата/списания, а не общий файл.
- `Report` должен быть общим shell, но бизнес-payload остается у владельца домена.

## Решение

Добавлять Inventory как отдельный bounded context внутри существующего modular monolith Patrol360.

Целевые домены платформы:

- `Identity` - web users, roles, permissions, sessions, user preferences.
- `Employees/Org` - сотрудники, должности, подразделения, архив.
- `Audit` - системный журнал и security/audit events.
- `Files` - файлы, версии, export artifacts.
- `Reports` - общий report shell и report jobs.
- `Patrol` - маршруты, точки, обходы, назначения, результаты, mobile accounts.
- `Inventory` - номенклатура, склад, операции, СИЗ, под запись, настройки и инвентарные отчеты.

Inventory должен быть разделен внутри себя:

- `Inventory.Catalog`;
- `Inventory.Stock`;
- `Inventory.Operations`;
- `Inventory.Custody`;
- `Inventory.Ppe`;
- `Inventory.Reports`;
- `Inventory.Settings`.

API Inventory размещать под `/api/v1/inventory/...`.

Общие API остаются вне Inventory:

- `/api/v1/auth`;
- `/api/v1/me` или `/api/v1/auth/me`;
- `/api/v1/employees`;
- `/api/v1/users` или `/api/v1/site-users`;
- `/api/v1/audit`;
- `/api/v1/reports`;
- `/api/v1/files`.

Старый Inventory endpoint `/api/state` не переносится. Его функции должны быть разделены на `/api/v1/me`, `/api/v1/inventory/overview` и dedicated domain queries.

## База данных

Для объединенной платформы принят целевой вариант с PostgreSQL schemas:

```text
identity
org
audit
files
reports
patrol
inventory
staging_inventory
```

Если существующие Patrol tables пока живут в default schema, перенос на схемы можно выполнить отдельной технической миграцией. Новые Inventory tables не должны добавляться в default schema без отдельного решения.

`staging_inventory` используется только для миграционной копии БД, crosswalk, validation reports и exception reports. Она не является runtime-схемой приложения.

## Правила именования

В коде и контрактах:

- использовать `PatrolAssignment` для назначений обходов;
- использовать `InventoryAssignment` для выданных предметов;
- использовать `InventoryDocument` для документов выдачи/возврата/списания;
- использовать `PpeCard`, `PpeCardLine`;
- использовать `CustodyDocument`, `CustodyRecord`.

Запрещено добавлять общий тип `Assignment` в публичные contracts без доменного префикса.

## Порядок переноса

Первый перенос должен быть read-only:

1. `Inventory.Catalog`;
2. `Inventory.Stock` read model;
3. parity counts/sums с текущим Python API;
4. только после этого write-сценарии.

Полная очередность:

1. Identity/RBAC/Preferences parity.
2. Employees/Org parity.
3. Inventory.Catalog.
4. Inventory.Stock.
5. Inventory.Operations.
6. Inventory.Custody.
7. Inventory.Ppe.
8. Inventory.Reports/Files.
9. Inventory.Settings.
10. Frontend integration in `apps/web`.

## Проверка

Перед включением каждого Inventory-модуля:

- API parity со старым Python backend;
- PostgreSQL integration tests;
- permission tests для admin/operator/guest;
- migration crosswalk and validation report;
- report/export totals parity;
- browser smoke;
- rollback switch.

Базовые артефакты подготовки живут в `inventory_app`:

- `docs/inventory-api-contracts.md`;
- `docs/inventory-db-map.md`;
- `docs/inventory-ui-scenarios.md`;
- `docs/inventory-report-map.md`;
- `docs/inventory-migration-risk-register.md`;
- `docs/inventory-transfer-readiness.md`;
- `output/inventory-migration-readiness-baseline.json`.

## Последствия

Плюсы:

- Inventory переносится управляемо и не ломает Patrol.
- Общие сотрудники, пользователи, аудит, файлы и отчеты получают единые платформенные границы.
- Сохраняется возможность дальнейшего выделения Inventory в отдельный сервис, если это понадобится.

Минусы:

- Нужна дисциплина в именовании и слоях.
- Придется поддерживать parity-проверки до завершения переноса.
- Существующие Patrol tables в default schema могут потребовать отдельной нормализации схем.
