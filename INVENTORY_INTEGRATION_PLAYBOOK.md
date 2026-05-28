# Inventory Integration Playbook

Рабочая инструкция для поэтапной интеграции интерфейса и механики Web-инвентаря в Patrol360.

Цель: переносить Inventory не одним большим изменением, а модулями с проверкой parity: данные, UI, права, отчеты, история и операции должны совпадать со старым Web-инвентарем.

## Базовые правила

1. Не переносить старый `/api/state` как архитектурный подход.
2. Не строить большие экраны из fallback-массивов на frontend.
3. Каждый экран Patrol360 должен работать через свой `/api/v1/inventory/*` endpoint.
4. Старую рабочую БД и пароль `admin` не менять.
5. Повторные импорты делать только из копии `inventory_app_migration_copy`.
6. Исторические данные не удалять физически без отдельного решения.
7. После каждого модуля проверять API counts, UI counts и smoke-сценарий.
8. Все действия, влияющие на склад, обязаны писать движение склада и историю.
9. Отчеты, печать, Excel, PDF и DOCX должны строиться из единого payload, а не из разных расчетов.
10. Если поведение старого проекта непонятно, сначала фиксировать правило в документации, затем переносить код.

## Порядок переноса

| Этап | Модуль | Что переносим | Готовность |
| --- | --- | --- | --- |
| 1 | Inventory.Catalog | Номенклатура, категории, единицы, карточка позиции | Read-only parity |
| 2 | Inventory.Stock | Остатки, движения, критические остатки | Counts/sums parity |
| 3 | Inventory.Operations | Выдача, возврат, списание, массовая выдача | Write smoke |
| 4 | Inventory.Custody | Под запись: акты, строки, действия, история | Full workflow smoke |
| 5 | Inventory.PPE | СИЗ: карточки, строки, нормы, печать | PPE print/export smoke |
| 6 | Inventory.Reports | Отчеты, суммы, export payload | UI = Excel/PDF |
| 7 | Inventory.Users | Пользователи, роли, права, архив | RBAC smoke |
| 8 | Inventory.Settings | Справочники, нормы, наборы, параметры | CRUD smoke |

## Общий шаблон переноса модуля

| Пункт | Что сделать |
| --- | --- |
| Старый источник | Найти экран, route, service и таблицы в старом `inventory_app` |
| Новый backend | Проверить или добавить endpoint в `InventoryController.cs` |
| DTO | Закрепить контракт в `libs/contracts/InventoryContracts.cs` |
| Service | Проверить query/command в `EfInventory*` service |
| Таблицы | Сверить EF entity и таблицы в schema `inventory` |
| UI | Подключить screen/component в `apps/web/src` |
| CSS | Использовать классы из `docs/inventory-interface-style.css` |
| Права | Проверить admin/operator/guest policy |
| История | Проверить запись в `inventory.system_log` или event table |
| Smoke | Сделать минимальный сценарий проверки |
| Parity | Сравнить counts/sums со старой копией БД |
| Документация | Обновить этот playbook или профильный документ домена |

## Модуль 1: Inventory.Catalog

### Старый источник

| Что | Где |
| --- | --- |
| Экран номенклатуры | `inventory_app/frontend` |
| Backend routes/items | `inventory_app/app` |
| Старый CSS | `inventory_app/app/web/static/styles.css` |
| Таблицы | `item`, `category`, `unit`, `warehouse`, `stock_move` |

### Новый Patrol360

| Что | Где |
| --- | --- |
| API | `GET /api/v1/inventory/items` |
| Stock API | `GET /api/v1/inventory/stock` |
| Settings API | `GET /api/v1/inventory/settings` |
| Controller | `apps/api/Controllers/InventoryController.cs` |
| Query | `libs/infrastructure/Persistence/EfInventoryCatalogQuery.cs` |
| Commands | `libs/infrastructure/Persistence/EfInventoryCatalogCommandService.cs` |
| DTO | `libs/contracts/InventoryContracts.cs` |
| UI | `apps/web/src/screens/InventoryScreen.tsx` |
| Repository | `apps/web/src/repositories/inventoryRepository.ts` |

### CSS

Использовать:

- `inventory-items-layout`
- `inventory-category-rail`
- `inventory-category-button`
- `inventory-category-button_active`
- `inventory-item-card`
- `inventory-table-wrap`
- `inventory-table`

### Механика

- Категории и единицы должны отображаться по имени, а не по legacy id.
- Поиск должен работать по названию, артикулу, категории и описанию.
- Карточка позиции должна показывать остатки, где выдано, кому выдано, историю движения и участие в нормах/наборах.
- Большие списки грузить только постранично.

### Parity checklist

- `inventory.items` count совпадает с legacy `item` count после импорта.
- Категории и единицы не пустые.
- Поиск находит позиции из рабочей БД.
- Нет зависимости UI от `/api/state`.
- На ширине 390px таблица контролируемо скроллится, текст не накладывается.

## Модуль 2: Inventory.Stock

### Механика

Остаток считается из `inventory.stock_moves`.

Правила:

- Приход увеличивает `QuantityDelta`.
- Выдача, списание и утрата уменьшают `QuantityDelta`.
- Возврат увеличивает `QuantityDelta`.
- PPE/custody moves должны ссылаться на связанную строку или запись, где это возможно.
- Нельзя проводить нулевое или отрицательное количество.
- Нельзя уходить в отрицательный остаток без отдельного разрешенного бизнес-правила.

### API

| Endpoint | Назначение |
| --- | --- |
| `GET /api/v1/inventory/stock` | Список остатков |
| `POST /api/v1/inventory/stock/initial` | Начальный остаток |
| `POST /api/v1/inventory/documents` | Операция склада |

### Parity checklist

- Сумма остатков совпадает с legacy checksum.
- Некорректные количества возвращают понятную ошибку.
- Операция видна в истории и системном журнале.

## Модуль 3: Inventory.Operations

### Что переносить

- Выдача сотруднику.
- Массовая выдача через наборы.
- Возврат.
- Списание.
- Проверка остатков.
- StockMove и история.

### UI

Использовать:

- `inventory-operations-screen`
- `inventory-operation-form`
- `inventory-operation-lines`
- `inventory-action-bar`
- `inventory-status-badge`

### Правила

- Любая write-операция должна быть атомарной.
- При ошибке по одной строке документ не должен частично применяться без явного partial-режима.
- Ошибка по остатку должна показывать предмет, доступный остаток и запрошенное количество.
- Возврат и списание должны ссылаться на исходную выдачу, если связь есть.

### Smoke

1. Создать временную позицию с остатком.
2. Выдать сотруднику.
3. Проверить остаток и историю.
4. Вернуть часть.
5. Списать часть.
6. Убедиться, что суммы и остатки изменились корректно.

## Модуль 4: Inventory.Custody / Под запись

### Данные

| Таблица | Назначение |
| --- | --- |
| `inventory.custody_documents` | Акты под запись |
| `inventory.custody_records` | Строки/записи под запись |
| `inventory.custody_record_events` | История строки |
| `inventory.stock_moves` | Складские движения |

### API

| Endpoint | Назначение |
| --- | --- |
| `GET /api/v1/inventory/custody/records` | Активные записи |
| `GET /api/v1/inventory/custody/documents` | Журнал актов |
| `GET /api/v1/inventory/custody/documents/{id}` | Детали акта |
| `POST /api/v1/inventory/custody/documents` | Создать акт |
| `POST /api/v1/inventory/custody/records/{id}/return` | Возврат |
| `POST /api/v1/inventory/custody/records/{id}/write-off` | Списание |
| `POST /api/v1/inventory/custody/records/{id}/loss` | Утрата |
| `POST /api/v1/inventory/custody/documents/{id}/close` | Закрыть акт |
| `POST /api/v1/inventory/custody/documents/{id}/archive` | Архивировать акт |

### Правила

- Закрытый акт нельзя редактировать.
- Архивные записи не попадают в активные списки без `includeArchived=true`.
- Возврат, списание и утрата пишут `stock_moves` и событие строки.
- Печать и экспорт берут данные из detail/payload, не из UI-state.

### CSS

- `inventory-custody-screen`
- `inventory-custody-board`
- `inventory-custody-records`
- `inventory-custody-detail`
- `inventory-record-card`
- `inventory-record-card_locked`
- `inventory-record-card_archived`

### Smoke

1. Создать акт с временной строкой.
2. Проверить активный список.
3. Закрыть акт.
4. Убедиться, что редактирование запрещено.
5. Архивировать.
6. Проверить, что активный список не содержит архивную запись.

## Модуль 5: Inventory.PPE / СИЗ

### Данные

| Таблица | Назначение |
| --- | --- |
| `inventory.ppe_cards` | Карточки СИЗ |
| `inventory.ppe_card_lines` | Строки СИЗ |
| `inventory.ppe_card_line_events` | История строк |
| `inventory.stock_moves` | Выдача/возврат/списание СИЗ |

### API

| Endpoint | Назначение |
| --- | --- |
| `GET /api/v1/inventory/ppe/cards?page=1&pageSize=25&includeLines=0` | Легкий журнал СИЗ |
| `GET /api/v1/inventory/ppe/cards/{id}` | Полная карточка со строками |
| `GET /api/v1/inventory/ppe/options` | Фильтры: подразделения, должности, статусы, номенклатура |
| `POST /api/v1/inventory/ppe/cards` | Создать карточку |
| `POST /api/v1/inventory/ppe/cards/{id}/confirm` | Подтвердить выдачу |
| `GET /api/v1/inventory/ppe/cards/{id}/print` | Печать/preview payload |
| `GET /api/v1/inventory/ppe/cards/{id}/export` | PDF/DOCX/Excel payload |

### Правила

- Журнал всегда грузить в легком режиме `includeLines=0`.
- Полные строки догружать только по `cardId`.
- Фильтры брать из `/ppe/options`, а не из полного state.
- Поиск сотрудника в модалке должен быть searchable combobox.
- В подборе СИЗ должен быть фильтр категории и поиск по названию, артикулу, категории.
- Наборы отображать выделяющимися карточками: название, количество позиций, категории, кнопка добавления.
- Печать, PDF и DOCX строить из detail/export payload.

### CSS

- `inventory-ppe-screen`
- `inventory-ppe-journal`
- `inventory-ppe-card`
- `inventory-ppe-detail`
- `inventory-ppe-issue-dialog`
- `inventory-ppe-source-card`
- `inventory-ppe-source-card_selected`
- `inventory-ppe-print-preview`

### Smoke

1. Открыть журнал СИЗ и проверить, что строки не грузятся в списке.
2. Открыть карточку и проверить detail endpoint.
3. Создать временную карточку.
4. Подтвердить выдачу.
5. Проверить печать, PDF и DOCX на непустой файл.
6. Проверить историю строк.

## Модуль 6: Inventory.Reports

### Правила

- Каждый отчет строится из серверного payload.
- UI, Excel и PDF используют одни и те же totals.
- Системный журнал виден только при праве `canViewSystemLog`.
- Большие отчеты принимают серверные фильтры: `page`, `pageSize`, `query`, `dateFrom`, `dateTo`, `status`, `employeeId`, `itemId`.

### Payload contract

Отчет должен возвращать:

- `rows`
- `total`
- `page`
- `pageSize`
- `pageCount`
- `totalAmountMinor`
- `sectionTotals`
- `appliedFilters`
- `generatedAt`

### Smoke

1. Выбрать отчет по остаткам.
2. Сравнить UI total и Excel total.
3. Сравнить UI total и PDF total.
4. Проверить, что operator/guest не видят системный журнал, если нет права.

## Модуль 7: Employees bridge

Сотрудники остаются отдельным bounded context, но Inventory использует их как справочник.

### Правила

- Inventory не должен физически удалять сотрудника.
- Архивный сотрудник не должен появляться в активном выборе без явного режима архива.
- Карточка сотрудника должна показывать: на руках, под запись, СИЗ, просрочку, историю, суммы, итоги по категориям.
- Экспорт карточки сотрудника должен совпадать с UI по суммам.

### API candidates

- `GET /api/v1/employees?page=1&pageSize=25`
- `GET /api/v1/employees/{id}/inventory-summary`
- `GET /api/v1/employees/{id}/inventory-history`
- `GET /api/v1/employees/{id}/ppe`
- `GET /api/v1/employees/{id}/custody`
- `GET /api/v1/employees/{id}/export`

## Модуль 8: Users, permissions, audit

### Правила

- Удаление пользователя только soft-delete/archive.
- Последнего администратора удалить нельзя.
- Self-delete запрещен без отдельного бизнес-правила.
- Создание, изменение, блокировка и архивирование пишутся в audit/system log.
- UI скрывает недоступные действия по роли, но backend все равно проверяет права.

### Smoke

1. Admin создает временного пользователя.
2. Operator не видит управление пользователями, если нет права.
3. Guest не может писать данные.
4. Последнего admin удалить нельзя.
5. Временный пользователь архивируется.

## Модуль 9: Settings and references

### Что переносить

- Категории.
- Единицы измерения.
- Склады.
- Нормы СИЗ.
- Наборы предметов.
- Наборы по должности.
- Параметры организации для печати.

### Правила

- Справочники должны иметь активный/архивный статус.
- Нельзя удалить справочник, если на него есть критичные связи.
- Нормы и наборы должны использовать реальные item ids, а не legacy names как единственный ключ.

## UI integration rules

### Общий каркас

Использовать классы:

- `inventory-shell`
- `inventory-screen`
- `inventory-screen-header`
- `inventory-kpi-grid`
- `inventory-kpi-card`
- `inventory-toolbar`
- `inventory-filter-grid`
- `inventory-table-wrap`
- `inventory-table`
- `inventory-detail-panel`
- `inventory-dialog`
- `inventory-empty`
- `inventory-error`
- `inventory-skeleton`

### Адаптивность

Проверять ширины:

- 1366px desktop
- 1024px tablet
- 768px narrow
- 390px mobile smoke

Требования:

- Текст не накладывается.
- Кнопки читаемы.
- Горизонтальный скролл допустим только внутри таблицы.
- Модалки не выходят за экран.
- KPI имеют одинаковую высоту в одной строке.

### Не переносить

- Старые хаотичные классы без назначения.
- Расчеты UI из полного `/api/state`.
- Дублирующие totals на frontend, если есть серверный payload.
- Физическое удаление исторических сущностей.
- Скрытые write-действия без backend permission guard.

## API standard

List endpoints возвращают:

```json
{
  "rows": [],
  "total": 0,
  "page": 1,
  "pageSize": 25,
  "pageCount": 0
}
```

Ошибки возвращают единообразно:

```json
{
  "ok": false,
  "error": {
    "code": "inventory.validation_error",
    "message": "Понятное сообщение для пользователя"
  }
}
```

Write endpoints должны возвращать измененную сущность или `{ ok: true, result }`, если controller уже использует стандартный wrapper.

## Data migration and crosswalk rules

- Legacy id хранить через crosswalk/import mapping.
- Повторный импорт должен быть идемпотентным.
- Failed/skipped rows не удалять из audit без решения.
- Одна пропущенная orphan-строка `ppe_card_line_event` допустима: в source copy нет родительской строки СИЗ.
- Все новые таблицы Inventory живут в schema `inventory`, общие сотрудники в `employees`.

## Проверки перед закрытием модуля

```powershell
.	ools\Verify-TextEncoding.ps1
npm run test --prefix apps\web
npm run typecheck --prefix apps\web
npm run build --prefix apps\web
```

Если полный `.	ools\Test-All.ps1` падает на `npm ci` с `EPERM unlink ... rollup/esbuild`, проверить frontend отдельными командами выше и зафиксировать это как блокировку Windows native module, не как дефект Inventory.

## Acceptance checklist

- API endpoint возвращает реальные данные из `patrol360`.
- UI использует API mode, не mock и не `/api/state`.
- Counts/totals сверены с import report.
- Права admin/operator/guest проверены.
- История/audit пишется для write-действий.
- Печать/export строятся из общего payload.
- Кодировка UTF-8 проверена.
- Документация обновлена.

## Решения, которые нельзя принимать молча

- Физическое удаление исторических данных.
- Изменение production Web-инвентаря.
- Изменение пароля `admin`.
- Изменение response shape публичного API без миграции frontend.
- Слияние Inventory с Patrol domain без ADR.
- Перевод write-модуля в production без smoke на копии БД.