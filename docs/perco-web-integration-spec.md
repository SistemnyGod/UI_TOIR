# Интеграция PERCo-Web

Статус: этап 1 реализован, этап 2 подключает реальные методы PERCo-Web.

## Цель

Интеграция нужна, чтобы проект мог проверять подключение к PERCo-Web, синхронизировать сотрудников, загружать события проходов и строить интервалы присутствия сотрудников на территории.

## Найденный контракт PERCo-Web

Проверка `http://192.168.2.76/dev` показала, что `/dev` открывает SPA-интерфейс PERCo-Web, а не документацию API. Реальные методы найдены через frontend bundle и проверены запросами:

| Назначение | Метод |
| --- | --- |
| Авторизация | `POST /api/system/auth` |
| Сотрудники | `GET /api/users/staff/fullList` |
| События проходов | `GET /api/verify/events?page=1&rows=100` |

Учетные данные для проверки: логин `patrol`, пароль хранится в настройках и не выводится в UI/API.

## Настройки

Раздел находится в интерфейсе:

```text
Настройки -> Интеграции -> PERCo-Web
```

Вкладки:

1. Подключение
2. Синхронизация
3. Сопоставление сотрудников
4. Устройства вход/выход
5. Журнал ошибок

Поля подключения:

- включено;
- адрес сервера PERCo;
- логин;
- пароль/токен;
- часовой пояс предприятия;
- периодичность синхронизации сотрудников;
- периодичность синхронизации проходов;
- допуск до начала смены;
- допуск после окончания смены;
- путь проверки `/dev`;
- endpoint сотрудников;
- endpoint проходов.

## Backend API проекта

Публичные маршруты проекта остаются прежними:

```http
GET  /api/v1/integrations/perco/settings
PUT  /api/v1/integrations/perco/settings
POST /api/v1/integrations/perco/test-connection
POST /api/v1/integrations/perco/sync-employees
POST /api/v1/integrations/perco/sync-events
GET  /api/v1/integrations/perco/unmatched-employees
POST /api/v1/integrations/perco/match-employee
GET  /api/v1/integrations/perco/logs
```

## Правила синхронизации

- `sync-employees` загружает PERCo-сотрудников и записывает их в `perco_employee_links`.
- Общий справочник сотрудников проекта не удаляется и не перезаписывается PERCo.
- Автоматическое сопоставление выполняется по табельному номеру или нормализованному ФИО, только если совпадение единственное.
- Несопоставленные сотрудники остаются в статусе `UNMATCHED` и отображаются в UI.
- `sync-events` загружает события проходов через `/api/verify/events`, не создает дубли по `perco_event_id`.
- Направление определяется по зонам:
  - `Неконтролируемая территория -> Завод` = вход;
  - `Завод -> Неконтролируемая территория` = выход.
- По входам и выходам создаются `employee_presence_intervals`.

## Таблицы

- `perco_integration_settings`
- `perco_integration_logs`
- `perco_sync_state`
- `perco_employee_links`
- `perco_access_events`
- `employee_presence_intervals`

Секреты хранятся в защищенном виде. На чтение настроек frontend получает только признаки `hasPassword` и `hasToken`.

## Права

- `integrations.perco.view`
- `integrations.perco.manage`
- `integrations.perco.sync`
- `integrations.perco.match`
- `integrations.perco.logs.view`

## Проверка

- Проверка подключения должна авторизоваться через `/api/system/auth`, открыть `/dev` и проверить доступность endpoint сотрудников и проходов.
- Запуск синхронизации сотрудников должен заполнить `perco_employee_links`.
- Запуск синхронизации проходов должен заполнить `perco_access_events` и `employee_presence_intervals`.
- Повторная синхронизация не должна создавать дубли.
