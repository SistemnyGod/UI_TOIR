# Технологический стек

Дата актуализации: 2026-07-22.

## Фактически используемый стек

| Контур | Технологии | Статус |
|---|---|---|
| Backend API | ASP.NET Core 10, C#, controllers | Рабочий |
| Application/domain | .NET 10 class libraries | Рабочий |
| Persistence | EF Core 10.0.4, Npgsql 10.0.1, PostgreSQL 17 | Рабочий |
| Web frontend | React 19, TypeScript 5.9, Vite 7 | Рабочий |
| Web tests | Vitest 4, Testing Library, Playwright 1.60 | Рабочий |
| Android mobile | React Native 0.85, Expo 56, Expo Router | Рабочий |
| Mobile storage | Expo SQLite + SQLCipher, SecureStore | Рабочий |
| Mobile device APIs | NFC, camera, image picker, notifications, background tasks | Рабочий |
| Worker | .NET Worker | Рабочий |
| Push | Firebase Admin / FCM | Рабочий при наличии конфигурации |
| Reports | ClosedXML, Open XML SDK, QuestPDF | Рабочий в профильных модулях |
| Reverse proxy | Caddy + Nginx web container | Рабочий Docker-контур |
| Solution/SDK | `.slnx`, .NET SDK из `global.json` | Рабочий |

## Backend

`apps/api` использует:

- ASP.NET Core controllers;
- отдельные bearer authentication handlers для web и mobile;
- authorization fallback policy и permission attributes;
- Problem Details и validation responses;
- rate limiting auth endpoint-ов;
- forwarded headers и CORS allowlist;
- dependency injection через `libs/infrastructure`.

OpenAPI generation пока не подключен. Контракты поддерживаются вручную между `libs/contracts`, TypeScript DTO и mobile Zod schemas.

## Web frontend

`apps/web` использует:

- React 19 и strict TypeScript;
- Vite для dev/build;
- hash routing и screen registry;
- feature screens/components;
- repository + hook слой для API/mock data sources;
- локальный presentation state и формы;
- permission-driven rendering;
- Lucide icons.

TanStack Query в web не используется: загрузка и mutations организованы через repositories и React hooks. Добавлять новую state/data библиотеку следует только после отдельного решения, а не исходя из старого плана.

Основные проверки:

- `npm run typecheck --prefix apps/web`;
- `npm run test:unit --prefix apps/web`;
- `npm run build --prefix apps/web`;
- `npm run test:e2e --prefix apps/web`.

## Mobile

`mobiel proekt` использует:

- React Native 0.85 и React 19;
- Expo 56 и Expo Router;
- TypeScript 6;
- TanStack Query для remote/query state;
- Zod для runtime-проверки API-контрактов;
- SQLite/SQLCipher и WAL для локальных данных;
- SecureStore и Local Authentication;
- NFC Manager, Camera, Image Picker и File System;
- Notifications, Task Manager и Background Task;
- NetInfo для сетевой политики.

Android baseline:

- package `ru.patrol360.mobile`;
- min SDK 24;
- target/compile SDK 36;
- arm64 release build;
- Java 17 и NDK 27 для локальной нативной сборки;
- release APK подписывается отдельным RSA-ключом через штатный wrapper.

Expo Go не подходит для NFC, SQLCipher и production-проверок; нужен dev/release build.

## Worker

`apps/worker` выполняет:

- отправку queued FCM push;
- обновление уведомлений ЭМУ;
- ежедневный carry-over незавершенных работ;
- автоматическую синхронизацию PERCo.

Hangfire и RabbitMQ для этих циклов сейчас не используются.

## Данные, файлы и документы

Основная серверная БД — PostgreSQL. Mapping и migrations находятся в `libs/infrastructure`.

Текущий файловый контур:

- локальные/volume mobile attachments;
- локальные диагностические отчеты;
- DOCX templates Inventory;
- формируемые export/print файлы.

Генерация документов:

- Open XML SDK — DOCX;
- ClosedXML — XLSX;
- QuestPDF — PDF;
- ручная CSV serialization в профильных exports.

## Docker и инфраструктура

`infra/docker/compose.yaml` содержит:

- production-like app profile: migrate, API, web, worker, proxy;
- PostgreSQL;
- Redis;
- RabbitMQ;
- MinIO.

Снаружи app profile публикует proxy на портах 80, 443 и 5173. API и web container доступны внутри Docker network.

Redis, RabbitMQ и MinIO подняты как инфраструктурный резерв. Application-код пока не использует их как обязательные adapters.

## Наблюдаемость

Фактически используется console logging и профильные журналы/диагностика в БД или локальном хранилище.

OpenTelemetry, Prometheus/Grafana, Serilog и Elastic/OpenSearch не подключены. Они остаются возможными направлениями после определения требований к production monitoring.

## Качество и тесты

Backend:

- xUnit unit/smoke tests;
- API authorization/contract tests;
- DB-backed integration tests для assignments, results, mobile, Inventory, EMU и push;
- структурный executable test project.

Frontend:

- Vitest и Testing Library;
- structural checks;
- Playwright API/UI smoke.

Mobile:

- Node test runner для sync, security, retention и contract policies;
- TypeScript;
- Expo ESLint;
- encoding check;
- emulator/device QA для NFC, camera, offline и background behavior.

Единая команда репозитория — `.\tools\Test-All.ps1`; DB и e2e контуры включаются флагами.

## Запланированные технологии

Следующие технологии не должны описываться как уже подключенные:

- Redis application cache/session coordination;
- RabbitMQ/MassTransit event bus;
- MinIO/S3 production object storage;
- Hangfire job orchestration;
- SignalR realtime;
- OpenTelemetry/Prometheus/Grafana;
- OpenAPI generation и TypeScript DTO codegen.

Их внедрение требует отдельного ADR или изменения канонической архитектуры.
