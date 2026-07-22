# Документация Patrol360

Этот файл — точка входа в документацию проекта. Он отделяет актуальные источники истины от технических заданий, планов и датированных аудитов.

Дата актуализации индекса: 2026-07-22.

## Источники истины

| Область | Документ | Назначение |
|---|---|---|
| Обзор и запуск | [README проекта](../README.md) | Статус продукта, быстрый запуск, проверки и группы API |
| Архитектура | [architecture.md](./architecture.md) | Контуры приложения, зависимости, слои и runtime |
| Функциональные модули | [modules.md](./modules.md) | Реализованные bounded contexts и оставшиеся границы |
| Технологии | [technology-stack.md](./technology-stack.md) | Фактически используемый и запланированный стек |
| Структура репозитория | [monorepo-structure.md](./monorepo-structure.md) | Ответственность каталогов и правила размещения кода |
| Frontend | [frontend-architecture.md](./frontend-architecture.md) | Слои web-приложения, data sources, state и routing |
| Статусы обхода | [patrol-status-lifecycle.md](./patrol-status-lifecycle.md) | Канонические статусы и переходы обхода |
| API обходов | [patrol-api-contract.md](./patrol-api-contract.md) | Сводка контракта обходов; код контроллеров имеет приоритет |
| БД обходов | [patrol-db-model.md](./patrol-db-model.md) | Сводка основных таблиц обходов; EF model snapshot имеет приоритет |
| Стабилизация | [stabilization.md](./stabilization.md) | Текущий обязательный baseline качества |

Если документ расходится с кодом, приоритет имеют:

1. контроллеры и authorization attributes в `apps/api`;
2. DTO и application-интерфейсы в `libs/contracts` и `libs/application`;
3. EF mapping и migrations в `libs/infrastructure`;
4. web/mobile repositories, schemas и tests;
5. канонические документы из таблицы выше.

## Навигация по модулям

- [Обход](./modules/obhod-navigation.md)
- [Inventory / Бухгалтерия](./modules/inventory-navigation.md)
- [ЭМУ](./modules/emu-navigation.md)
- [PERCo-Web](./modules/perco-navigation.md)
- [Пользователи и RBAC](./modules/users-navigation.md)
- [Мобильное приложение](../mobiel%20proekt/README.md)
- [Подпись релизного APK и восстановление ключа](./mobile-release-signing.md)
- [Технические требования мобильного приложения](./mobile-app-technical-requirements.md)
- [Offline recovery мобильного приложения](./mobile-offline-recovery.md)

## Runbook-и

- [Локальная разработка](./runbooks/local-dev.md)
- [Docker](./runbooks/docker.md)
- [Миграции БД](./runbooks/database-migrations.md)
- [CI contract](./runbooks/ci-contract.md)
- [Release checklist](./runbooks/release-checklist.md)
- [Тестовые артефакты](./runbooks/test-artifacts.md)
- [Branch review policy](./runbooks/branch-review-policy.md)

Для обычного локального Docker-запуска также используется [docker-startup.md](./docker-startup.md).

## ADR

ADR фиксируют принятые решения и не переписываются как текущие инструкции:

- [ADR 0001: monorepo и modular monolith](./adr/0001-monorepo-modular-monolith.md)
- [ADR 0002: правила зависимостей слоев](./adr/0002-layer-dependency-rules.md)
- [ADR 0003: границы frontend data sources](./adr/0003-frontend-data-source-boundaries.md)
- [ADR 0004: Inventory bounded context](./adr/0004-inventory-bounded-context.md)

Если реализация развивает ADR, создается новый ADR или явное дополнение; исходное решение не маскируется ретроспективной правкой.

## Спецификации и планы

Следующие документы задают требования или backlog, но не подтверждают факт реализации:

- `*-spec.md`, `*-technical-requirements.md` — требования и целевая модель;
- `*-plan.md`, `*-ideas.md`, `*-remaining-work*.md` — планы, идеи и остаточные работы;
- `project-implementation-spec.md`, `ui-finalization-spec.md`, `tz-normalization.md` — исходные проектные спецификации;
- `accounting-development-plan.md`, `emu-work-accounting-development-plan.md` — подробные планы профильных модулей.

Статус пунктов из таких документов проверяется по коду, тестам, `modules.md` и актуальному issue register.

## Исторические аудиты и отчеты

Файлы с датой в имени, `*audit*.md`, `*status*.md` и материалы в `docs/audits/` являются снимками состояния на дату проведения. Они сохраняются для трассировки решений и не должны использоваться как текущая инструкция без повторной проверки.

К этой категории относятся:

- архитектурные, security, code-quality и refactoring аудиты июня 2026 года;
- аудиты Inventory/PPE, обходов и мобильного приложения;
- отчеты миграций и стабилизации с датой;
- `mobile-audit-report/` и сохраненные audit-артефакты.

Исторические документы не удаляются только потому, что их выводы уже реализованы или потеряли актуальность.

## Правила поддержки документации

При изменении поведения:

1. обновить канонический документ модуля и, при необходимости, корневой README;
2. не перечислять вручную каждый endpoint в нескольких местах — давать namespace и ссылку на контроллер;
3. отделять текущую реализацию от планов явными статусами;
4. указывать дату для аудитов и status snapshots;
5. использовать относительные ссылки и проверять их существование;
6. не хранить секреты, пароли, токены и содержимое signing metadata;
7. запускать `git diff --check` и `tools/Verify-TextEncoding.ps1`.

## Известные незавершенные границы

На дату актуализации:

- планирование обходов использует реальные заявки, назначения и справочники, но отдельный CRUD расписаний и исключений не выделен;
- универсальный Files API и единая очередь report jobs не выделены — файлы и экспорт принадлежат профильным модулям;
- OpenAPI code generation и автоматическая синхронизация TypeScript DTO пока не подключены;
- Redis, RabbitMQ, MinIO, Hangfire и SignalR не являются обязательными runtime-зависимостями application-кода.
