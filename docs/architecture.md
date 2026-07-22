# Архитектура

Дата актуализации: 2026-07-22.

## Архитектурный стиль

Patrol360 реализован как modular monolith на .NET с несколькими host-приложениями:

- `apps/api` — ASP.NET Core HTTP API;
- `apps/web` — административный React SPA;
- `apps/worker` — фоновые прикладные процессы;
- `mobiel proekt` — Android-приложение сотрудников;
- `libs/domain` — доменные типы и инварианты;
- `libs/application` — application-порты и сценарии;
- `libs/contracts` — DTO и контракты обмена;
- `libs/infrastructure` — EF Core, файлы, FCM, отчеты и внешние интеграции.

Модульный монолит сохраняет общую транзакционную модель PostgreSQL и позволяет развивать функциональные границы без преждевременного выделения микросервисов.

## Контуры приложения

```text
apps/web ───────┐
                ├─→ apps/api ─→ application/domain ─→ infrastructure ─→ PostgreSQL/files/FCM/PERCo
mobiel proekt ──┘
apps/worker ───────→ application/infrastructure
mobiel proekt ─────→ SQLite/SQLCipher и локальные media
```

Web и mobile не обращаются к PostgreSQL напрямую. Все серверные операции проходят через API/application-интерфейсы. Worker использует те же application/infrastructure services, что и API.

## Функциональные границы

Основные bounded contexts:

- Patrol: маршруты, точки, заявки, назначения и результаты;
- Identity: web auth, site users, роли, permissions и scopes;
- Mobile: аккаунты, сессии, устройства, bootstrap, outbox, push и диагностика;
- Inventory: каталог, движения, custody, PPE, отчеты, настройки и аудит;
- EMU: рабочие сессии, планы, смены, решения, история и отчеты;
- PERCo: настройки интеграции, сотрудники, события доступа и presence intervals;
- Notifications: системные web-уведомления и mobile push.

Подробный статус находится в [modules.md](./modules.md).

## Зависимости runtime

### Активные

Application-код фактически использует:

- PostgreSQL через EF Core и Npgsql;
- локальное/volume-хранилище мобильных вложений, диагностических отчетов и шаблонов;
- Firebase Cloud Messaging, если предоставлена конфигурация;
- in-process `IMemoryCache`;
- HTTP-интеграцию с PERCo-Web;
- Open XML SDK, ClosedXML и QuestPDF для профильных печатных форм и экспортов.

Mobile использует SQLite/SQLCipher, SecureStore, локальную файловую систему, Expo notifications/background tasks, NFC, QR и камеру. Синхронизация построена на ordered outbox с retry, owner/contour isolation и server reconciliation.

### Инфраструктурный резерв

Docker Compose также поднимает Redis, RabbitMQ и MinIO. Они не считаются обязательными runtime-зависимостями, пока application-код не переведен на соответствующие адаптеры.

Hangfire и SignalR не подключены. Их добавление требует зафиксированных NFR, health checks, retry/idempotency и fallback-правил.

## Правила слоев

`libs/domain` не зависит от ASP.NET Core, EF Core, файлов, push и внешних интеграций. Здесь живут доменные типы и инварианты.

`libs/application` зависит от domain и contracts, определяет query/command interfaces и orchestration, но не знает деталей PostgreSQL, FCM и файловой системы.

`libs/infrastructure` реализует application-порты и содержит `Patrol360DbContext`, EF services, migrations, seed data, адаптеры файлов, FCM, PERCo и генерации документов.

`apps/api` отвечает за HTTP routing, authentication, authorization, validation и response mapping. Он использует отдельные bearer-схемы для web и mobile и применяет permission policies.

`apps/worker` доставляет queued mobile push, обслуживает уведомления и перенос работ ЭМУ, запускает автоматическую синхронизацию PERCo. Host не должен дублировать прикладную логику сервисов.

`apps/web` хранит presentation state, фильтры и формы, получает backend data через typed repositories/hooks и поддерживает mock-режим для UI-разработки. В API-режиме серверные списки не смешиваются с локальными mock-записями.

`mobiel proekt` является offline-first клиентом. Он хранит локальный снимок назначений, точек, результатов, файлов и команд, не считает локальную команду подтвержденной сервером и очищает media только после server reconciliation.

## API и безопасность

Основной namespace — `/api/v1`. Для эволюции отдельных read-контрактов существуют `/api/v2/results`, `/api/v3/results` и `/api/v2/mobile/work-items`.

Действующие соглашения:

- REST-oriented controllers и Problem Details для ошибок;
- отдельные web/mobile authentication schemes;
- fallback authorization policy для web API;
- `RequirePermission` для действий и чувствительных read-моделей;
- rate limiting для web/mobile login;
- forwarded headers с allowlist известных proxy;
- CORS allowlist для локальных web origins;
- optimistic/version checks в изменяемых сценариях;
- идемпотентность и reconciliation мобильного outbox;
- неизменяемые route revisions для исторических результатов.

OpenAPI generation и автоматический TypeScript DTO codegen пока не подключены. До их появления C# contracts и клиентские schemas должны изменяться синхронно и проверяться тестами.

## Данные и миграции

- Основная БД — PostgreSQL `patrol360`.
- EF migrations находятся в `libs/infrastructure/Persistence/Migrations`.
- Инициализация production-like контура выполняется отдельным compose-сервисом `migrate`.
- API не должен принимать трафик до успешного завершения миграций.
- DB-backed integration tests включаются отдельным флагом и требуют PostgreSQL.
- Повторный Inventory legacy-import выполняется только из миграционной копии, не из production legacy БД.

## Файлы и отчеты

Файлы принадлежат профильным модулям: mobile uploads, patrol attachments, вложения EMU, шаблоны и печатные формы Inventory, mobile diagnostics.

Универсальный Files bounded context и единая очередь report jobs пока не выделены. MinIO/S3 остается целевым вариантом для будущего production object storage, но текущий код использует локальный/volume-контур.

## Frontend и UI

Административная панель содержит рабочие API-backed экраны:

- обходы: dashboard, results, assignments, employees, schedule, mobile accounts, routes;
- управление web-пользователями и RBAC;
- Inventory;
- EMU;
- PERCo-Web.

Schedule — частично реализованный контур: grid строится из реальных заявок, назначений и справочников, но собственного schedule CRUD/persistence пока нет.

## Realtime и согласованность

Текущая модель обновления:

- web — запросы API, refresh после mutations и системные уведомления;
- mobile — foreground/background sync, push-triggered refresh и polling/retry;
- worker — периодические maintenance loops.

SignalR может быть добавлен для realtime dashboard после отдельного решения. До этого UI не должен предполагать мгновенную доставку всех изменений.
