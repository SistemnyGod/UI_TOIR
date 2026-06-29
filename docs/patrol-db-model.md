# Patrol DB Model

Дата: 2026-06-25

## Основные сущности

| Entity | Ответственность |
| --- | --- |
| `PatrolRequestEntity` | Заявка на обход, плановое время, маршрут, сотрудник, статус. |
| `AssignmentEntity` | Фактическое назначение сотрудника на маршрут и lifecycle обхода. |
| `PatrolResultEntity` | Итоговый результат обхода. |
| `PatrolResultPointEntity` | Результат конкретной точки: статус, комментарий, confirmationType. |
| `MobileOutboxOperationEntity` | Серверный журнал принятых mobile outbox-команд для идемпотентности. |
| `MobileFileEntity` | Загруженные мобильные фото/видео и связь с отчетом/точкой. |

## Инварианты

- Один `clientOperationId` не должен создавать два результата.
- Одна обязательная точка должна иметь итоговый статус `ok`, `issue` или `skipped` для успешной отправки.
- `manual` confirmationType не равен scan confirmation и должен быть виден в web-результате.
- Отмена задания не должна удалять уже собранный локальный отчет без серверной фиксации.

## Технический долг

- Вынести EF mappings Patrol/Mobile из `Patrol360DbContext` в `Persistence/Configurations/Patrol` и `Persistence/Configurations/Mobile`.
- Проверить индексы по assignment/request/result/outbox/file сценариям перед ростом production данных.
