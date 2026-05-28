# Docker runbook

## Назначение

Docker-стек нужен для воспроизводимого локального запуска Patrol360: PostgreSQL, API, frontend, reverse proxy и фоновые сервисы поднимаются одной командой.

## Быстрый запуск приложения

Из корня репозитория:

```powershell
docker compose -f .\infra\docker\compose.yaml --profile app up -d --build
```

Проверка:

```powershell
curl http://localhost:5173/health/ready
curl http://192.168.2.194:5173/health/ready
```

Открыть UI:

```text
http://localhost:5173
http://192.168.2.194:5173
https://localhost
https://192.168.2.194
```

Основной рабочий URL для локальной сети: `http://192.168.2.194:5173`.

## Только инфраструктура

Если нужно поднять только stateful-сервисы без API и frontend:

```powershell
docker compose -f .\infra\docker\compose.yaml up -d postgres redis rabbitmq minio
```

Сервисы:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- RabbitMQ: `localhost:5672`, management UI `http://localhost:15672`
- MinIO: API `http://localhost:9000`, console `http://localhost:9001`

## Что изменено для стабильности

- `api`, `web`, `proxy`, `postgres`, `redis`, `rabbitmq` получили healthcheck.
- `web` и `proxy` ждут готовности API, а не просто старта контейнера.
- Добавлен контейнер `worker` для фоновых задач ЭМУ.
- У всех сервисов включен `restart: unless-stopped`.
- Логи контейнеров ограничены `10 MB x 3`, чтобы Docker не раздувал диск.
- `apps/web/nginx.conf` умеет проксировать `/api/*` и `/health/*` напрямую в API. Это помогает, если web-контейнер открывают без Caddy.
- Статические ассеты кешируются долго, а `index.html` не кешируется, чтобы после пересборки браузер не держал старый shell.

## Полная пересборка без кеша

Если UI выглядит старым после правок:

```powershell
docker compose -f .\infra\docker\compose.yaml build --no-cache web
docker compose -f .\infra\docker\compose.yaml --profile app up -d web proxy
```

Если менялся backend или worker:

```powershell
docker compose -f .\infra\docker\compose.yaml build --no-cache api worker
docker compose -f .\infra\docker\compose.yaml --profile app up -d api worker proxy
```

## Диагностика

```powershell
docker ps
docker compose -f .\infra\docker\compose.yaml ps
docker logs --tail 120 patrol360-api
docker logs --tail 120 patrol360-web
docker logs --tail 120 patrol360-proxy
docker logs --tail 120 patrol360-worker
```

Проверка API через proxy:

```powershell
curl http://192.168.2.194:5173/health/ready
curl http://192.168.2.194:5173/api/v1/auth/me
```

`/api/v1/auth/me` без токена должен вернуть `401`. Это нормально.

## HTTPS и сертификат

HTTPS включен через Caddy и локальный сертификат из `infra/docker/certs`.

Если браузер показывает `ERR_CERT_AUTHORITY_INVALID`, нужно импортировать root CA на клиентскую машину:

```powershell
certutil -user -addstore Root .\infra\docker\certs\patrol360.rootCA.crt
```

HTTP на `:5173` остается основным рабочим вариантом для локальной проверки без сертификата.

## Остановка

Остановить приложение:

```powershell
docker compose -f .\infra\docker\compose.yaml --profile app down
```

Остановить и удалить локальные данные PostgreSQL/MinIO:

```powershell
docker compose -f .\infra\docker\compose.yaml --profile app down -v
```

Команду с `-v` использовать осторожно: она удаляет локальную базу.
