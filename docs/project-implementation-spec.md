# ТЗ реализации проекта

Дата: 14.05.2026  
Статус: рабочий baseline для поэтапной реализации.

## 1. Назначение документа

Документ описывает, как реализовывать новую систему обходов территории после UI-прототипа. Он связывает архитектурный baseline, нормализацию ТЗ, модули, frontend-спецификацию и будущий backend в один практический план разработки.

Главная цель: перейти от прототипа вкладок к рабочей системе на `ASP.NET Core + React/TypeScript/Vite + PostgreSQL`, не ломая доменную модель и не делая преждевременный микросервисный split.

Документ не заменяет:

- `docs/ui-finalization-spec.md` - финальное ТЗ по UI;
- `docs/tz-normalization.md` - нормализация спорных доменных решений;
- `docs/architecture.md` - общий архитектурный baseline;
- `docs/modules.md` - функциональные границы модулей.

Этот документ отвечает на вопрос: в каком порядке и с какими приемочными критериями делать проект дальше.

## 2. Принятый технический baseline

| Контур | Решение |
|---|---|
| Backend | ASP.NET Core на C# |
| Frontend | React + TypeScript + Vite |
| Архитектура | Modular monolith + Clean Architecture + selective CQRS |
| База данных | PostgreSQL |
| ORM | EF Core + Npgsql |
| Фоновые задачи | .NET Worker, далее Hangfire |
| Очереди и события | RabbitMQ + outbox pattern, после стабилизации core-домена |
| Cache | Redis |
| Файлы | MinIO/S3-compatible storage |
| Realtime web | SignalR |
| Mobile push | FCM или совместимый адаптер для Android |
| Observability | Serilog + OpenTelemetry + Prometheus/Grafana |
| Документы | Gotenberg для PDF, Open XML SDK для DOCX, ClosedXML/CsvHelper для XLSX/CSV |
| Репозиторий | Monorepo |

Для первого production-ready релиза не делать отдельные микросервисы. Исключения допустимы только для внешнего document-service, если PDF/DOCX генерация потребует контейнерной изоляции.

## 3. Граница MVP

### 3.1. Входит в MVP

MVP должен закрывать базовый рабочий процесс обходов:

1. Администратор или оператор создает сотрудников.
2. Администратор создает мобильный аккаунт и привязывает к нему одного, нескольких или всех сотрудников.
3. Администратор создает маршруты и точки маршрута.
4. Оператор создает заявку на обход: дата, сотрудник, маршрут, необязательное время, уведомление сотруднику.
5. Из заявки появляется назначение или активный обход.
6. Обходчик проходит маршрут в мобильном контуре.
7. Система принимает результаты точек: время, статус, комментарий, фото/видео, замечание.
8. Оператор видит активный обход на дашборде.
9. Оператор открывает детальную панель обхода и видит точки в фактическом порядке прохождения.
10. Оператор просматривает журнал результатов и замечаний.

### 3.2. Не входит в MVP

- полноценный Worklog;
- сложная аналитика и тренды;
- конструктор отчетов;
- юридически значимые DOCX/PDF формы, если заказчик отдельно не подтвердит обязательность;
- Kubernetes как обязательная production-платформа;
- полный перенос старого Android-клиента без отдельного compatibility-решения;
- полноценная offline-синхронизация мобильного клиента, пока она не утверждена как обязательное требование.

## 4. Модули реализации

### 4.1. Auth / Users / RBAC

Назначение:

- вход пользователей веб-панели;
- роли и политики доступа;
- аудит изменения прав;
- профиль текущего пользователя.

Минимальный набор ролей:

| Роль | Назначение |
|---|---|
| Администратор | полный доступ к справочникам, пользователям, маршрутам и настройкам |
| Оператор | заявки, назначения, результаты, дашборд |
| Руководитель | просмотр, аналитика, экспорт |
| Аудитор | только чтение и аудит |

Backend должен использовать policy-based authorization. Проверки прав должны жить в application/domain policies, а не размазываться по UI.

### 4.2. Employees

Назначение:

- справочник сотрудников;
- ФИО, табельный номер, подразделение, должность, статус;
- участие в назначениях и мобильных аккаунтах.

Сотрудник не является логином в мобильное приложение. Это отдельная предметная сущность, которую можно привязать к мобильному аккаунту.

### 4.3. Mobile Accounts

Назначение:

- логин и пароль для мобильного приложения;
- привязка сотрудников к аккаунту;
- статус аккаунта, сессии, устройства;
- сброс пароля, блокировка, отвязка.

Правило модели:

- один мобильный аккаунт может быть привязан к одному сотруднику;
- один мобильный аккаунт может быть привязан к нескольким сотрудникам;
- один мобильный аккаунт может иметь режим доступа ко всем сотрудникам, если это подтверждено политикой безопасности;
- привязка и отвязка пишутся в audit.

### 4.4. Routes / Route Points / NFC

Назначение:

- создание и редактирование маршрутов;
- вложенные точки маршрута;
- порядок точек;
- NFC/QR/manual тип точки;
- требования к фото, комментарию и проверке;
- версионирование маршрутов.

Ключевое правило:

- одна NFC-метка может использоваться в разных маршрутах;
- внутри одной активной версии маршрута дубль NFC по умолчанию должен давать предупреждение или блокировку по отдельному решению;
- назначение всегда фиксирует конкретную версию маршрута, чтобы исторические результаты не менялись после редактирования маршрута.

### 4.5. Patrol Requests / Assignments

Назначение:

- создание заявки на проведение обхода;
- выбор даты, сотрудника, маршрута;
- необязательное время прохождения;
- уведомление сотруднику;
- статусы заявки и назначения.

Базовая форма создания заявки:

| Поле | Правило |
|---|---|
| Дата обхода | по умолчанию сегодня |
| Сотрудник | обязателен |
| Маршрут | обязателен |
| Время прохождения | необязательно |
| Уведомить сотрудника | включено по умолчанию |
| Комментарий | необязательно |
| Приоритет | обычный по умолчанию |

Статусы заявки:

| Статус | Описание |
|---|---|
| Draft | черновик, если оператор еще не отправил заявку |
| Sent | заявка отправлена сотруднику |
| Accepted | сотрудник принял обход |
| InProgress | обход начат |
| Completed | обход завершен |
| Cancelled | заявка отменена |
| Expired | заявка просрочена |

### 4.6. Active Patrols

Назначение:

- текущее состояние обхода;
- прогресс;
- время старта;
- фактический порядок прохождения точек;
- детали по каждой точке.

На дашборде таблица активных обходов должна быть упрощена:

| Колонка | Назначение |
|---|---|
| Сотрудник | кто проходит обход |
| Маршрут | название маршрута |
| Прогресс | бар и процент прохождения |

По клику на строку открывается боковая панель:

- сотрудник;
- маршрут;
- дата и время начала;
- общее время обхода;
- список точек по фактическому времени прохождения;
- статус каждой точки;
- комментарии;
- фото/видео;
- NFC/QR/manual факт подтверждения;
- отклонения и замечания.

Важно: обходчики могут проходить маршрут не по порядку справочника. Поэтому экран деталей сортирует точки по фактическому времени первого подтверждения, а не только по `seq_no`.

### 4.7. Inspections / Results / Issues

Назначение:

- журнал результатов прохождения точек;
- замечания;
- просрочки;
- неподтвержденные точки;
- фото и история действий;
- переход к связанной заявке или активному обходу.

Результат точки должен знать:

- assignment/patrol;
- route version;
- route point version;
- плановое время, если было;
- фактическое время;
- статус;
- комментарий;
- вложения;
- issue, если создано замечание.

### 4.8. Scheduling

Назначение:

- плановые обходы;
- день/ночь;
- недельный и месячный вид;
- исключения, замены, конфликты.

В MVP плановый обход допускается как базовый модуль без сложного автозаполнения. Его нельзя делать блокером для маршрутов, заявок, активных обходов и результатов.

### 4.9. Files / Attachments

Назначение:

- фото и видео с обходов;
- вложения замечаний;
- будущие отчеты;
- версии файлов;
- антивирусный статус.

MVP может начать с минимального файлового API, но модель должна сразу учитывать:

- `files`;
- `file_versions`;
- `file_links`;
- `av_status`;
- immutable-ссылки для исторических результатов.

### 4.10. Dashboard

Назначение:

- оперативная сводка;
- активные обходы;
- заявки смены;
- проблемные точки;
- последние инциденты;
- готовность данных;
- быстрые действия.

Дашборд не должен хранить отдельную бизнес-логику. Он читает агрегаты из read endpoints или read model.

## 5. Backend architecture

### 5.1. Структура слоев

Рекомендуемая структура:

```text
apps/
  api/
  worker/
  web/
libs/
  domain/
  application/
  contracts/
  infrastructure/
docs/
infra/
```

Ответственность:

| Слой | Ответственность |
|---|---|
| domain | сущности, value objects, enum, доменные правила |
| application | use cases, команды, запросы, политики, транзакционные сценарии |
| contracts | DTO, request/response, OpenAPI-friendly модели |
| infrastructure | EF Core, PostgreSQL, MinIO, Redis, RabbitMQ, FCM, внешние интеграции |
| api | HTTP endpoints, auth, validation, OpenAPI, middleware |
| worker | background jobs, outbox, уведомления, отчеты |
| web | React UI, typed client, состояние экранов |

### 5.2. Правила backend-кода

- Контроллеры или minimal endpoints не должны содержать бизнес-логику.
- Все write-сценарии проходят через application use case.
- Все изменения критичных сущностей пишутся в audit.
- Время хранить в UTC, отображать в локальной зоне пользователя.
- Для изменяемых сущностей использовать optimistic locking.
- Для тяжелых операций использовать job model, а не долгий HTTP-запрос.
- Для повторяемых команд предусмотреть idempotency key.
- Все ошибки отдавать в `application/problem+json`.

### 5.3. API conventions

Базовый namespace: `/api/v1`.

Общие правила:

- `GET` для чтения;
- `POST` для команд создания и действий;
- `PUT` для полного обновления;
- `PATCH` использовать только если есть четкая partial-update модель;
- `DELETE` для удаления только там, где нет исторической зависимости;
- для архивирования использовать отдельную команду, если сущность участвует в истории.

Стандартные query-параметры списков:

| Параметр | Назначение |
|---|---|
| `page` | номер страницы |
| `pageSize` | размер страницы |
| `sort` | поле сортировки |
| `direction` | `asc` или `desc` |
| `search` | полнотекстовый или contains-поиск |
| `status` | фильтр статуса |
| `from` / `to` | временное окно |

Стандартный envelope для списков:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

### 5.4. Error model

Все ошибки API возвращаются в формате `problem+json`.

Минимальные типы:

| Type | HTTP | Когда |
|---|---:|---|
| `validation_error` | 400 | ошибка формы или DTO |
| `unauthorized` | 401 | нет входа |
| `forbidden` | 403 | нет прав |
| `not_found` | 404 | сущность не найдена |
| `conflict` | 409 | конфликт версии, занятость, дубль |
| `business_rule_violation` | 422 | доменное правило запрещает операцию |
| `rate_limited` | 429 | превышен лимит |
| `internal_error` | 500 | непредвиденная ошибка |

Для валидации полей нужен `errors` dictionary:

```json
{
  "type": "validation_error",
  "title": "Ошибка валидации",
  "status": 400,
  "traceId": "00-...",
  "errors": {
    "employeeId": ["Сотрудник обязателен"]
  }
}
```

## 6. Database baseline

### 6.1. Общие правила БД

- Все primary keys: `uuid`.
- Все даты: `timestamptz`.
- Статусы: `smallint` + enum в коде.
- Исторические сущности не удалять физически.
- Для справочников использовать `is_archived` или `status`.
- Для критичных таблиц добавить `created_at`, `created_by`, `updated_at`, `updated_by`.
- Для конкурентного редактирования добавить `lock_version`.
- Для аудита использовать отдельную таблицу `audit_log`.

### 6.2. Таблицы MVP

Минимальный набор таблиц:

```text
users
roles
permissions
user_roles
role_permissions

employees
mobile_accounts
mobile_account_employees
mobile_sessions
device_tokens

routes
route_versions
route_point_versions

patrol_requests
assignments
assignment_events
active_patrols
patrol_point_visits

inspections
issues

files
file_versions
file_links

schedule_rules
schedule_entries
schedule_exceptions

audit_log
outbox_messages
```

### 6.3. Route versioning

Маршрут редактируется через версии:

- `routes` хранит бизнес-идентичность маршрута;
- `route_versions` хранит опубликованные и черновые версии;
- `route_point_versions` хранит точки конкретной версии;
- `assignments.route_version_id` фиксирует версию на момент назначения;
- `inspections.route_point_version_id` фиксирует точку на момент результата.

Нельзя строить исторический результат на текущих `routes/points`, иначе старые обходы будут искажаться после редактирования маршрута.

### 6.4. Mobile account bindings

Мобильный аккаунт и сотрудник связываются через M:N таблицу:

```text
mobile_account_employees
  id
  mobile_account_id
  employee_id
  attached_at
  detached_at
  attached_by
```

Если нужен режим "все сотрудники", добавить в `mobile_accounts` поле `employee_scope`:

| Значение | Описание |
|---|---|
| `SpecificEmployees` | только явно привязанные сотрудники |
| `AllEmployees` | доступ ко всем активным сотрудникам |

## 7. API endpoint baseline

### 7.1. Routes

| Метод | Endpoint | Назначение |
|---|---|---|
| GET | `/api/v1/routes` | список маршрутов |
| POST | `/api/v1/routes` | создать маршрут |
| GET | `/api/v1/routes/{id}` | карточка маршрута |
| PUT | `/api/v1/routes/{id}` | обновить метаданные |
| POST | `/api/v1/routes/{id}/archive` | архивировать |
| POST | `/api/v1/routes/{id}/versions` | создать новую версию |
| POST | `/api/v1/routes/{id}/versions/{versionId}/publish` | опубликовать версию |
| POST | `/api/v1/routes/{id}/versions/{versionId}/points` | добавить точку |
| PUT | `/api/v1/route-points/{pointId}` | обновить точку версии |
| POST | `/api/v1/routes/{id}/versions/{versionId}/points/reorder` | изменить порядок |

### 7.2. Employees and mobile accounts

| Метод | Endpoint | Назначение |
|---|---|---|
| GET | `/api/v1/employees` | список сотрудников |
| POST | `/api/v1/employees` | создать сотрудника |
| GET | `/api/v1/employees/{id}` | карточка сотрудника |
| PUT | `/api/v1/employees/{id}` | обновить сотрудника |
| POST | `/api/v1/employees/{id}/archive` | архивировать сотрудника |
| GET | `/api/v1/mobile-accounts` | список мобильных аккаунтов |
| POST | `/api/v1/mobile-accounts` | создать аккаунт |
| POST | `/api/v1/mobile-accounts/{id}/reset-password` | сбросить пароль |
| POST | `/api/v1/mobile-accounts/{id}/attach-employee` | привязать сотрудника |
| POST | `/api/v1/mobile-accounts/{id}/detach-employee` | отвязать сотрудника |
| POST | `/api/v1/mobile-accounts/{id}/block` | заблокировать |
| POST | `/api/v1/mobile-accounts/{id}/unblock` | разблокировать |

### 7.3. Patrol requests and active patrols

| Метод | Endpoint | Назначение |
|---|---|---|
| GET | `/api/v1/patrol-requests` | список заявок |
| POST | `/api/v1/patrol-requests` | создать заявку |
| GET | `/api/v1/patrol-requests/{id}` | карточка заявки |
| POST | `/api/v1/patrol-requests/{id}/send` | отправить сотруднику |
| POST | `/api/v1/patrol-requests/{id}/cancel` | отменить заявку |
| POST | `/api/v1/assignments/{id}/start` | начать обход |
| POST | `/api/v1/assignments/{id}/complete` | завершить обход |
| GET | `/api/v1/active-patrols` | активные обходы |
| GET | `/api/v1/active-patrols/{id}` | детали активного обхода |

### 7.4. Results and inspections

| Метод | Endpoint | Назначение |
|---|---|---|
| GET | `/api/v1/results` | журнал результатов |
| GET | `/api/v1/inspections/{id}` | детальный результат точки |
| POST | `/api/v1/inspections` | принять результат точки |
| POST | `/api/v1/issues` | создать замечание |
| POST | `/api/v1/issues/{id}/close` | закрыть замечание |

### 7.5. Dashboard

| Метод | Endpoint | Назначение |
|---|---|---|
| GET | `/api/v1/dashboards/summary` | KPI и счетчики |
| GET | `/api/v1/dashboards/operations` | оперативная сводка |
| GET | `/api/v1/dashboards/active-patrols` | упрощенная таблица активных обходов |
| GET | `/api/v1/dashboards/incidents` | последние инциденты |

## 8. Frontend implementation plan

### 8.1. Цель frontend-этапа

Перевести UI из прототипа в API-ready приложение:

- крупные экраны разбиты на компоненты;
- все действия имеют понятную логику;
- все формы используют единые правила валидации;
- локальные данные можно заменить API без переписывания экранов;
- пустые состояния остаются рабочими;
- фальшивые seed-данные не используются как будто это реальные данные.

### 8.2. Структура frontend

Рекомендуемая структура:

```text
apps/web/src/
  api/
    client.ts
    dataSource.ts
    routesApi.ts
    employeesApi.ts
    patrolRequestsApi.ts
    resultsApi.ts
  components/
    ui/
    layout/
    tables/
    modals/
    drawers/
  domain/
    routes/
    employees/
    patrols/
    results/
    mobileAccounts/
  hooks/
  screens/
  styles/
```

### 8.3. Data source switch

Frontend должен поддерживать переключатель:

| Источник | Назначение |
|---|---|
| `mock` | локальная работа без backend |
| `api` | реальные HTTP-запросы |

Переключатель нужен, чтобы UI можно было продолжать тестировать до готовности backend.

### 8.4. Обязательные frontend-сценарии

| Сценарий | Результат |
|---|---|
| Создать маршрут | маршрут появляется в списке |
| Добавить точку | точка появляется в маршруте |
| Изменить порядок точек | порядок сохраняется |
| Создать заявку | заявка появляется в списке заявок |
| Отправить заявку | статус меняется на `Sent` |
| Начать обход | появляется активный обход |
| Открыть активный обход | появляется drawer с деталями |
| Создать мобильный аккаунт | аккаунт появляется в списке |
| Привязать сотрудника | связь видна в аккаунте и карточке сотрудника |
| Открыть результат | drawer показывает детали результата |

## 9. Worker implementation plan

Worker не должен дублировать бизнес-логику. Он вызывает application use cases.

MVP-задачи worker:

- обработка outbox-сообщений;
- отправка уведомлений сотрудникам;
- пересчет просроченных заявок;
- перевод зависших обходов в проблемный статус по правилу;
- генерация простых export jobs, если они попадут в MVP;
- подготовка фоновой обработки файлов.

Hangfire использовать для:

- scheduled jobs;
- retries;
- ручного перезапуска задач оператором;
- регламентных пересчетов.

RabbitMQ использовать для:

- доставки доменных событий;
- notification pipeline;
- fan-out на future integrations.

До утверждения NFR RabbitMQ не должен становиться обязательным для каждого простого use case.

## 10. Notifications

Уведомление сотруднику нужно минимум в сценарии создания заявки на обход.

Каналы:

| Канал | MVP |
|---|---|
| Web toast/operator center | да |
| Mobile push/FCM | да, если мобильный контур подключен |
| Email | нет, только если заказчик запросит |
| SMS | нет |

События:

- заявка создана;
- заявка отправлена сотруднику;
- заявка отменена;
- обход просрочен;
- создано замечание;
- потеряна связь или не получен результат.

Каждая попытка доставки должна иметь запись в истории уведомлений или audit/event log.

## 11. Security baseline

Обязательные требования:

- HTTPS в production;
- password hashing только штатными средствами Identity или проверенной библиотекой;
- web auth через cookie/session;
- mobile/API auth через JWT или отдельный token flow;
- refresh token rotation для мобильного доступа;
- antiforgery для cookie write-запросов;
- rate limit на login и reset password;
- аудит входов, сбросов пароля, блокировок, изменений ролей;
- секреты не хранить в репозитории;
- CORS разрешать только известным frontend-origin.

Для MVP допускается локальная Identity-модель без AD/LDAP. Интеграция с AD/LDAP должна быть отдельным решением.

## 12. Observability baseline

Каждый backend-запрос должен иметь:

- correlation id;
- trace id;
- user id, если пользователь авторизован;
- status code;
- duration;
- route name;
- structured log.

Минимальные health endpoints:

| Endpoint | Назначение |
|---|---|
| `/health/live` | процесс жив |
| `/health/ready` | готовность зависимостей |
| `/metrics` | Prometheus metrics |

Метрики MVP:

- HTTP latency;
- HTTP error rate;
- DB connection failures;
- active patrol count;
- overdue patrol request count;
- notification failure count;
- file upload failure count;
- worker job duration;
- outbox backlog.

## 13. Testing strategy

### 13.1. Backend

Минимум:

- unit tests доменных правил;
- application tests для use cases;
- integration tests API через test host;
- persistence tests для EF mappings и migrations;
- contract tests для основных DTO.

Критичные сценарии для тестов:

- нельзя создать заявку без сотрудника и маршрута;
- дата заявки по умолчанию сегодня;
- время прохождения необязательно;
- повтор NFC между разными маршрутами разрешен;
- назначение фиксирует `route_version_id`;
- результат точки сортируется по фактическому времени прохождения;
- мобильный аккаунт может иметь несколько сотрудников;
- отмененная заявка не может стать активным обходом.

### 13.2. Frontend

Минимум:

- Vitest для domain/helpers;
- component tests для форм и таблиц;
- Playwright smoke для основных вкладок;
- visual smoke на 1440px;
- проверка пустых состояний;
- проверка открытия drawer/modal;
- проверка отсутствия clipped Russian text.

### 13.3. E2E smoke

Первый e2e smoke после подключения API:

1. Зайти в веб-панель.
2. Создать сотрудника.
3. Создать мобильный аккаунт.
4. Привязать сотрудника к аккаунту.
5. Создать маршрут.
6. Добавить две точки.
7. Создать заявку на сегодня.
8. Отправить заявку.
9. Начать обход.
10. Отправить результат первой точки.
11. Проверить активный обход на дашборде.
12. Открыть результат в журнале.

## 14. CI/CD baseline

Минимальный pipeline:

1. checkout;
2. restore .NET;
3. restore frontend dependencies;
4. backend build;
5. frontend typecheck;
6. frontend build;
7. unit tests;
8. integration tests;
9. lint/format checks;
10. Docker image build;
11. migration script generation;
12. smoke tests на staging;
13. manual approval;
14. production deploy;
15. post-deploy smoke.

До появления production окружения pipeline может завершаться на build/test/smoke.

## 15. Infrastructure baseline

Локальная разработка:

- Docker Compose для PostgreSQL, Redis, RabbitMQ, MinIO;
- frontend dev server Vite;
- backend API отдельно;
- worker отдельно.

Production baseline до NFR:

- reverse proxy;
- 2 API replicas;
- 1 worker replica;
- PostgreSQL с backup;
- Redis;
- MinIO;
- centralized logs;
- Prometheus/Grafana.

Kubernetes не считать обязательным до подтверждения требований по self-healing, autoscaling, canary и нескольким независимым сервисам.

## 16. Data migration plan

Миграция старой системы выполняется после стабилизации новой схемы.

Фазы:

1. Инвентаризация старых таблиц и файлов.
2. Mapping старых сущностей на новые таблицы.
3. Выгрузка snapshot MySQL и каталога фото.
4. Data profiling: дубли, пустые поля, кодировки, битые ссылки.
5. Load в staging PostgreSQL.
6. Миграция файлов в MinIO.
7. Reconciliation: количество сущностей, файлов, связей.
8. Dry-run пользовательских сценариев.
9. Delta sync перед cutover.
10. Production switch.
11. Legacy read-only период.
12. Rollback plan до подтверждения приемки.

## 17. Порядок реализации

### Этап 1. Frontend stabilization

Цель: завершить API-ready UI.

Сделать:

- разложить крупные экраны на компоненты;
- унифицировать модалки, drawer, таблицы, пустые состояния;
- довести маршруты и точки до локального CRUD;
- довести заявку на обход;
- упростить активные обходы на дашборде;
- подготовить `apps/web/src/api`;
- добавить переключатель `mock/api`.

Критерий готовности: UI можно использовать для сквозного mock-сценария от маршрута до активного обхода.

### Этап 2. Backend foundation

Цель: подготовить API-host к реальным модулям.

Сделать:

- OpenAPI;
- health endpoints;
- correlation-id middleware;
- problem+json;
- EF Core + PostgreSQL;
- базовые migrations;
- Identity/RBAC skeleton;
- audit skeleton.

Критерий готовности: API запускается, health проходит, OpenAPI доступен, первая миграция применима к PostgreSQL.

### Этап 3. Routes and employees

Цель: дать backend-основу для UI.

Сделать:

- сотрудники;
- мобильные аккаунты;
- M:N привязки;
- маршруты;
- версии маршрутов;
- точки маршрутов;
- reorder points;
- duplicate NFC warning/validation.

Критерий готовности: UI может читать и сохранять сотрудников, аккаунты, маршруты и точки через API.

### Этап 4. Patrol requests and active patrols

Цель: реализовать главный рабочий процесс обхода.

Сделать:

- создать заявку;
- отправить заявку;
- отменить заявку;
- создать assignment;
- старт обхода;
- активный обход;
- прогресс;
- notification event.

Критерий готовности: из веб-панели можно создать заявку и увидеть активный обход на дашборде.

### Этап 5. Results and issues

Цель: закрыть прием результатов обхода.

Сделать:

- API приема результата точки;
- статусы точек;
- фактическое время;
- комментарии;
- issue creation;
- files placeholder или MinIO upload;
- журнал результатов;
- detail drawer.

Критерий готовности: результат точки появляется в активном обходе, журнале результатов и дашборде.

### Этап 6. Worker and notifications

Цель: вынести фоновые процессы.

Сделать:

- outbox;
- notification worker;
- overdue request job;
- cleanup/maintenance jobs;
- Hangfire dashboard только для админского контура.

Критерий готовности: уведомления и просрочки не зависят от ручного действия UI.

### Этап 7. Files and reports baseline

Цель: подготовить файловый контур.

Сделать:

- MinIO integration;
- upload/download;
- file metadata;
- file links;
- preview placeholders;
- export job skeleton.

Критерий готовности: фото результата хранится как файл с метаданными и связью с inspection.

### Этап 8. Hardening

Цель: подготовить к staging/UAT.

Сделать:

- тесты;
- логирование;
- метрики;
- RBAC checks;
- backup scripts;
- CI/CD;
- smoke checklist;
- документация runbooks.

Критерий готовности: staging можно отдать на пользовательскую приемку.

## 18. Definition of Done

Фича считается готовой, если:

- есть backend use case или явно зафиксировано, что это frontend-only этап;
- есть API contract;
- есть миграция БД, если нужны новые данные;
- UI подключен к typed client или mock-адаптеру с тем же контрактом;
- обработаны loading, empty, error, success states;
- права доступа проверены backend-ом;
- есть audit для критичных действий;
- есть минимум unit/integration tests по риску;
- сценарий проходит manual smoke;
- документация обновлена.

## 19. Открытые вопросы

До финального production sizing нужно подтвердить:

1. Требуется ли старый Android compatibility layer.
2. Нужен ли offline-режим мобильного приложения.
3. Можно ли использовать локальную Identity-модель без AD/LDAP.
4. Нужны ли юридически значимые PDF/DOCX в MVP.
5. Разрешен ли дубль NFC внутри одной версии маршрута.
6. Какой retention для фото, аудита, результатов и отчетов.
7. Какое целевое число web users и mobile devices.
8. Какое окно простоя допустимо на cutover.
9. Где будет production: on-prem, VM, Docker Compose, Kubernetes, Azure.

## 20. Ближайший практический шаг

Следующий шаг после этого ТЗ:

1. Завершить frontend API-ready слой и сквозной mock-сценарий.
2. Начать backend foundation: OpenAPI, EF Core, PostgreSQL, problem+json, correlation-id.
3. Первым backend-модулем реализовать `Routes / Route Points`, потому что от него зависят заявки, активные обходы, результаты и дашборд.
4. Вторым backend-модулем реализовать `Employees / Mobile Accounts`.
5. Третьим реализовать `Patrol Requests / Assignments`.

Такой порядок минимизирует переделки: сначала справочники и маршруты, затем заявки, затем активные обходы и результаты.
