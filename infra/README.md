# Infrastructure

`infra` содержит локальные и будущие deployment-артефакты проекта.

## Локальный compose

```powershell
docker compose -f .\infra\docker\compose.yaml up -d
```

Состав:

- PostgreSQL 17
- Redis 7
- RabbitMQ 3 Management
- MinIO

## Полный Docker-запуск приложения

```powershell
docker compose -f .\infra\docker\compose.yaml --profile app up --build
```

Состав профиля `app`:

- API: `http://localhost:5080`
- Web: `http://localhost:5173`
- PostgreSQL автоматически поднимается и проверяется через healthcheck.

Frontend-контейнер отдает production build через Nginx и проксирует `/api/*` и `/health/*` во внутренний сервис `api`.

Остановить:

```powershell
docker compose -f .\infra\docker\compose.yaml --profile app down
```

## Env

Шаблон локальных переменных находится в `infra/env/.env.example`.

Production secrets не хранятся в репозитории.
