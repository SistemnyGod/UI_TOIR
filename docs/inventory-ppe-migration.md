# Inventory.PPE Migration Package

Этот документ фиксирует, что нужно брать для переноса модуля СИЗ из текущего web-inventory в `Patrol360` и где это уже расположено в целевом проекте.

## Цель

Подготовить модуль `Inventory.PPE` так, чтобы:

- сохранить внешний вид журнала, правой панели, вкладок, кнопок и модалок;
- перенести backend и frontend независимо от общего inventory state;
- оставить явные точки подключения печати, PDF и DOCX;
- не гадать при следующем этапе read-only/read-write миграции.

## Что уже подготовлено в Patrol360

### Frontend

- Экран: `apps/web/src/screens/inventory/InventoryPpeScreen.tsx`
- Стили inventory shell: `apps/web/src/screens/inventory/inventoryWeb.css`
- Доменный конфиг СИЗ: `apps/web/src/screens/inventory/ppe/inventoryPpeConfig.ts`

### Backend

- Controller: `apps/api/Controllers/InventoryController.cs`
- PPE list/detail/actions/print endpoints:
  - `GET /api/v1/inventory/ppe/cards`
  - `GET /api/v1/inventory/ppe/cards/{id}`
  - `POST /api/v1/inventory/ppe/cards`
  - `PUT /api/v1/inventory/ppe/cards/{id}`
  - `PATCH /api/v1/inventory/ppe/cards/{id}/archive`
  - `POST /api/v1/inventory/ppe/cards/{id}/lines`
  - `PUT /api/v1/inventory/ppe/cards/{id}/lines/{lineId}`
  - `PATCH /api/v1/inventory/ppe/cards/{id}/lines/{lineId}/status`
  - `GET /api/v1/inventory/ppe/cards/{id}/history`
  - `GET /api/v1/inventory/ppe/cards/{id}/lines/history`
  - `GET /api/v1/inventory/ppe/cards/{id}/lines/{lineId}/history`
  - `GET /api/v1/inventory/ppe/cards/{id}/print`
- Dedicated module options endpoint:
  - `GET /api/v1/inventory/ppe/options`

### Contracts

- .NET contracts: `libs/contracts/InventoryContracts.cs`
- Web contracts: `apps/web/src/api/contracts.ts`
- Repository client: `apps/web/src/repositories/inventoryRepository.ts`

## Source -> Target map

| Source project | Patrol360 target |
| --- | --- |
| `frontend/src/screens/ppe/*` | `apps/web/src/screens/inventory/InventoryPpeScreen.tsx` |
| `frontend/src/screens/ppe/hooks/*` | постепенно выносить в `apps/web/src/screens/inventory/ppe/*` |
| `frontend/src/screens/ppe/print/*` | сначала держать в экране, потом вынести в `apps/web/src/screens/inventory/ppe/print/*` |
| `frontend/src/styles` PPE classes | `apps/web/src/screens/inventory/inventoryWeb.css` |
| Python PPE routes/services | `apps/api/Controllers/InventoryController.cs` + application/infrastructure inventory services |

## Состав PPE options

`GET /api/v1/inventory/ppe/options` возвращает единый payload для экрана СИЗ:

- `employees`
- `items`
- `settings`
- `statuses`

Это нужно для того, чтобы PPE не зависел от общих screen-level загрузок `employees + items + settings` в других inventory-модулях.

## Что считать UI parity для переноса

Нужно сохранить:

- журнал карточек СИЗ;
- KPI сверху;
- мастер создания/редактирования карточки;
- табы выбора позиций;
- правая панель/drawer карточки;
- история карточки и история строк;
- preview и действия печати.

Допустимо на первом read-only/read-write шаге:

- оставить PDF/DOCX/print на уже существующем backend endpoint;
- не подключать еще браузерную системную печать из нового layout;
- не выносить все внутренние куски экрана на компоненты за один этап.

## CSS и визуальная совместимость

Для переноса использовать уже подключенные inventory-классы из `inventoryWeb.css`.

Ключевые PPE-классы:

- `inventory-ppe-screen`
- `inventory-ppe-kpis`
- `inventory-ppe-layout`
- `inventory-ppe-journal`
- `inventory-ppe-detail`
- `inventory-ppe-drawer`
- `inventory-ppe-wizard`
- `inventory-ppe-picker`
- `inventory-ppe-picker-tabs`
- `inventory-ppe-picker-grid`
- `inventory-ppe-print-preview`

Если будущий layout Patrol360 меняется, контейнеры shell можно адаптировать, но сами PPE block-классы лучше оставить без переименования.

## Backend parity rules

Для полноценного переноса модуль должен опираться на такие правила:

- PPE карточка архивируется soft-delete сценарием;
- история карточки и строки не теряется;
- статусы строки меняются через отдельный action endpoint;
- print/export строятся из detail data, а не из списка;
- UI не должен собирать print payload из обрезанных list rows.

## Следующий безопасный этап

После этой подготовки можно делать следующий шаг без угадывания:

1. вынести внутренние subcomponents `InventoryPpeScreen` в `apps/web/src/screens/inventory/ppe/*`;
2. перевести экран на `getPpeCards + getPpeOptions + getPpeCard`;
3. после этого подключить реальную print parity проверку для PDF/DOCX.
