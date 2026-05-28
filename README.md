# Патруль 360

Monorepo для новой веб-системы обходов территории и интеграции модуля Web-инвентаря.

## Inventory / Web-инвентарь

Перенос Web-инвентаря в Patrol360 уже начат. Главные документы лежат в корне и `docs`:

- [INVENTORY_MIGRATION_NAVIGATION.md](./INVENTORY_MIGRATION_NAVIGATION.md) - где что находится, откуда брать данные, какие API/CSS/документы использовать и как проверять перенос.
- [INVENTORY_INTEGRATION_PLAYBOOK.md](./INVENTORY_INTEGRATION_PLAYBOOK.md) - пошаговая инструкция интеграции интерфейса и механики Web-инвентаря по модулям.
- [docs/inventory-interface-style.css](./docs/inventory-interface-style.css) - standalone CSS-пакет интерфейсов Inventory.
- [docs/inventory-interface-map.md](./docs/inventory-interface-map.md) - карта классов CSS по экранам и модулям.
- [docs/adr/0004-inventory-bounded-context.md](./docs/adr/0004-inventory-bounded-context.md) - ADR по Inventory bounded context и схемам БД.
- [docs/inventory-legacy-import-run-2026-05-20.md](./docs/inventory-legacy-import-run-2026-05-20.md) - отчет последнего импорта legacy БД.

Текущий статус Inventory:

- Данные импортированы из копии PostgreSQL `inventory_app_migration_copy` в целевую БД `patrol360`.
- Production БД Web-инвентаря и пароль `admin` не менялись.
- Основной следующий этап: read-only parity по `Inventory.Catalog`, затем Stock, Operations, Custody, PPE и Reports.

## Основной стек

- Backend: ASP.NET Core на C#.
- Frontend: React + TypeScript + Vite.
- Worker: .NET Worker для фоновых задач.
- БД и инфраструктура: PostgreSQL, Redis, RabbitMQ, MinIO через `infra/docker`.

## Структура

```text
apps/
  api/       ASP.NET Core API host
  web/       React + TypeScript + Vite frontend
  worker/    .NET Worker host
libs/
  domain/          доменные типы
  application/     use cases, query/command interfaces
  contracts/       DTO/API contracts
  infrastructure/  инфраструктурные реализации
docs/
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

## Проверки

Проверка сборки и кодировки:

```powershell
dotnet build .\Patrol360.slnx
.\tools\Verify-TextEncoding.ps1
npm run verify --prefix apps\web
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

## Текущие API endpoints

- `GET /health/live`
- `GET /health/ready`
- `GET /api/v1/inventory/overview`
- `GET /api/v1/inventory/items?page=1&pageSize=25`
- `GET /api/v1/inventory/stock?page=1&pageSize=25`
- `GET /api/v1/inventory/documents?page=1&pageSize=25`
- `GET /api/v1/inventory/custody/records?page=1&pageSize=25`
- `GET /api/v1/inventory/custody/documents?page=1&pageSize=25`
- `GET /api/v1/inventory/ppe/cards?page=1&pageSize=25`
- `GET /api/v1/inventory/history?page=1&pageSize=25`
- `GET /api/v1/inventory/reports?page=1&pageSize=25`
- `GET /api/v1/inventory/system-log?page=1&pageSize=25`

## Важные ограничения

- Повторный импорт Inventory выполнять только из копии `inventory_app_migration_copy`.
- Рабочую БД Web-инвентаря не менять.
- Пароль `admin` не менять автоматически.
- Исторические данные не удалять физически без отдельного решения.
- Если `Test-All.ps1` падает на `npm ci` с `EPERM unlink ... rollup/esbuild`, это известная блокировка Windows native module; frontend проверять отдельными командами `npm run test/typecheck/build --prefix apps\web`.
