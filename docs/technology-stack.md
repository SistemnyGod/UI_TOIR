# Технологический стек

## Принятый основной вариант

| Контур | Технология | Статус |
|---|---|---|
| Backend API | ASP.NET Core на C# | создан skeleton |
| Frontend | React + TypeScript + Vite | создано приложение и вкладки UI |
| Worker | .NET Worker | создан skeleton |
| Solution | `.slnx`, .NET SDK 10 | создано |
| База данных | PostgreSQL | запланировано |
| ORM/provider | EF Core + Npgsql | запланировано |
| Cache | Redis | docker baseline есть |
| Queue/event bus | RabbitMQ + MassTransit | запланировано |
| Background jobs | Hangfire | запланировано после уточнения границ |
| Object storage | MinIO/S3 | docker baseline есть |
| Realtime web | SignalR | запланировано |
| Mobile push | FCM | сохранить совместимость |
| Observability | OpenTelemetry + Prometheus + Grafana | запланировано |
| Logs | Serilog + Elastic/OpenSearch контур | запланировано |
| E2E | Playwright | запланировано |

## Почему не Razor UI

Razor/Blazor сейчас не выбран как основной UI-слой.

Причины:

- ТЗ ориентируется на отдельный SPA/frontend.
- Операционная панель будет богата таблицами, фильтрами, drawer/modal состояниями и локальными интеракциями.
- React + TypeScript + Vite лучше подходит для быстрого UI-цикла и будущего компонентного UI-kit.
- Backend на C# остается чистым API и не смешивается с rendering-логикой панели.

## Frontend baseline

`apps/web`:

- React 19;
- TypeScript strict mode;
- Vite;
- компонентная структура:
  - `components/ui.tsx`;
  - `screens/*Screen.tsx`;
  - `data.ts`;
  - `types.ts`.

Текущее состояние frontend:

- без backend-запросов;
- доменные массивы в `data.ts` оставлены пустыми, чтобы не показывать фальшивые обходы/сотрудников/маршруты;
- для всех вкладок добавлены пустые состояния;
- рабочие табы и локальные selected states;
- модалки создания/просмотра заявки работают как локальный UI-черновик;
- подготовка к typed API client.

Следующий frontend-этап:

- выделить API client;
- подключить TanStack Query;
- добавить table/form библиотеки только после стабилизации экранов;
- вынести design tokens в отдельный слой.

## Backend baseline

`apps/api`:

- ASP.NET Core controllers;
- health endpoints;
- первые read endpoints;
- dependency injection через infrastructure слой.

Следующий backend-этап:

- OpenAPI;
- EF Core + Npgsql;
- auth/RBAC skeleton;
- module endpoint groups;
- `problem+json`;
- correlation-id middleware.

## Worker baseline

`apps/worker` пока пустой worker host.

Будущая нагрузка:

- отчеты;
- импорты;
- outbox;
- уведомления;
- обслуживание расписаний;
- тяжелые фоновые операции.

Решение о Hangfire/RabbitMQ разделении фиксируется после NFR discovery.

## Инфраструктура разработки

`infra/docker/compose.yaml` содержит локальные stateful-сервисы:

- PostgreSQL;
- Redis;
- RabbitMQ;
- MinIO.

Это baseline для разработки, не production manifest.

## Проверки качества

Минимум для текущего этапа:

- `dotnet build .\Patrol360.slnx`;
- `npm run build` в `apps/web`;
- smoke endpoints `/health/ready`;
- визуальная проверка вкладок.

Будущие проверки:

- xUnit unit/integration tests;
- Vitest component tests;
- Playwright e2e smoke;
- API contract tests;
- migration validation tests.
