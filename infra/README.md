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

## Env

Шаблон локальных переменных находится в `infra/env/.env.example`.

Production secrets не хранятся в репозитории.
