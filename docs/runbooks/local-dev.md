# Local development runbook

## Требования

- .NET SDK из `global.json`.
- Node.js, совместимый с Vite 7.
- Docker Desktop или совместимый Docker runtime для локальной инфраструктуры.

## Инфраструктура

```powershell
docker compose -f .\infra\docker\compose.yaml up -d
```

Сервисы:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- RabbitMQ: `localhost:5672`, management UI `localhost:15672`
- MinIO: API `localhost:9000`, console `localhost:9001`

## Backend

```powershell
dotnet run --project .\apps\api\Patrol360.Api.csproj
```

## Frontend

```powershell
cd .\apps\web
npm install
npm run dev
```

## Полный запуск через Docker

```powershell
docker compose -f .\infra\docker\compose.yaml --profile app up --build
```

Порты:

- Web: `http://localhost:5173`
- API: `http://localhost:5080`
- PostgreSQL: `localhost:5432`
- RabbitMQ Management: `http://localhost:15672`
- MinIO Console: `http://localhost:9001`

Остановить:

```powershell
docker compose -f .\infra\docker\compose.yaml --profile app down
```

## Проверки

```powershell
.\tools\Test-All.ps1
```

Скрипт сохраняет отчеты в `TestResults/`. Для e2e-проверок frontend:

```powershell
.\tools\Test-All.ps1 -IncludeE2E
```

Подробности по generated test reports описаны в `docs/runbooks/test-artifacts.md`.

Для очистки generated artifacts:

```powershell
.\tools\Clean-Workspace.ps1
```
