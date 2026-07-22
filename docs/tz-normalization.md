# Нормализация ТЗ перед стартом разработки

> **Статус документа: историческая нормализация требований до начала реализации.**
> Release-порядок и упоминания UI без backend не описывают текущий Patrol360.
> Актуальные модули и ограничения зафиксированы в [modules.md](./modules.md).

Дата: 13.05.2026  
Статус: рабочий baseline для согласования перед проектированием backend/frontend.

## 1. Цель документа

Этот документ не заменяет исходное ТЗ миграции. Он фиксирует короткий набор решений и правок, которые нужно внести в ТЗ перед началом разработки, чтобы убрать противоречия в доменной модели, границах MVP и инфраструктурных ожиданиях.

Основная позиция сохраняется: новая система делается как greenfield-переработка с переносом доменной модели, данных и критичных API-сценариев, а не как прямой перенос старого Flask/MySQL-кода.

## 2. Принятый архитектурный baseline

| Область | Решение |
|---|---|
| Основной backend | ASP.NET Core на .NET 10 LTS |
| Архитектура первого релиза | Modular monolith, Clean Architecture, selective CQRS |
| База данных | PostgreSQL через EF Core / Npgsql |
| Frontend | React + TypeScript + Vite |
| UI kit | MUI или локальный UI-kit поверх design tokens |
| Realtime для web | SignalR |
| Mobile push | FCM, совместимый контур для Android |
| Файлы | MinIO/S3-compatible storage |
| Cache | Redis |
| Фоновые задачи | Hangfire + отдельный .NET Worker |
| Event processing | RabbitMQ + outbox pattern для доменных событий |
| Observability | Serilog + OpenTelemetry + Prometheus/Grafana + централизованные логи |
| Репозиторий | Monorepo |
| Первый production split | Не микросервисы. Выносить отдельно только document-service/notification/import-export после подтверждения нагрузки |

## 3. Обязательные правки к исходному ТЗ

### 3.1 NFC и точки маршрутов

В исходной таблице БД нельзя оставлять `ux_route_points_nfc_code`, потому что это делает NFC-код глобально уникальным. Требование интерфейса и домена допускает повтор метки между маршрутами.

Нормализованное правило:

- NFC/tag не является глобально уникальным идентификатором точки.
- Одинаковый `nfc_code` разрешён в разных маршрутах и разных версиях маршрутов.
- Скан NFC должен разрешаться в контексте активного назначения: `assignment_id -> route_version_id -> route_point_versions`.
- Для MVP рекомендуется блокировать или как минимум предупреждать повтор `nfc_code` внутри одной активной версии маршрута, иначе один скан может соответствовать нескольким точкам одного обхода.

Правка БД:

```text
route_point_versions
  id uuid pk
  route_version_id uuid not null
  seq_no int not null
  name varchar not null
  nfc_code varchar null
  label varchar null
  geo_json jsonb null
  is_required bool not null

indexes:
  ux_route_point_versions_route_seq(route_version_id, seq_no)
  ix_route_point_versions_nfc_code(nfc_code)
  ix_route_point_versions_route_nfc(route_version_id, nfc_code)
```

Открытое решение: разрешаем ли дубликат NFC внутри одной версии маршрута как штатный сценарий. Рекомендация для MVP: нет, только предупреждение в UI и отдельное бизнес-решение позже.

### 3.2 Mobile accounts

Таблица `mobile_accounts.employee_id` недостаточна, потому что мобильный аккаунт должен уметь прикреплять и убирать сотрудников списком ФИО.

Нормализованная модель:

```text
mobile_accounts
  id uuid pk
  login varchar unique
  password_hash text
  status smallint
  last_seen_at timestamptz
  created_at timestamptz

mobile_account_employees
  id uuid pk
  mobile_account_id uuid not null
  employee_id uuid not null
  attached_at timestamptz
  detached_at timestamptz null

indexes:
  ux_mobile_accounts_login(login)
  ix_mobile_account_employees_account(mobile_account_id)
  ix_mobile_account_employees_employee(employee_id)
```

Дополнительно нужны:

- `mobile_sessions` для текущих сессий устройств;
- `device_tokens` для FCM;
- audit events для создания, сброса пароля, привязки и отвязки сотрудника.

### 3.3 Версионирование маршрутов

Нельзя привязывать исторические результаты только к текущим `routes` и `route_points`, потому что маршрут и точки могут измениться после выполненного обхода.

Нормализованная модель:

```text
routes
  id uuid pk
  name varchar
  description text
  is_archived bool
  current_version_id uuid null

route_versions
  id uuid pk
  route_id uuid not null
  version_no int not null
  status smallint
  effective_from timestamptz
  effective_to timestamptz null
  created_by uuid
  created_at timestamptz

route_point_versions
  id uuid pk
  route_version_id uuid not null
  seq_no int
  name varchar
  nfc_code varchar null
  is_required bool

assignments
  id uuid pk
  route_id uuid not null
  route_version_id uuid not null
  employee_id uuid not null
  status smallint
  planned_at timestamptz
  started_at timestamptz null
  finished_at timestamptz null
  lock_version bigint

inspections
  id uuid pk
  assignment_id uuid not null
  route_point_version_id uuid not null
  status smallint
  scanned_at timestamptz
  submitted_at timestamptz
```

Правило: назначение всегда фиксирует конкретную `route_version_id`. После старта обхода изменение маршрута не меняет уже созданные назначения и результаты.

### 3.4 Границы Hangfire и RabbitMQ

Чтобы не получить две конкурирующие очереди, роли фиксируются так:

| Контур | Использование |
|---|---|
| Hangfire | scheduled jobs, отчёты, экспорты, импорты, retries операторских задач, регламентные ночные пересчёты |
| RabbitMQ | доменные события, outbox delivery, интеграции, notification pipeline, fan-out обновлений |
| Outbox | гарантированная публикация событий после успешной транзакции PostgreSQL |
| SignalR | доставка realtime-состояния в web UI, не замена очереди |
| FCM | push для Android, не источник истины |

Пример: создание проблемы при обходе пишет `issues`, `assignment_events`, `outbox_messages` в одной транзакции. Worker публикует событие в RabbitMQ. Notification consumer отправляет FCM/SignalR и пишет историю доставки.

### 3.5 Worklog

Worklog остаётся частью целевого продукта, но не входит в первый UI/MVP-релиз панели обходов.

Фиксация:

- MVP web UI: без вкладки Worklog.
- Backend MVP: допускается только подготовка базовых таблиц, если это не тормозит core-релиз.
- Полный Worklog: отдельный релиз после маршрутов, назначений, результатов, файлов и мобильной совместимости.

### 3.6 Файлы, фото и антивирусный контур

В ТЗ уже есть `av_status`, но нужно явно добавить pipeline:

1. файл загружается в MinIO в статусе `PendingScan`;
2. запись создаётся в `files` / `file_versions`;
3. worker ставит задачу сканирования;
4. до результата сканирования скачивание доступно только администраторам или полностью запрещено;
5. при угрозе файл переводится в `Quarantined`, а связанная сущность получает предупреждение;
6. все действия пишутся в audit.

Для MVP можно сделать интерфейс статуса без реального antivirus engine, но модель данных должна быть готова.

### 3.7 Шаблоны отчётов

Для PDF/DOCX/XLSX нужно версионировать не только результат, но и шаблон.

Добавить:

```text
report_templates
  id uuid pk
  code varchar unique
  name varchar
  format varchar
  current_version_id uuid null

report_template_versions
  id uuid pk
  template_id uuid not null
  version_no int not null
  source_file_id uuid not null
  status smallint
  created_by uuid
  created_at timestamptz

report_jobs
  template_version_id uuid null
  result_file_id uuid null
```

Правило: каждый сформированный документ должен знать, по какой версии шаблона он был создан.

## 4. Граница MVP

### Release 0. UI prototype без backend

Уже начатая стадия. Цель: согласовать UX, вкладки, сценарии и доменные термины.

Состав:

- главное окно;
- результаты обходов;
- назначение сейчас;
- плановый обход;
- мобильные аккаунты;
- маршруты и точки;
- сотрудники;
- пользователи сайта;
- локальные UI-состояния без API и без фальшивых seed-записей;
- без Worklog.

### Release 1. Core web + mobile compatibility

Цель: рабочий web/backend для базового процесса обходов.

Включить:

- Auth / Users / Employees;
- RBAC минимум для администратора, диспетчера, наблюдателя;
- Routes / Route Versions / Route Points;
- Mobile Accounts M:N Employees;
- Assignments: создать, старт, отмена, завершение;
- Planned patrol schedule: день/ночь, исключения;
- Inspections / Results / Issues;
- Files/photos в MinIO;
- Dashboard summary;
- Audit baseline;
- OpenAPI `/api/v1`;
- compatibility layer для Android, если старый клиент остаётся в эксплуатации.

Исключить из Release 1:

- полный Worklog;
- сложную аналитику и тренды;
- полноценный import/export конструктор;
- Kubernetes как обязательное требование;
- микросервисный split;
- юридически значимые DOCX/PDF формы, если заказчик не подтвердит их обязательность для MVP.

### Release 2. Operations hardening

Включить:

- Worklog;
- отчёты PDF/DOCX/XLSX;
- шаблоны и версии документов;
- расширенный audit/history;
- нагрузочная оптимизация dashboard/read models;
- production backup/PITR runbooks;
- alerting и операционные дашборды;
- mobile API v1 без deprecated adapter.

## 5. NFR discovery checklist

До финального sizing и production-плана нужно получить ответы:

| Вопрос | Нужно зафиксировать |
|---|---|
| Web users | число операторов одновременно и всего |
| Mobile devices | число Android-устройств одновременно и всего |
| RPS read | dashboard/results/routes peak read |
| RPS write | scans, assignments, comments, photo uploads |
| Latency | p95/p99 для CRUD, dashboard, scan submit, upload |
| SLA | целевая доступность production |
| RTO/RPO | допустимая потеря данных и время восстановления |
| Files | фото/день, средний/максимальный размер, годовой прирост |
| Retention | аудит, фото, отчёты, логи, worklog |
| Cutover window | допустимое окно остановки старой системы |
| Android compatibility | старый клиент остаётся или переписывается сразу |
| Offline mode | нужны ли offline scans на Android |
| Legal docs | имеют ли PDF/DOCX юридическое значение |
| Deployment | on-prem, VM, Docker Compose, Kubernetes, Azure |
| Security | требования к MFA, паролям, AD/LDAP, IP allowlist |

Решение: без этого checklist нельзя финализировать количество API/worker replicas, размер PostgreSQL/Redis/MinIO, retention policy и план миграции.

## 6. Минимальные правила API

- REST-first API.
- Версионирование: `/api/v1`.
- OpenAPI генерируется из backend.
- Ошибки: `application/problem+json`.
- Все write endpoints принимают correlation-id.
- Тяжёлые операции возвращают `job_id`, а не держат HTTP-запрос.
- Для imports/report jobs использовать idempotency key.
- Для web realtime использовать SignalR.
- Для Android push использовать FCM + refresh.
- Для совместимости старого Android допускается adapter namespace, например `/api/compat/mobile/*`, с датой удаления.

## 7. Минимальные правила данных

- Все ключевые сущности: `uuid`.
- Время: `timestamptz`, хранение в UTC, отображение по локальной зоне.
- Business status: `smallint` + enum mapping в коде.
- Optimistic locking: `lock_version` на маршрутах, назначениях, планах и аккаунтах.
- Audit: все изменения прав, маршрутов, назначений, мобильных аккаунтов и результатов.
- Soft archive для маршрутов и справочников, но не для audit/events.
- Исторические results не зависят от текущей версии маршрута.

## 8. Решения, которые нужно утвердить отдельно

1. Разрешать ли повтор NFC внутри одной версии маршрута.
2. Нужен ли старый Android compatibility layer или Android сразу переводится на новый API.
3. Входит ли Worklog в backend Release 1 или полностью переносится в Release 2.
4. Обязательны ли юридически значимые DOCX/PDF в MVP.
5. Будет ли production on-prem на Docker Compose или нужна подготовка под Kubernetes.
6. Нужна ли интеграция с AD/LDAP или достаточно локального Identity.
7. Требуется ли offline режим мобильного обхода.

## 9. Итоговое решение

Исходное ТЗ принять как архитектурный baseline, но перед началом backend-разработки внести перечисленные правки. Главные блокеры для старта без уточнения: NFC uniqueness, M:N mobile accounts, route versioning, MVP boundary и NFR discovery.

После согласования этого документа можно переходить к следующему артефакту: структуре monorepo, первичной схеме PostgreSQL и OpenAPI-контрактам Release 1.
