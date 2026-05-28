# Inventory DB Stabilization Runbook

Дата: 2026-05-21

Цель: после миграции Inventory не удалять данные вслепую, а сначала найти технический мусор, проверить связи и только потом выполнять ручную очистку.

## Что уже закрыто в коде

- Legacy-import больше не создает синтетические записи `Legacy item/category/unit/warehouse/employee/user` по умолчанию.
- Если в legacy-строке нет обязательного имени или логина, строка считается `skipped`.
- Старое поведение можно включить только явно через `InventoryLegacy:AllowSyntheticNames=true`.
- Сидер при старте нормализует базовые роли, права и admin display name в читаемый русский текст.
- Добавлен безопасный endpoint диагностики: `GET /api/v1/inventory/db-health`.
- В интерфейсе Inventory добавлена вкладка `Настройки -> Здоровье БД`.

## Безопасная диагностика

Перед любым удалением выполнить только `SELECT`:

```sql
select 'inventory_items' as table_name, id, legacy_id, name
from inventory_items
where name ilike 'Legacy item %'
union all
select 'inventory_categories', id, legacy_id, name
from inventory_categories
where name ilike 'Legacy category %'
union all
select 'inventory_units', id, legacy_id, name
from inventory_units
where name ilike 'Legacy unit %'
union all
select 'inventory_warehouses', id, legacy_id, name
from inventory_warehouses
where name ilike 'Legacy warehouse %';
```

```sql
select id, legacy_id, full_name, personnel_no
from employees
where full_name ilike 'Legacy employee %'
   or personnel_no ilike 'legacy-%';
```

```sql
select id, legacy_id, login, display_name
from site_users
where login ilike 'legacy-user-%';
```

```sql
select status, dry_run, count(*) as runs
from inventory_legacy_import_runs
group by status, dry_run
order by status, dry_run;
```

```sql
select item_id, warehouse_id, sum(quantity_delta) as balance
from inventory_stock_moves
group by item_id, warehouse_id
having sum(quantity_delta) < 0;
```

```sql
select legacy_id, count(*)
from inventory_items
where legacy_id is not null
group by legacy_id
having count(*) > 1;
```

## Что нельзя чистить автоматически

- Позиции номенклатуры, на которые есть складские движения.
- Сотрудников, на которых есть СИЗ, записи под ответственность, назначения или результаты обходов.
- Пользователей, если они привязаны к текущему RBAC или audit/system log.
- Import runs, если они нужны для сверки со старой базой.

## Ручная очистка

Удаление выполнять только после просмотра SELECT-результатов и проверки внешних ссылок. Минимально безопасный порядок:

1. Исправить записи, которые являются реальными, но попали с синтетическим названием.
2. Архивировать сомнительные справочники, если сущность поддерживает `is_archived`.
3. Удалять только полностью несвязанные технические строки.
4. После очистки повторить dry-run legacy import и проверить, что строки больше не создаются.

## Проверка через UI

1. Открыть `#inventory-settings`.
2. Перейти во вкладку `Здоровье БД`.
3. Проверить критичные замечания: отрицательные остатки, дубли `legacy_id`, failed import runs.
4. Проверить предупреждения: синтетические названия, нулевые движения.

Endpoint не изменяет данные и подходит для регулярной проверки после импорта.
