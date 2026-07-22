# Infrastructure

Дата актуализации: 2026-07-22.

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

PostgreSQL используется application-кодом. Redis, RabbitMQ и MinIO доступны как инфраструктурный резерв и пока не являются обязательными runtime adapters.

## Полный Docker-запуск приложения

```powershell
docker compose -f .\infra\docker\compose.yaml --profile app up --build
```

Состав профиля `app`:

- отдельный migrator;
- API;
- web;
- worker;
- reverse proxy;
- PostgreSQL и доступные stateful-сервисы.

Наружу публикуется proxy на портах `80`, `443` и `5173`. API и web containers доступны только внутри Docker network. Proxy направляет `/api/*` и `/health/*` во внутренний API.

Остановить:

```powershell
docker compose -f .\infra\docker\compose.yaml --profile app down
```

## Env

Шаблон локальных переменных находится в `infra/env/.env.example`.

Production secrets не хранятся в репозитории.

Локальные secrets в `infra/docker/secrets` игнорируются Git. Не выводите их содержимое в логи и документацию.

## Web-only update

Канонический внешний URL:

```text
http://192.168.2.194:5173
```

Локальные алиасы `http://localhost:5173` и `http://127.0.0.1:5173` не используйте для smoke:
они имеют отдельные browser cookies/localStorage и могут показывать другой session/mock-api state.
Proxy перенаправляет эти алиасы на канонический LAN URL.

Для обновления только web-статики используйте:

```powershell
.\infra\scripts\update-patrol360-web-only.ps1
```

Скрипт собирает `apps\web`, пересобирает `docker-web:latest`, выполняет `docker compose up -d --no-deps web`,
проверяет health `patrol360-web` и падает, если во время web-only обновления изменились container id
`patrol360-api` или `patrol360-postgres`.
