# Структура monorepo

Дата актуализации: 2026-07-22.

Patrol360 развивается как monorepo: backend, web, worker, mobile, контракты, migrations, инфраструктура, тесты и документация изменяются согласованно.

## Корневые точки входа

- `Patrol360.slnx` — .NET solution;
- `compose.yaml` — корневой include для Docker Compose;
- `README.md` — обзор, запуск и текущий статус;
- `Start-Patrol360.cmd` и `tools/Start-Patrol360.ps1` — штатный локальный Docker-запуск;
- `Directory.Build.props`, `global.json` — общие .NET-настройки.

## apps/api

ASP.NET Core API host.

Ответственность:

- HTTP controllers и routing;
- web/mobile authentication;
- permission authorization;
- rate limiting, CORS и forwarded headers;
- validation и mapping HTTP responses;
- композиция application/infrastructure services.

API host не должен содержать EF queries или дублировать бизнес-логику service implementations.

## apps/web

React + TypeScript + Vite административная панель.

Основные слои:

- `src/app` — shell, auth, routing и composition;
- `src/features` — экраны и компоненты продуктовых модулей;
- `src/repositories` — API/mock/browser-storage adapters;
- `src/hooks` — workspace orchestration;
- `src/api` — HTTP client, DTO и data-source configuration;
- `src/security` — permission helpers;
- `src/shared` — переиспользуемые UI/styles/API helpers;
- `src/__tests__` и `e2e` — component/unit и Playwright tests.

Продуктовые feature-группы: patrol, inventory, EMU, PERCo, users и mobile accounts.

Mock mode используется для изолированной UI-разработки. API mode работает с backend и не должен подмешивать mock/localStorage записи в серверные списки.

## apps/worker

.NET Worker host для периодических прикладных задач:

- mobile push delivery;
- EMU notifications и carry-over;
- автоматическая PERCo sync.

Worker использует application interfaces и infrastructure implementations через DI.

## mobiel proekt

Android-приложение сотрудников на React Native + Expo.

Основные слои:

- `app` — Expo Router routes/layouts;
- `src/auth` — online/offline session и device identity;
- `src/api` — HTTP clients и Zod schemas;
- `src/db` — SQLCipher database и repositories;
- `src/domain` — mobile domain rules;
- `src/features` — patrol, EMU, settings, profile и camera screens;
- `src/sync` — ordered outbox, retry, reconciliation и background sync;
- `src/services` — media, notifications, diagnostics и device APIs;
- `tests` — Node policy/contract tests;
- `scripts` — encoding, keystore и APK build scripts.

`android` — генерируемый native-проект и исключен из Git. Источником истины являются Expo config, TypeScript-код и build scripts. Название каталога сохраняется ради совместимости существующей автоматизации.

## libs/domain

Доменный слой без ASP.NET/EF/файловых зависимостей. Содержит доменные типы и инварианты.

## libs/application

Application-порты и сценарии:

- query/command interfaces;
- orchestration contracts;
- time, notifications, files и integration abstractions.

## libs/contracts

C# DTO и API read/write contracts. Пока OpenAPI codegen отсутствует, изменения здесь должны вручную синхронизироваться с web DTO и mobile schemas.

## libs/infrastructure

Реализации application-портов:

- `Patrol360DbContext`, entities, configurations и migrations;
- patrol, mobile, Inventory, EMU, auth/RBAC и PERCo services;
- file/attachment stores;
- FCM push;
- DOCX/XLSX/PDF generation;
- seed data и templates.

Infrastructure может зависеть от application/domain/contracts; обратная зависимость запрещена.

## infra

Инфраструктура локального и production-like запуска:

- `docker/compose.yaml` — migrate, API, web, worker, proxy и stateful services;
- `docker/certs` — локальная TLS-конфигурация;
- `docker/secrets` — локальные ignored secrets и data-protection keys;
- compose overrides для prebuilt/smoke сценариев;
- scripts обновления и обслуживания контейнеров.

Redis, RabbitMQ и MinIO присутствуют в Compose, но не являются обязательными adapters application-кода.

## tests

.NET:

- `Patrol360.Domain.Tests`;
- `Patrol360.Application.Tests`;
- `Patrol360.Infrastructure.Tests`;
- `Patrol360.Api.Tests`;
- `Patrol360.Worker.Tests`;
- `Patrol360.Structure.Tests`.

Infrastructure tests включают DB-backed сценарии assignments, results, mobile, push, Inventory и EMU. Они пропускаются без явно включенного PostgreSQL-контура.

Web:

- Vitest/Testing Library tests в `apps/web/src/__tests__`;
- structural checks в `tests/web/unit`;
- Playwright e2e в `apps/web/e2e` и вспомогательная документация в `tests/web/e2e`.

Mobile tests находятся внутри `mobiel proekt/tests`, потому что используют mobile TypeScript modules и Node test runner.

## tools

Основные команды:

- `Start-Patrol360.ps1`;
- `Test-All.ps1`;
- `Verify-TextEncoding.ps1`;
- `Check-Structure.ps1`;
- `Clean-Workspace.ps1`;
- Inventory migration helpers;
- GitHub branch-protection helper.

## docs

Точка входа — [README.md](./README.md).

Документы делятся на:

- канонические architecture/modules/stack/structure/runbooks;
- ADR;
- модульные navigation notes;
- требования и планы;
- датированные аудиты и status snapshots.

Исторический аудит не переписывается как текущая инструкция. Актуальные утверждения вносятся в канонические документы.

## .github

- CI workflow;
- pull request template;
- repository automation.

Branch protection и CI contract описаны в `docs/runbooks`.

## legacy

`legacy/territory-patrol-panel` — старый статический UI-прототип. Legacy-код не участвует в новой feature-разработке и не должен становиться зависимостью активных приложений.

## Generated и локальные артефакты

`bin`, `obj`, `dist`, `build-output`, `TestResults`, временные audit/output каталоги и native build caches не являются исходниками. Их не следует добавлять в навигацию документации или использовать как источник истины.
