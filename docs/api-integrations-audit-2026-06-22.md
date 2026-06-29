# Аудит API и интеграций Patrol360

Дата: 2026-06-22  
Объект проверки: текущая рабочая копия `C:\Users\AI_server\Desktop\Proekt obhod`  
Формат: source-level аудит API, интеграций, контрактов, авторизации, worker-задач и инфраструктурных стыков.

## 1. Краткий вывод

API и интеграционная часть Patrol360 в целом рабочие: есть покрытие основных модулей через `/api/v1/*`, централизованный web API client, отдельный mobile API, PERCo-интеграция, очередь Firebase push и worker для фоновых задач.

При этом слой еще не production-hardened. Главные риски: кастомная авторизация вне стандартного ASP.NET Core authentication pipeline, отсутствие полного endpoint allowlist теста, mojibake в backend сообщениях, skipped DB integration tests, ручной HTTP-клиент PERCo без typed client/resilience, локальное хранение mobile-файлов вместо явной storage abstraction и расхождение между заявленной infra Redis/RabbitMQ/MinIO и фактическим использованием в коде.

## 2. Проверки

Подтверждено командами:

- `dotnet test tests\Patrol360.Api.Tests\Patrol360.Api.Tests.csproj --no-build` - пройдено, 41 passed.
- `dotnet test tests\Patrol360.Infrastructure.Tests\Patrol360.Infrastructure.Tests.csproj --no-build` - пройдено, 4 passed, 41 DB integration skipped.
- `.\tools\Verify-TextEncoding.ps1` до создания этого отчета проходил на 776 text files.

Ограничения проверки:

- реальные PostgreSQL integration-сценарии пропущены;
- PERCo, Firebase и мобильная загрузка файлов не проверялись против внешних сервисов;
- Docker runtime и `/health/ready` в этом проходе не проверялись;
- аудит проводился по текущей dirty working copy.

## 3. API поверхность

Контроллеры находятся в `apps/api/Controllers`.

Крупные контроллеры:

- `InventoryController.cs` - около 39 KB, много групп API в одном классе.
- `EmuController.cs` - около 37 KB, маршруты ЭМУ, отчеты, экспорт, планы, смены, решения.
- `MobileAccountsController.cs` - около 11 KB.
- `MobileController.cs` - около 7 KB.
- `PercoIntegrationController.cs` - около 5 KB.

Основные группы API:

- `/api/v1/auth/*` - web login/me/logout.
- `/api/v1/dashboard/*` - dashboard.
- `/api/v1/routes/*`, `/api/v1/assignments/*`, `/api/v1/results/*`, `/api/v1/patrol-requests/*` - обходы.
- `/api/v1/mobile/*` - мобильный login, refresh, bootstrap, outbox, files, push token.
- `/api/v1/mobile-sync/*` - admin sync endpoint.
- `/api/v1/inventory/*` - склад, СИЗ, номенклатура, импорт, экспорт, отчеты.
- `/api/v1/emu/*` - учет работ, смены, планы, справочники, отчеты.
- `/api/v1/integrations/perco/*` - PERCo settings/sync/match/logs/diagnostics.
- `/api/v1/site-users/*` - пользователи, permissions, scopes.
- `/api/v1/system-notifications/*` - уведомления.
- `/health/live`, `/health/ready` - health endpoints.

Вывод: API поверхность широкая и соответствует функциональным модулям проекта, но `InventoryController` и `EmuController` уже выполняют роль мини-модулей внутри одного файла. Их стоит дробить без изменения URL/DTO.

## 4. Авторизация и права

Фактическая схема:

- стандартный ASP.NET Core authentication не подключен;
- в `Program.cs` есть `UseAuthorization()`, но нет `AddAuthentication()` и `UseAuthentication()`;
- web авторизация реализована через `RequirePermissionAttribute` / `RequireAnyPermissionAttribute`;
- атрибут вручную читает `Authorization: Bearer ...`, вызывает `IAuthSessionService.GetCurrentUser()` и проверяет permissions;
- mobile API использует отдельный bearer token и ручную проверку внутри `MobileController`.

Сильные стороны:

- permissions уже применяются на большинстве web endpoint'ов;
- API smoke tests проверяют доступ к ряду endpoint'ов;
- есть section-scope для ЭМУ;
- SiteUsers API и PERCo API закрыты permissions.

Риски:

- нет единого authentication handler;
- нет полного reflection-теста, который доказывает, что каждый `[Http*]` endpoint либо защищен permission-атрибутом, либо явно allowlisted как public/mobile;
- часть сообщений в `RequirePermissionAttribute` и контроллерах повреждена mojibake;
- `SiteUsersController` закрыт `site_users.write` даже для чтения, что безопасно, но слишком грубо для будущего разделения read/write;
- в Inventory есть GET endpoint'ы, которые полагаются на общий `inventory.view`; нужно бизнес-решение, достаточно ли этого для export/status/settings/movements.

Рекомендация P0/P1: добавить стандартный bearer authentication handler поверх текущих сессий и оставить permission attributes как policy/filter слой. Параллельно добавить endpoint coverage test.

## 5. Web API client

Файл: `apps/web/src/api/client.ts`.

Подтверждено кодом:

- один `ApiClient`;
- timeout по умолчанию 15 секунд;
- bearer token хранится в `localStorage/sessionStorage` под `patrol360.sessionToken`;
- `VITE_API_BASE_URL` / `VITE_API_URL` поддерживаются;
- есть `get/post/put/patch/delete/download/postForm`;
- `ProblemDetails` маппится в `ApiError`;
- есть frontend tests для API client.

Риски:

- нет централизованной retry-политики для идемпотентных GET;
- нет отдельного handling для 401 с глобальным logout/refresh на web;
- network timeout единый для всех операций, включая тяжелые exports/downloads.

Рекомендация: позже разделить API profiles: обычные JSON-запросы, file upload/download, long-running exports.

## 6. Mobile API

Файл: `apps/api/Controllers/MobileController.cs`.

Endpoint'ы:

- `GET /api/v1/mobile/health`
- `POST /api/v1/mobile/auth/login`
- `POST /api/v1/mobile/auth/refresh`
- `POST /api/v1/mobile/auth/logout`
- `GET /api/v1/mobile/bootstrap`
- `POST /api/v1/mobile/devices/push-token`
- `GET /api/v1/mobile/notifications`
- `POST /api/v1/mobile/notifications/{notificationId}/read`
- `GET /api/v1/mobile/work-tasks`
- `GET /api/v1/mobile/work-tasks/{taskId}`
- `POST /api/v1/mobile/outbox`
- `POST /api/v1/mobile/files`
- `GET /api/v1/mobile/outbox/{clientOperationId}`

Файлы:

- upload ограничен `[RequestSizeLimit(32 * 1024 * 1024)]`;
- фото до 6 MB, видео до 30 MB;
- metadata содержит `clientFileId`, `assignmentId`, `pointId`, `remarkId`, `sha256`, `sizeBytes`, `capturedAtLocal`;
- файлы пишутся в `AppContext.BaseDirectory/mobile-files`;
- Docker compose монтирует `api-mobile-files:/app/mobile-files`.

Сильные стороны:

- есть refresh/logout/bootstrap/outbox;
- upload защищен mobile session token;
- есть дедупликация по `MobileAccountId + ClientFileId`;
- проверяется принадлежность assignment/point при patrol file upload;
- outbox status можно запросить по `clientOperationId`.

Риски:

- не подтверждено, что переданный `sha256` сверяется с фактическим хэшем файла;
- content-type нормализуется, но не видно строгой проверки magic bytes;
- storage завязан на локальную директорию и container volume, а не на абстракцию;
- worker не имеет volume `api-mobile-files`, если в будущем будет обрабатывать файлы;
- DB integration tests мобильного lifecycle сейчас skipped.

Рекомендация P1: ввести `IMobileFileStorage`, серверную sha256-проверку, magic-byte validation и интеграционный тест upload + result attachment read.

## 7. PERCo-интеграция

Файлы:

- `apps/api/Controllers/PercoIntegrationController.cs`
- `libs/infrastructure/Persistence/EfPercoIntegrationService.cs`

Endpoint'ы:

- settings read/update;
- test connection;
- secret check;
- employee sync;
- event sync;
- unmatched employees;
- employee matching;
- logs;
- diagnostics;
- manual close presence interval.

Сильные стороны:

- секреты защищаются через ASP.NET DataProtection;
- есть режимы login/password и token;
- есть logs и diagnostics;
- PERCo permissions разделены на view/manage/sync/match/logs.

Риски:

- HTTP клиент создается вручную внутри EF service;
- нет `IHttpClientFactory`, typed client, retry/backoff/circuit breaker;
- PERCo protocol, sync mapping и persistence смешаны в одном сервисе;
- пользовательские сообщения и logs местами повреждены mojibake;
- внешний PERCo не проверялся.

Рекомендация P1: выделить `IPercoClient` и `IPercoSyncService`; HTTP сделать через typed `HttpClient` с timeout/resilience; EF-сервис оставить persistence/repository слоем.

## 8. Firebase push и worker

Файлы:

- `libs/infrastructure/MobilePush/FirebaseMobilePushDeliveryService.cs`
- `apps/worker/Worker.cs`

Подтверждено кодом:

- очередь push хранится в БД;
- delivery берет batch до 50 уведомлений;
- max attempts 3;
- stale sending освобождается после 5 минут;
- claim использует SQL `FOR UPDATE SKIP LOCKED`;
- Firebase service account читается из `Firebase:ServiceAccountPath`;
- worker запускает push delivery каждые 5 секунд.

Сильные стороны:

- есть конкурентоустойчивый claim через DB lock;
- есть retry attempts;
- отсутствие Firebase config не ломает worker, delivery просто не отправляет.

Риски:

- нет подтвержденного runtime-теста с реальным Firebase;
- worker совмещает несколько типов jobs в одном цикле;
- нет явных metrics/observability per job.

Рекомендация: добавить job-level structured logs/metrics и smoke-тест конфигурации Firebase secret в Docker runtime.

## 9. Infrastructure integrations

В `infra/docker/compose.yaml` есть:

- `api`
- `web`
- `worker`
- `proxy` на Caddy;
- `postgres`;
- `redis`;
- `rabbitmq`;
- `minio`.

Фактическое использование:

- PostgreSQL используется через EF Core/Npgsql.
- Caddy проксирует `/api/*`, `/health/*` в API, остальное в web.
- DataProtection key ring вынесен в volume.
- `api-mobile-files` volume используется API для mobile files.
- Redis/RabbitMQ/MinIO в приложении не подтверждены поиском по коду.

Риск: infra выглядит богаче, чем фактическая application architecture. Это создает ложные ожидания по очередям/cache/object storage.

Рекомендация: либо убрать из обязательной runtime-документации Redis/RabbitMQ/MinIO как активные зависимости, либо завести явные abstractions и перевести соответствующие сценарии на них.

## 10. Контракты и DTO

Папка: `libs/contracts`.

Крупные файлы:

- `InventoryContracts.cs`
- `EmuContracts.cs`
- `MobileAppContracts.cs`
- `PercoContracts.cs`

Вывод:

- contracts уже разложены по доменам;
- Inventory и Emu стали большими и требуют дальнейшего разделения внутри модуля;
- public DTO менять нельзя без отдельного compatibility plan.

Рекомендация: разделить крупные contract-файлы на partial/domain subfiles внутри того же namespace, без изменения DTO names и JSON schema.

## 11. Тестовое покрытие API

Подтверждено:

- `Patrol360.Api.Tests` проходят: 41 passed.
- `Patrol360.Infrastructure.Tests` проходят только non-DB часть: 4 passed, 41 skipped.

Главный пробел:

- DB integration tests сейчас не подтверждают реальные flows:
  - mobile login/bootstrap/outbox/files;
  - assignment lifecycle;
  - route NFC/QR;
  - results persistence;
  - Inventory PPE print/export;
  - EMU work lifecycle/shift summaries;
  - PERCo events/decisions.

Рекомендация P0/P1: перед production-статусом запускать DB integration на Postgres как обязательный gate.

## 12. Приоритетные проблемы

### P0

1. Убрать mojibake в backend API/user-facing сообщениях и добавить scanner, который ловит `Р`, `С`, `�` в русских строках.
2. Добавить endpoint security coverage test: каждый HTTP endpoint должен быть permission-protected, mobile-token protected или явно public allowlisted.
3. Запустить DB integration на PostgreSQL и зафиксировать фактический статус mobile/results/inventory/emu/perco flows.

### P1

4. Перевести custom auth в стандартный ASP.NET Core authentication handler.
5. Вынести PERCo HTTP в typed client с retry/backoff/timeout policy.
6. Ввести storage abstraction для mobile files и сверку sha256.
7. Разделить `InventoryController` и `EmuController` на модульные controller/service slices.
8. Проверить sensitive GET endpoint'ы Inventory на достаточность `inventory.view`.

### P2

9. Развести worker jobs по отдельным scheduling/metrics boundaries.
10. Синхронизировать infra docs с фактическим использованием Redis/RabbitMQ/MinIO.
11. Разделить крупные contract-файлы на subfiles без изменения public DTO.
12. Добавить typed API clients на frontend по features, оставив общий `ApiClient` transport.

## 13. Рекомендуемый порядок работ

1. Encoding/mojibake cleanup.
2. Endpoint security reflection test.
3. DB integration run на Postgres.
4. Mobile file storage hardening.
5. PERCo typed client.
6. Controller decomposition.
7. Infra dependency cleanup/documentation.

## 14. Итоговый статус

Готово:

- базовая API поверхность работает;
- API smoke tests проходят;
- web API client централизован;
- mobile API и PERCo API функционально заложены;
- worker и Firebase queue присутствуют.

Не готово как production gate:

- нет подтвержденных DB integration flows;
- есть mojibake в backend;
- auth/security coverage требует усиления;
- внешние интеграции PERCo/Firebase не подтверждены runtime QA;
- file storage требует hardening;
- Redis/RabbitMQ/MinIO не подтверждены как реальные application dependencies.
