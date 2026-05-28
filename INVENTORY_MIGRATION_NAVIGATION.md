# Навигация по переносу Web-инвентаря в Patrol360

Этот документ открывать первым при работе с переносом Inventory/Web-инвентаря. Он показывает, где что находится, откуда брать данные и для чего нужен каждый файл.

## Главное

| Что нужно | Где находится | Для чего |
| --- | --- | --- |
| Целевой проект Patrol360 | `C:\Users\AI_server\Desktop\Proekt obhod` | Новый `.NET`/React проект, куда переносится Inventory |
| Исходный Web-инвентарь | `C:\Users\AI_server\Desktop\Новая папка (2)\IT-inventarizaci\inventory_app` | Старый Python/React проект, источник бизнес-логики, UI и БД |
| Копия БД для переноса | PostgreSQL DB `inventory_app_migration_copy` в контейнере `inventory_app-db-1` | Безопасный источник данных для миграции, не рабочая БД |
| Целевая БД Patrol360 | PostgreSQL DB `patrol360` в контейнере `patrol360-postgres` | БД, куда импортирован Inventory |
| Integration playbook | `INVENTORY_INTEGRATION_PLAYBOOK.md` | Пошаговая инструкция переноса интерфейса и механики по модулям |
| Главный ADR | `docs/adr/0004-inventory-bounded-context.md` | Решение по Inventory bounded context и схемам БД |
| Отчет импорта | `docs/inventory-legacy-import-run-2026-05-20.md` | Что уже импортировано, counts, проблемы, проверки |
| CSS интеграции | `docs/inventory-interface-style.css` | Standalone CSS-пакет интерфейсов Inventory |
| Карта CSS | `docs/inventory-interface-map.md` | Какие CSS-классы использовать на каких экранах |
| PPE migration package | `docs/inventory-ppe-migration.md` | Карта переноса модуля СИЗ: экран, API, стили, печать, точки подключения |

## Что уже перенесено в БД

Перенос из `inventory_app_migration_copy` в `patrol360` выполнен успешно и повторен идемпотентно.

Итог повторного прохода:

| Метрика | Значение |
| --- | ---: |
| Таблиц обработано | 14 |
| Строк прочитано | 2255 |
| Строк добавлено | 0 |
| Строк обновлено | 2254 |
| Строк пропущено | 1 |

Пропущена одна строка `ppe_card_line_event`: в исходной копии это orphan-событие без связанной строки СИЗ.

Контрольные counts в Patrol360:

| Таблица | Строк |
| --- | ---: |
| `employees` | 174 |
| `inventory.categories` | 10 |
| `inventory.units` | 8 |
| `inventory.warehouses` | 1 |
| `inventory.items` | 1347 |
| `inventory.custody_documents` | 11 |
| `inventory.custody_records` | 11 |
| `inventory.custody_record_events` | 31 |
| `inventory.ppe_cards` | 24 |
| `inventory.ppe_card_lines` | 32 |
| `inventory.ppe_card_line_events` | 79 |
| `inventory.stock_moves` | 91 |
| `inventory.system_log` | 413 |

## Где backend Inventory в Patrol360

| Зона | Путь | Для чего |
| --- | --- | --- |
| API controller | `apps/api/Controllers/InventoryController.cs` | HTTP endpoints Inventory |
| API contracts | `libs/contracts/InventoryContracts.cs` | DTO для frontend/API |
| Application interfaces | `libs/application/IInventory*.cs` | Границы сервисов и queries |
| EF DbContext | `libs/infrastructure/Persistence/Patrol360DbContext.cs` | Маппинг таблиц Patrol360 и `inventory` schema |
| Catalog query | `libs/infrastructure/Persistence/EfInventoryCatalogQuery.cs` | Read-only каталог, остатки, настройки |
| Catalog commands | `libs/infrastructure/Persistence/EfInventoryCatalogCommandService.cs` | Создание/изменение справочников, позиций, операций |
| Workflow service | `libs/infrastructure/Persistence/EfInventoryWorkflowService.cs` | Под запись, СИЗ, история, отчеты, пользователи |
| Export service | `libs/infrastructure/Persistence/EfInventoryExportService.cs` | Excel/PDF/DOCX/print payload |
| Legacy import | `libs/infrastructure/Persistence/EfInventoryLegacyImportService.cs` | Импорт из старой БД Web-инвентаря |
| EF entities | `libs/infrastructure/Persistence/Entities/Inventory*.cs` | Табличные модели Inventory |
| EF migrations | `libs/infrastructure/Persistence/Migrations/*Inventory*.cs` | Создание schema/tables/crosswalk/import tables |

## Где frontend Inventory в Patrol360

| Зона | Путь | Для чего |
| --- | --- | --- |
| Inventory screen | `apps/web/src/screens/InventoryScreen.tsx` | Основной экран Inventory в Patrol360 |
| API repository | `apps/web/src/repositories/inventoryRepository.ts` | Вызовы `/api/v1/inventory/*` |
| API contracts | `apps/web/src/api/contracts.ts` | Frontend-типы API |
| Screen router | `apps/web/src/components/ScreenRouter.tsx` | Подключение Inventory как экрана |
| Global styles | `apps/web/src/styles.css` | Текущие стили приложения Patrol360 |
| CSS integration package | `docs/inventory-interface-style.css` | Стиль Web-инвентаря для аккуратного переноса |
| CSS usage map | `docs/inventory-interface-map.md` | Инструкция, какие классы ставить на какие компоненты |

## Где исходники старого Web-инвентаря

| Зона | Путь | Для чего брать |
| --- | --- | --- |
| Backend Python | `C:\Users\AI_server\Desktop\Новая папка (2)\IT-inventarizaci\inventory_app\app` | Бизнес-правила, старые routes, модели |
| Frontend source | `C:\Users\AI_server\Desktop\Новая папка (2)\IT-inventarizaci\inventory_app\frontend` | Реальные экраны, UX, тексты, сценарии |
| Static CSS | `C:\Users\AI_server\Desktop\Новая папка (2)\IT-inventarizaci\inventory_app\app\web\static\styles.css` | Исходный визуальный стиль Web-инвентаря |
| Migration docs | `C:\Users\AI_server\Desktop\Новая папка (2)\IT-inventarizaci\inventory_app\docs` | Карты доменов, API, БД, отчетов |
| Migration scripts | `C:\Users\AI_server\Desktop\Новая папка (2)\IT-inventarizaci\inventory_app\scripts` | Подготовка копии БД и baseline |
| Readiness baseline | `C:\Users\AI_server\Desktop\Новая папка (2)\IT-inventarizaci\inventory_app\output\inventory-migration-readiness-baseline.json` | Метрики исходной копии БД перед переносом |

## API, которые смотреть первыми

Базовый URL локального Patrol360 API: `http://127.0.0.1:5080`.

| Endpoint | Для чего |
| --- | --- |
| `GET /api/v1/inventory/overview` | Быстрая проверка, что Inventory данные видны |
| `GET /api/v1/inventory/items?page=1&pageSize=25` | Каталог/номенклатура |
| `GET /api/v1/inventory/stock?page=1&pageSize=25` | Остатки |
| `GET /api/v1/inventory/documents?page=1&pageSize=25` | Операции выдачи/возврата/списания |
| `GET /api/v1/inventory/custody/records?page=1&pageSize=25` | Под запись, активные записи |
| `GET /api/v1/inventory/custody/documents?page=1&pageSize=25` | Акты под запись |
| `GET /api/v1/inventory/ppe/cards?page=1&pageSize=25` | СИЗ карточки |
| `GET /api/v1/inventory/history?page=1&pageSize=25` | История |
| `GET /api/v1/inventory/reports?page=1&pageSize=25` | Отчеты |
| `GET /api/v1/inventory/system-log?page=1&pageSize=25` | Системный журнал |
| `POST /api/v1/inventory/legacy/import/dry-run` | Проверка импорта без записи |
| `POST /api/v1/inventory/legacy/import` | Реальный импорт из копии БД |

## Какие документы читать по порядку

1. `INVENTORY_MIGRATION_NAVIGATION.md` - этот файл, быстрый вход.
2. `INVENTORY_INTEGRATION_PLAYBOOK.md` - пошаговый перенос интерфейса и механики.
3. `docs/adr/0004-inventory-bounded-context.md` - архитектурное решение.
4. `docs/inventory-legacy-import-run-2026-05-20.md` - фактический импорт и counts.
5. `docs/inventory-interface-map.md` - как подключать UI-классы.
6. `docs/inventory-interface-style.css` - сам CSS-пакет.
7. `docs/inventory-ppe-migration.md` - отдельный пакет переноса модуля СИЗ.
8. `docs/inventory-remaining-work-2026-05-22.md` - что осталось доделать.
9. `docs/inventory-db-stabilization-runbook-2026-05-21.md` - БД/стабилизация.

## Как повторить импорт

Перед повтором убедиться, что источник доступен:

```powershell
cd "C:\Users\AI_server\Desktop\Новая папка (2)\IT-inventarizaci\inventory_app"
docker compose up -d db
docker exec inventory_app-db-1 pg_isready -U inventory -d inventory_app_migration_copy
```

В Patrol360 должен быть запущен API и PostgreSQL:

```powershell
cd "C:\Users\AI_server\Desktop\Proekt obhod"
docker compose -f .\infra\docker\compose.yaml --profile app up -d --build api
```

Импорт выполнять только из копии `inventory_app_migration_copy`, не из рабочей БД.

## Что проверять после импорта

Минимальная проверка:

```powershell
Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:5080/api/v1/inventory/overview"
Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:5080/api/v1/inventory/items?page=1&pageSize=1"
Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:5080/api/v1/inventory/ppe/cards?page=1&pageSize=1"
Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:5080/api/v1/inventory/history?page=1&pageSize=2"
```

Проверка кодировки:

```powershell
.\tools\Verify-TextEncoding.ps1
```

Полная проверка:

```powershell
.\tools\Test-All.ps1
```

Если `Test-All.ps1` падает на `npm ci` с `EPERM unlink ... rollup/esbuild`, это блокировка Windows native module в `node_modules`, а не ошибка миграции. В таком случае проверить frontend отдельно:

```powershell
npm run test --prefix apps\web
npm run typecheck --prefix apps\web
npm run build --prefix apps\web
```

## Правила безопасности

- Не менять рабочую БД Web-инвентаря.
- Не менять пароль `admin`.
- Повторные импорты делать только из `inventory_app_migration_copy`.
- Не удалять исторические данные физически.
- Failed import runs не чистить без отдельного решения: они полезны как audit trail.
- Один skipped orphan `ppe_card_line_event` допустим, потому что в исходной копии у него нет родительской строки.

## Что делать дальше

1. Использовать `INVENTORY_INTEGRATION_PLAYBOOK.md` как рабочую инструкцию переноса модулей.
2. Подключить Inventory CSS к `apps/web/src/screens/InventoryScreen.tsx`.
3. Разнести экран Inventory на модули: Catalog, Stock, Operations, Custody, PPE, Reports.
4. Для каждого модуля сверить API counts и UI counts.
5. Добавить E2E smoke по Inventory.Catalog.
6. После read-only parity перейти к операциям записи.

## Transfer execution runbook

- [docs/inventory-transfer-execution-runbook.md](./docs/inventory-transfer-execution-runbook.md) - безопасный порядок подготовки БД, dry-run импорта, реального импорта на копии и readiness baseline.

## Transfer status 2026-05-22

- [docs/inventory-transfer-status-2026-05-22.md](./docs/inventory-transfer-status-2026-05-22.md) - фактический статус dry-run, реального импорта, readiness после переноса и проверочных PDF/DOCX.
