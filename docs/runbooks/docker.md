# Docker runbook

## Назначение

Docker используется для воспроизводимого локального запуска Patrol360 без ручного старта API, frontend и PostgreSQL отдельными командами.

## Инфраструктура

Поднять только stateful-сервисы:

```powershell
docker compose -f .\infra\docker\compose.yaml up -d
```

Сервисы:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- RabbitMQ: `localhost:5672`, management UI `http://localhost:15672`
- MinIO: API `http://localhost:9000`, console `http://localhost:9001`

## Приложение

Поднять API, web и инфраструктуру:

```powershell
docker compose -f .\infra\docker\compose.yaml --profile app up --build
```

Проверить:

```powershell
curl http://localhost:5080/health/ready
```

Открыть UI:

```text
http://localhost:5173
```

Остановить:

```powershell
docker compose -f .\infra\docker\compose.yaml --profile app down
```

Удалить volumes с локальными данными PostgreSQL и MinIO:

```powershell
docker compose -f .\infra\docker\compose.yaml --profile app down -v
```

## Как устроено

- `apps/api/Dockerfile` собирает и публикует ASP.NET Core API.
- `apps/web/Dockerfile` собирает Vite production build и отдает его через Nginx.
- `apps/web/nginx.conf` проксирует `/api/*` и `/health/*` во внутренний compose-сервис `api`.
- `infra/docker/compose.yaml` держит приложения в профиле `app`, чтобы обычный `up -d` по-прежнему поднимал только инфраструктуру.

## Что можно автоматизировать через Docker

- One-command local start: полный запуск API, web, PostgreSQL, Redis, RabbitMQ и MinIO.
- Integration tests: прогон API/infrastructure тестов против контейнерного PostgreSQL.
- E2E tests: отдельный compose-профиль `e2e`, который поднимает stack и запускает Playwright.
- Database lifecycle: миграции, seed, reset test database, backup/restore локального volume.
- Contract checks: генерация OpenAPI и проверка frontend DTO against backend contract.
- CI parity: тот же compose stack использовать в GitHub Actions перед merge.
- Local observability: добавить Grafana/Prometheus/Loki или Seq для логов API и worker.
- Background services: отдельный Dockerfile и профиль для `apps/worker`.
- Object storage flow: MinIO bucket initialization и smoke-загрузка тестового файла.
- Message broker flow: RabbitMQ definitions/import и smoke queue publish/consume.
