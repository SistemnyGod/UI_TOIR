# Patrol API Contract

Дата: 2026-06-25

Документ фиксирует текущие границы API модуля "Обходы". Детальные DTO остаются в `libs/contracts`.

| Endpoint group | Назначение | Compatibility |
| --- | --- | --- |
| `/api/v1/dashboard` | Сводка активных обходов, заявок, результатов и проблем. | Не менять shape без web migration. |
| `/api/v1/assignments` | Назначения сотрудников на маршруты, lifecycle и команды диспетчера. | Статусы отображать через label map. |
| `/api/v1/results` | Журнал и детали результатов обхода, точки, комментарии, вложения. | Должен показывать `skipped` и `manual`. |
| `/api/v1/routes` | Каталог маршрутов и точек NFC/QR. | NFC/QR uniqueness сохраняется. |
| `/api/v1/employees` | Справочник сотрудников для назначения. | Не использовать как security boundary для mobile отчетов. |
| `/api/v1/patrol-requests` | Заявки на обход территории. | Отмена должна быть видима для mobile sync. |
| `/api/v1/mobile-accounts` | Учетные записи мобильного приложения и привязки сотрудников. | Не ломать старые аккаунты и сессии. |
| `/api/v1/mobile` | Login/bootstrap/outbox/file upload для мобильного приложения. | Legacy `takePatrolRequest` сохраняется. |
| `/api/v1/mobile-sync` | Синхронизация/уведомления, если используется отдельно от `/mobile`. | Не удалять без проверки APK. |

## Outbox compatibility

Поддерживаемые patrol-команды:

- `takePatrolRequest` - legacy принять и сразу начать;
- `acceptPatrolRequest` - принять без старта;
- `releasePatrolRequest` - вернуть до старта;
- `startPatrolAssignment`;
- `pausePatrolAssignment`;
- `resumePatrolAssignment`;
- `handoffPatrolAssignment`;
- `scanPatrolPointNfc`;
- `scanPatrolPointQr`;
- `markPatrolPointOk`;
- `markPatrolPointIssue`;
- `completePatrolAssignment`.

Все команды обязаны иметь `clientOperationId`.

