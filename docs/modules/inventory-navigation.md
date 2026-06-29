# Бухгалтерия / Inventory: навигация и связи модуля

## Назначение
Модуль `Бухгалтерия / Inventory` ведет учет сотрудников для выдачи, номенклатуры, СИЗ, документов под запись, операций движения и отчетов.

## Где находится
- Sidebar: `Бухгалтерия`.
- Основные маршруты: `/#inventory-overview`, `/#inventory-employees`, `/#inventory-items`, `/#inventory-issue`, `/#inventory-operations`, `/#inventory-custody`, `/#inventory-ppe`, `/#inventory-history`, `/#inventory-reports`, `/#inventory-settings`.
- Основные frontend-файлы: `InventoryScreen.tsx` и файлы в `apps/web/src/screens/inventory/`.

## Вкладки и действия
- `Обзор`: сводка по остаткам, операциям, СИЗ и истории.
- `Сотрудники учета`: импорт Excel, preview импорта, архивирование, справочники должностей/подразделений/групп.
- `Номенклатура`: категории, единицы, склады, позиции и остатки.
- `Выдача`: выдача, возврат, списание, создание операций.
- `Операции`: журнал движений и документов.
- `Под запись`: документы под ответственность, состав документа, история.
- `СИЗ`: личные карточки, строки СИЗ, печатные формы, история строк.
- `История`: аудит операций Inventory.
- `Отчеты`: остатки, движения, СИЗ, сотрудники, системный журнал.
- `Настройки`: справочники и реквизиты печатных форм.

## Backend и данные
- API namespace: `/api/v1/inventory`.
- Контроллер: `InventoryController`.
- Сервисы: inventory workflow/catalog/export services в `libs/infrastructure/Persistence`.
- Основные таблицы: `inventory.items`, `inventory.categories`, `inventory.units`, `inventory.warehouses`, `inventory.stock_moves`, `inventory.ppe_cards`, `inventory.ppe_card_lines`, `inventory.custody_records`, `inventory.system_logs`.

## Права доступа
- Просмотр: `inventory.view`, `inventory.stock.view`.
- Действия: `inventory.issue.manage`, `inventory.custody.manage`, `inventory.ppe.manage`, `inventory.items.manage`.
- Отчеты: `inventory.reports.view`, `inventory.reports.export`.
- Администрирование: `inventory.settings.manage`, `inventory.import`, `inventory.audit.view`, `inventory.users.manage`.

## Связи с другими модулями
- `Обход` и `ЭМУ` используют общий справочник сотрудников.
- `Управление пользователями` определяет доступ к Inventory.
- Печатные формы СИЗ и под запись используют данные сотрудников, номенклатуры и реквизитов организации.

## Приемочные проверки
- Импорт сотрудников не создает дубли по ФИО.
- Preview импорта не меняет БД до подтверждения.
- Без прав API возвращает `401/403`.
- Печатные формы строятся из тех же DTO, что и UI.
