# Стабилизация проекта

Дата актуализации: 2026-07-22.

## Цель

Этот документ фиксирует обязательный инженерный baseline для изменений Patrol360. Текущий проект — не UI/.NET skeleton: web, API, worker, PostgreSQL и Android mobile образуют рабочий end-to-end контур.

## Текущий baseline

- .NET solution собирает API, worker, libraries и test projects на .NET 10.
- Web использует API-backed repositories и permission-driven UI; mock mode остается отдельным режимом.
- PostgreSQL schema управляется EF migrations.
- Web и mobile используют разные bearer authentication schemes.
- Android mobile работает offline-first через SQLCipher и ordered outbox.
- Worker обслуживает mobile push, EMU и PERCo.
- Inventory, EMU, Patrol, users/RBAC и PERCo имеют рабочие backend endpoints.

Частично реализованным остается отдельный schedule bounded context: экран использует реальные заявки/назначения, но собственного CRUD расписаний нет.

## Обязательные проверки

Базовая проверка репозитория:

```powershell
.\tools\Test-All.ps1
```

Раздельные команды:

```powershell
dotnet build .\Patrol360.slnx
dotnet test .\Patrol360.slnx --no-build
npm run verify --prefix apps\web
npm run verify --prefix '.\mobiel proekt'
.\tools\Verify-TextEncoding.ps1
```

Дополнительные контуры:

```powershell
.\tools\Test-All.ps1 -IncludeE2E
.\tools\Test-All.ps1 -IncludeDbIntegration
```

DB integration требует доступного PostgreSQL. E2E требует подготовленного web/API-контура.

Если Windows блокирует native Node module с `EPERM unlink`, нельзя считать frontend непроверенным: typecheck, unit test и build запускаются отдельно из существующей установки.

## Контракты и authorization

При изменении endpoint-а:

- синхронно обновить C# DTO, web contracts/repository mapping и mobile schema, если контракт используется mobile;
- сохранить Problem Details/validation behavior;
- проверить `401`, `403` и разрешенный сценарий;
- добавить permission к backend до клиентского скрытия действия;
- проверить idempotency/version behavior write-команд;
- не вводить новый API version без необходимости совместимости.

Frontend permission check улучшает UX, но не заменяет backend authorization.

## Persistence и миграции

- Изменение EF model сопровождается migration и актуальным model snapshot.
- Production-like запуск применяет migrations отдельным сервисом `migrate`.
- API не должен стартовать поверх частично обновленной схемы.
- Исторические записи и route revisions не удаляются физически без отдельного решения.
- Повторный Inventory import запускается только из миграционной копии.
- DB-backed bug fix должен иметь integration test, если сценарий невозможно надежно проверить in-memory.

## Mobile и offline

- Любая локальная запись содержит owner/contour scope, если данные зависят от пользователя.
- Outbox command имеет стабильный client operation id.
- Повторная доставка не создает дубликат серверного эффекта.
- Неизвестный owner не трактуется как разрешение очистить локальные файлы.
- Media удаляется только после server acceptance и проверки ссылочной целостности.
- Auth revocation, temporary network failure и wrong contour обрабатываются по-разному.
- NFC/camera/background behavior проверяется на dev/release build, не в Expo Go.

## Файлы и секреты

- Signing keys, DPAPI metadata, Firebase secrets, certificates с private key и production credentials не коммитятся.
- Диагностика редактирует authorization/token/secret значения.
- Generated APK, native build, `bin/obj/dist` и test results не являются исходниками.
- Cleanup scripts запускаются только после проверки точного target path.

## Документация

- Актуальные источники истины перечислены в [README.md](./README.md).
- Датированный аудит остается историческим снимком и не переписывается как текущий baseline.
- Изменение модуля обновляет `modules.md` и профильную navigation note.
- Изменение runtime/dependency обновляет `architecture.md` и `technology-stack.md`.
- Runbook должен содержать проверенную команду и предупреждать о destructive flags.

## Release gate

Перед передачей сборки:

1. рабочее дерево и scope изменений просмотрены;
2. обязательные проверки пройдены либо отклонения перечислены явно;
3. migrations применены на тестовом контуре;
4. health endpoints отвечают через внешний proxy;
5. web smoke не содержит console/runtime ошибок;
6. mobile APK имеет ожидаемые package/version, SHA-256 и проверенную release-подпись;
7. rollback/backup путь понятен для изменения данных;
8. документация соответствует фактическому поведению.
