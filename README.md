# Патруль 360

Monorepo системы управления обходами территории, мобильной работой сотрудников, учетом работ ЭМУ и бухгалтерским учетом Inventory. В состав решения входят административная веб-панель, ASP.NET Core API, фоновый worker и Android-приложение с offline-first синхронизацией.

Навигация по актуальным документам, runbook-ам, спецификациям и историческим аудитам: [docs/README.md](./docs/README.md).

## Текущий статус

В рабочем контуре реализованы:

- аутентификация веб- и мобильных пользователей, сессии, роли, права и области доступа;
- сотрудники, маршруты, контрольные точки NFC/QR, заявки, назначения и результаты обходов;
- мобильные аккаунты, устройства, push-уведомления, offline-сессия и outbox-синхронизация;
- Inventory: номенклатура, остатки, выдача, возврат, списание, хранение под ответственность, СИЗ, история, отчеты, настройки и аудит;
- ЭМУ: планы, рабочие сессии, смены, решения по конфликтам, история и выгрузки;
- интеграция PERCo-Web, ручная и автоматическая синхронизация;
- фоновые задачи доставки push, обслуживания ЭМУ и запуска синхронизации PERCo.

Экран планирования обходов уже использует реальные заявки, назначения, маршруты и сотрудников, но отдельный backend CRUD расписаний и исключений пока не выделен.

## Inventory / Web-инвентарь

Интеграция Web-инвентаря в Patrol360 находится в рабочей стадии: основные read/write-сценарии уже перенесены, а parity и проверка миграции продолжаются. Главные документы лежат в корне и `docs`:

- [INVENTORY_MIGRATION_NAVIGATION.md](./INVENTORY_MIGRATION_NAVIGATION.md) - где что находится, откуда брать данные, какие API/CSS/документы использовать и как проверять перенос.
- [INVENTORY_INTEGRATION_PLAYBOOK.md](./INVENTORY_INTEGRATION_PLAYBOOK.md) - пошаговая инструкция интеграции интерфейса и механики Web-инвентаря по модулям.
- [docs/inventory-interface-style.css](./docs/inventory-interface-style.css) - standalone CSS-пакет интерфейсов Inventory.
- [docs/inventory-interface-map.md](./docs/inventory-interface-map.md) - карта классов CSS по экранам и модулям.
- [docs/adr/0004-inventory-bounded-context.md](./docs/adr/0004-inventory-bounded-context.md) - ADR по Inventory bounded context и схемам БД.
- [docs/inventory-legacy-import-run-2026-05-20.md](./docs/inventory-legacy-import-run-2026-05-20.md) - отчет последнего импорта legacy БД.

Текущий статус Inventory:

- Данные импортированы из копии PostgreSQL `inventory_app_migration_copy` в целевую БД `patrol360`.
- Production БД Web-инвентаря и пароль `admin` не менялись.
- В Patrol360 работают read/write API и веб-экраны каталога, остатков, операций, ответственного хранения, СИЗ, сотрудников, пользователей, отчетов, настроек, истории и системного журнала.
- Поддерживаются preview/import сотрудников, dry-run и журнал legacy-импорта, печатные формы и экспорт Inventory.
- Дальнейшая работа по Inventory сосредоточена на проверке parity с legacy, качестве данных, печатных формах и стабилизации сценариев СИЗ.

## Основной стек

- Backend: ASP.NET Core 10, C#, Entity Framework Core и Npgsql.
- Frontend: React 19, TypeScript и Vite.
- Mobile: React Native + Expo, Expo Router, SQLite/SQLCipher, NFC, камера и push-уведомления.
- Worker: .NET Worker для push-доставки, обслуживания ЭМУ и автоматической синхронизации PERCo.
- Активные runtime-зависимости: PostgreSQL, локальное/volume-хранилище вложений, Firebase Cloud Messaging и in-process cache.
- Redis, RabbitMQ и MinIO доступны в `infra/docker`, но пока остаются инфраструктурным резервом и не являются обязательными зависимостями application-кода.

## Структура

```text
apps/
  api/       ASP.NET Core API host
  web/       React + TypeScript + Vite frontend
  worker/    .NET Worker host
mobiel proekt/     Android-приложение сотрудников на React Native + Expo
libs/
  domain/          доменные типы
  application/     use cases, query/command interfaces
  contracts/       DTO/API contracts
  infrastructure/  инфраструктурные реализации
docs/
  README.md
  architecture.md
  technology-stack.md
  modules.md
  monorepo-structure.md
  tz-normalization.md
  inventory-interface-style.css
  inventory-interface-map.md
infra/
  docker/    локальные PostgreSQL/Redis/RabbitMQ/MinIO
tests/
  Patrol360.Structure.Tests/
  Patrol360.Domain.Tests/
  Patrol360.Application.Tests/
  Patrol360.Infrastructure.Tests/
  Patrol360.Api.Tests/
  Patrol360.Worker.Tests/
  web/
tools/
  локальные проверки и утилиты
legacy/
  territory-patrol-panel/
```

Название каталога `mobiel proekt` сохранено для совместимости с текущими скриптами сборки. Native Android-проект генерируется во временном ASCII-пути и не является источником истины.

## Локальный запуск

Backend API:

```powershell
dotnet run --project .\apps\api\Patrol360.Api.csproj
```

Frontend:

```powershell
cd .\apps\web
npm install
npm run dev
```

Для прямого обращения frontend к backend без Vite proxy можно задать `VITE_API_BASE_URL` по примеру `apps/web/.env.example`.

Полный Docker-запуск API, web и локальной инфраструктуры:

```powershell
docker compose --profile app up -d --build
```

- Web HTTPS: `https://localhost`
- Web HTTPS LAN: `https://192.168.2.194`
- Web HTTPS LAN legacy-port: `https://192.168.2.194:5173`
- API через proxy: `https://192.168.2.194/api/...`
- Health через proxy: `https://192.168.2.194/health/ready`

В Docker-профиле `app` наружу смотрит только `proxy` на портах `80`, `443` и `5173`. Контейнеры `web` и `api` доступны только внутри Docker-сети.

Перед первым HTTPS-запуском создать локальный Root CA и серверный сертификат:

```powershell
openssl req -x509 -nodes -days 1825 -newkey rsa:4096 -keyout .\infra\docker\certs\patrol360.rootCA.key -out .\infra\docker\certs\patrol360.rootCA.crt -config .\infra\docker\certs\openssl-ca.cnf
openssl req -new -nodes -newkey rsa:2048 -keyout .\infra\docker\certs\patrol360.local.key -out .\infra\docker\certs\patrol360.local.csr -config .\infra\docker\certs\openssl-san.cnf
openssl x509 -req -days 825 -in .\infra\docker\certs\patrol360.local.csr -CA .\infra\docker\certs\patrol360.rootCA.crt -CAkey .\infra\docker\certs\patrol360.rootCA.key -CAcreateserial -out .\infra\docker\certs\patrol360.local.crt -extfile .\infra\docker\certs\openssl-san.cnf -extensions v3_req
```

Чтобы у пользователей не было предупреждения браузера, файл `infra/docker/certs/patrol360.rootCA.crt` нужно добавить в доверенные корневые сертификаты на их компьютерах.

Для Windows-клиента импортировать нужно Root CA:

```powershell
certutil -user -addstore Root .\infra\docker\certs\patrol360.rootCA.crt
```

Windows может показать системное подтверждение доверия к корневому сертификату. После подтверждения браузер будет открывать `https://192.168.2.194` и `https://192.168.2.194:5173` без предупреждения.

Остановить Docker-стек:

```powershell
docker compose --profile app down
```

## Мобильное приложение

Разработка и проверка:

```powershell
cd '.\mobiel proekt'
npm install
npm run verify
npm run start
```

Для NFC, SQLCipher и production-проверок нужен dev/release build, а не Expo Go. Подписанная локальная APK собирается штатным wrapper-скриптом; release-контур должен быть задан явно:

```powershell
$env:PATROL360_ENVIRONMENT = 'local-enterprise'
.\scripts\build-release-apk.ps1
```

Если DPAPI-метаданные ключа находятся не в стандартном файле, wrapper принимает параметр `-SecretPath`. Результат: `mobiel proekt/build-output/patrol360-mobile-release.apk`. Подробности и команды debug-сборки приведены в [`mobiel proekt/README.md`](./mobiel%20proekt/README.md).

## Проверки

Проверка сборки и кодировки:

```powershell
dotnet build .\Patrol360.slnx
.\tools\Verify-TextEncoding.ps1
npm run verify --prefix apps\web
npm run verify --prefix '.\mobiel proekt'
```

Единая локальная проверка структуры, backend, frontend и кодировки:

```powershell
.\tools\Test-All.ps1
```

С e2e smoke-тестом frontend:

```powershell
.\tools\Test-All.ps1 -IncludeE2E
```

С DB-backed integration smoke через локальный PostgreSQL:

```powershell
docker compose -f .\infra\docker\compose.yaml up -d postgres
.\tools\Test-All.ps1 -IncludeDbIntegration
```

## API

Основные группы действующих endpoint-ов:

- health: `/health/live`, `/health/ready`;
- web auth и RBAC: `/api/v1/auth`, `/api/v1/site-users`, `/api/v1/system-notifications`;
- обходы: `/api/v1/dashboards`, `/api/v1/patrol-requests`, `/api/v1/assignments`, `/api/v1/routes`, `/api/v1/results`, `/api/v1/employees`;
- мобильный контур: `/api/v1/mobile`, `/api/v1/mobile-accounts`, `/api/v1/mobile-sync`;
- Inventory: `/api/v1/inventory`;
- ЭМУ: `/api/v1/emu`;
- PERCo-Web: `/api/v1/integrations/perco`;
- эволюция контрактов чтения: `/api/v2/results`, `/api/v3/results`, `/api/v2/mobile/work-items`.

Большинство web endpoint-ов защищено bearer-сессией и permission policies. Мобильные endpoint-ы используют отдельную схему bearer-аутентификации. Полный актуальный список следует определять по контроллерам в `apps/api/Controllers` и контрактам в `libs/contracts`.

## Важные ограничения

- Повторный импорт Inventory выполнять только из копии `inventory_app_migration_copy`.
- Рабочую БД Web-инвентаря не менять.
- Пароль `admin` не менять автоматически.
- Исторические данные не удалять физически без отдельного решения.
- Если `Test-All.ps1` падает на `npm ci` с `EPERM unlink ... rollup/esbuild`, это известная блокировка Windows native module; frontend проверять отдельными командами `npm run test/typecheck/build --prefix apps\web`.
