# Local development runbook

Дата актуализации: 2026-07-22.

## Требования

- .NET SDK из `global.json`;
- Node.js, совместимый с Vite 7;
- Docker Desktop или совместимый Docker runtime;
- для Android: Java 17, Android SDK 36 и настроенный native toolchain.

## Рекомендуемый полный запуск

Из корня репозитория:

```powershell
.\tools\Start-Patrol360.ps1
```

Windows double-click вариант:

```powershell
.\Start-Patrol360.cmd
```

Скрипт собирает свежий web, поднимает app profile и ждет health основных контейнеров.

Внешние URL:

- `http://192.168.2.194:5173` — канонический LAN URL;
- `http://127.0.0.1:5173` — локальный alias;
- `https://localhost`;
- `https://192.168.2.194`.

API и health доступны через proxy: `/api/*`, `/health/*`. API/web containers не публикуют отдельные host-порты в app profile.

Подробности: [../docker-startup.md](../docker-startup.md) и [docker.md](./docker.md).

## Только stateful-инфраструктура

```powershell
docker compose up -d postgres redis rabbitmq minio
```

Порты:

- PostgreSQL: `localhost:5432`;
- Redis: `localhost:6379`;
- RabbitMQ: `localhost:5672`, UI `localhost:15672`;
- MinIO: `localhost:9000`, UI `localhost:9001`.

PostgreSQL является активной application-зависимостью. Redis/RabbitMQ/MinIO доступны для инфраструктурных сценариев, но не обязательны application-коду.

## Прямой запуск API и web

Сначала поднять PostgreSQL:

```powershell
docker compose up -d postgres
dotnet run --project .\apps\api\Patrol360.Api.csproj
```

API из launch profile: `http://localhost:5080`.

В отдельном терминале:

```powershell
npm install --prefix apps\web
npm run dev --prefix apps\web
```

Для прямого frontend → API задать `VITE_API_BASE_URL` по `apps/web/.env.example`.

## Mobile

```powershell
npm install --prefix '.\mobiel proekt'
npm run verify --prefix '.\mobiel proekt'
npm run start --prefix '.\mobiel proekt'
```

Expo Go не поддерживает полный native-контур приложения. NFC, SQLCipher, camera/background и release behavior проверяются в dev/release APK.

## Проверки

```powershell
.\tools\Test-All.ps1
```

Опции:

```powershell
.\tools\Test-All.ps1 -IncludeE2E
.\tools\Test-All.ps1 -IncludeDbIntegration
```

Отчеты сохраняются в `TestResults/`. Для очистки generated artifacts:

```powershell
.\tools\Clean-Workspace.ps1
```

Перед cleanup проверить рабочее дерево и точный scope удаляемых артефактов.

## Остановка

```powershell
docker compose --profile app down
```

Не добавлять `-v`, если локальные данные PostgreSQL/MinIO должны сохраниться.
