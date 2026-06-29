# Аудит безопасности и API Patrol360

Дата: 2026-06-23  
Область: `apps/api`, `libs/application`, `libs/infrastructure`, web/mobile API-клиенты на уровне source-level проверки.

## Краткий вывод

Проект имеет рабочую RBAC-модель и большинство контроллеров закрыты permission-фильтрами, но текущая защита API неоднородна: часть endpoint'ов полагается на кастомные attributes, часть на ручную проверку bearer-токена, а часть вообще осталась без явной авторизации. Главный подтвержденный дефект: `MobileAccountsController` публикует read-endpoint'ы без `RequirePermission`, из-за чего список мобильных аккаунтов, сессии, security events, binding и available employees потенциально доступны без авторизации.

Текущий `dotnet test --no-build` проходит, но DB integration тесты пропущены. `Verify-TextEncoding.ps1` проходит, хотя в production-коде остаются mojibake-строки, значит текущий encoding gate проверяет UTF-8/BOM, но не семантическую испорченную кириллицу.

## Проверки

Подтверждено командами:

- `dotnet test .\Patrol360.slnx --no-build`: passed; 51 тест passed, 43 DB integration skipped.
- `.\tools\Verify-TextEncoding.ps1`: passed, 944 text files.
- Codex Security workspace не запустился: локальная среда не видит рабочий Python (`python` отсутствует, `py` сообщает no installed Python). Поэтому аудит выполнен вручную по исходному коду.

Не проверено:

- DAST/security scanner.
- DB integration security сценарии.
- Runtime auth probes через HTTP.
- npm audit, dependency audit и container image scan.

## P0: критичные дефекты

### 1. `MobileAccountsController` имеет публичные read endpoint'ы

Файл: `apps/api/Controllers/MobileAccountsController.cs`

Контроллер объявлен с `[Route("api/v1/mobile-accounts")]`, но без class-level `[RequirePermission]`. Без защиты остались:

- `GET /api/v1/mobile-accounts`
- `GET /api/v1/mobile-accounts/{id}`
- `GET /api/v1/mobile-accounts/{id}/sessions`
- `GET /api/v1/mobile-accounts/{id}/security-events`
- `GET /api/v1/mobile-accounts/{id}/binding`
- `GET /api/v1/mobile-accounts/{id}/available-employees`

Риск: раскрытие логинов мобильных аккаунтов, привязок сотрудников, сессий, событий безопасности и доступных сотрудников. Это прямой data exposure и основная находка аудита.

Рекомендация:

- Добавить class-level `[RequirePermission("mobile_accounts.read")]`.
- Оставить write methods с `[RequirePermission("mobile_accounts.write")]`.
- Добавить API tests: unauthenticated access получает 401, user без `mobile_accounts.read` получает 403, read user получает 200.

### 2. Нет стандартной ASP.NET authentication boundary

Файлы:

- `apps/api/Program.cs`
- `apps/api/Authorization/RequirePermissionAttribute.cs`
- `apps/api/Controllers/MobileController.cs`

В `Program.cs` есть `app.UseAuthorization()`, но нет `AddAuthentication()` и `UseAuthentication()`. Web authorization реализован кастомными `IAuthorizationFilter`, mobile API вручную читает bearer token в каждом method.

Риск: один пропущенный attribute открывает endpoint. Это уже проявилось в `MobileAccountsController`.

Рекомендация:

- Ввести authentication handlers для web session token и mobile access token.
- Перевести permissions на ASP.NET policies.
- Все private controllers/actions должны иметь `[Authorize]`/policy coverage.
- Добавить structure/API test, который запрещает endpoint без auth metadata, кроме явного allowlist (`/health/live`, `/api/v1/auth/login`, `/api/v1/mobile/health`, `/api/v1/mobile/auth/login`, `/api/v1/mobile/auth/refresh`).

### 3. Нет rate limiting / lockout для web и mobile login

Файлы:

- `libs/infrastructure/Persistence/EfAuthSessionService.cs`
- `libs/infrastructure/Persistence/MobileApp/EfMobileAppService.Auth.cs`

Пароли проверяются через `PasswordHasher`, токены генерируются криптографически и хешируются в БД, но brute-force protection не найден: нет rate limiter, failed attempts, lockout или задержки на повторные попытки.

Риск: перебор паролей web/mobile аккаунтов, особенно на LAN.

Рекомендация:

- Добавить ASP.NET rate limiter на `/api/v1/auth/login`, `/api/v1/mobile/auth/login`, `/api/v1/mobile/auth/refresh`.
- Вести failed attempts по login + IP/deviceId.
- Вводить временный lockout и audit event.

## P1: важные риски

### 4. Readiness endpoint всегда возвращает `ready`

Файл: `apps/api/Controllers/HealthController.cs`

`GET /health/ready` сейчас возвращает `Ok(new { status = "ready" })` без проверки PostgreSQL, migrations и storage.

Риск: proxy/оператор считает API готовым, хотя БД или file storage могут быть недоступны.

Рекомендация:

- `/health/live`: оставить простым.
- `/health/ready`: проверять DB connectivity, pending migrations, доступность `mobile-files` storage и критичные фоновые зависимости.

### 5. Mobile file upload доверяет клиентским `SizeBytes` и `Sha256`

Файл: `libs/infrastructure/Persistence/MobileApp/EfMobileAppService.Files.cs`

Сервис проверяет `command.SizeBytes` и content type, но поток записывается через `command.Content.CopyTo(output)` без пересчета фактического размера и SHA-256. `Sha256` сохраняется из клиента.

Риск: рассинхронизация данных, обход лимита через некорректный metadata, невозможность надежной дедупликации/проверки вложений. Особенно важно после добавления видео.

Рекомендация:

- Считать фактические bytes во время записи.
- Пересчитать SHA-256 на сервере.
- Сравнить с заявленным `sizeBytes`/`sha256`, если клиент их передал.
- Удалять файл и возвращать validation error при mismatch.
- Добавить allowlist типов: `image/jpeg`, `video/mp4`; при возможности проверять magic bytes.

### 6. CORS захардкожен под dev/LAN и разрешает любые headers/methods

Файл: `apps/api/Program.cs`

Origins прописаны прямо в коде, включая LAN `192.168.2.194`, и политика использует `AllowAnyHeader().AllowAnyMethod()`.

Риск: для production это слабая управляемость и высокий шанс случайно оставить dev origins.

Рекомендация:

- Перенести origins в configuration.
- Разделить dev/prod CORS policy.
- В production разрешать только реальные web origins и HTTPS.

### 7. Hard-coded dev connection string в `appsettings.json`

Файлы:

- `apps/api/appsettings.json`
- `apps/api/appsettings.Development.json`

В обоих файлах указан `Host=localhost;Database=patrol360;Username=patrol360;Password=patrol360_dev`.

Риск: если такой файл попадет в production image/config, приложение стартует с dev credentials или создаст ошибочную operational конфигурацию.

Рекомендация:

- В `appsettings.json` убрать пароль или заменить на placeholder.
- Реальные connection strings передавать через env/secret store.
- Development оставить локальным только если это осознанно и не попадает в production.

### 8. Employee import preview token основан на hard-coded secret

Файл: `apps/api/Controllers/InventoryController.cs`

`EmployeeImportPreviewTokenSecret = "patrol360.inventory.employee-import-preview.v1"` зашит в controller. Токен строится через HMAC от файла.

Риск: это не настоящий secret. Если токен должен подтверждать предварительный просмотр перед импортом, его можно воспроизвести по известному файлу и коду.

Рекомендация:

- Использовать server-side preview session с TTL и привязкой к user/session.
- Либо вынести HMAC secret в конфигурационный secret, не в source.

### 9. Production mojibake в auth/API сообщениях

Файлы-примеры:

- `apps/api/Authorization/RequirePermissionAttribute.cs`
- `apps/api/Controllers/AuthController.cs`
- `apps/api/Controllers/MobileAccountsController.cs`
- `libs/infrastructure/Persistence/EfAuthSessionService.cs`
- `libs/infrastructure/Persistence/EfMobileAppService.cs`

Риск: операторы и пользователи видят нечитаемые ошибки, audit/log/status становятся неоднозначными. Для безопасности это повышает риск неверной реакции на auth failures и incident triage.

Рекомендация:

- Исправить mojibake в production-коде.
- Добавить semantic mojibake check по паттернам `Р`, `СЃ`, `С€`, `С‚`, `Р°` и т.п. с allowlist только для legacy fixtures.

## P2: архитектурные и API-риски

### 10. Public mobile health раскрывает request metadata

Файл: `apps/api/Controllers/MobileController.cs`

`GET /api/v1/mobile/health` возвращает host, scheme, path, remoteIp, userAgent, client header.

Риск: небольшой information disclosure. Для диагностики полезно, но в production лучше минимизировать.

Рекомендация:

- В production отдавать только status/serverTime/protocolVersion.
- Подробный echo включать по debug flag или только в dev.

### 11. API contract drift не контролируется

OpenAPI/Swagger runtime artifact и contract drift check не обнаружены.

Риск: web/mobile клиенты расходятся с backend DTO, особенно при активной доработке mobile outbox, results и inventory.

Рекомендация:

- Добавить OpenAPI генерацию для dev/CI.
- Добавить check client contracts vs backend contracts.

### 12. RBAC требует ревизии по ширине read permissions

Примеры:

- `InventoryController` class-level `inventory.view` дает доступ к большому числу directory/settings read endpoint'ов.
- `SiteUsersController` class-level `site_users.write` слишком строгий для read, но это скорее UX/ops issue.
- `ResultsController.DownloadAttachment` защищен только `results.read`, без дополнительной проверки ownership/section scope. Возможно это правильно для web-admin, но это нужно подтвердить product/security решением.

Рекомендация:

- Составить permission matrix: endpoint -> permission -> роль -> данные.
- Добавить tests на least privilege для sensitive endpoints: users, mobile accounts, results attachments, inventory exports, perco diagnostics/logs.

## Что уже хорошо

- Site user и mobile passwords хешируются через `PasswordHasher`.
- Access/refresh tokens генерируются через криптографический RNG и хешируются в БД.
- Mobile refresh привязан к `deviceId`.
- `ResultsController` скачивает attachment через `GetAttachmentFile`, где путь нормализуется и проверяется на нахождение внутри `mobile-files`.
- EMU report/shift endpoints в текущем коде используют section-scope через `GetAllowedEmuSectionIds`.
- Mobile outbox использует `clientOperationId`, что снижает риск дублей при повторной отправке.

## Приоритетный план исправлений

1. Закрыть `MobileAccountsController`: class-level `mobile_accounts.read`, tests на 401/403/200.
2. Добавить auth coverage test для всех API actions с allowlist публичных endpoint'ов.
3. Добавить login rate limiting/lockout для web и mobile.
4. Усилить mobile upload: серверный размер, SHA-256, content allowlist/magic bytes.
5. Реализовать реальный `/health/ready`.
6. Вынести CORS origins и connection strings в env/config.
7. Исправить mojibake в production auth/API/status строках и усилить encoding gate.
8. Перевести кастомную authorization модель на ASP.NET authentication handlers + policies.
9. Добавить OpenAPI artifact и contract drift check.
10. Провести отдельный dependency/container audit: npm audit, NuGet audit, image scan.

## Ограничения аудита

- Codex Security plugin не смог стартовать из-за отсутствующего Python в текущей среде.
- DB integration тесты в обычном `dotnet test --no-build` пропущены.
- Не проводился live HTTP fuzzing/DAST.
- Не проверялись реальные production proxy/TLS/container настройки.
