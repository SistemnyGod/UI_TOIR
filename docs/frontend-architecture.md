# Frontend architecture

Дата актуализации: 2026-07-22.

## Назначение

`apps/web` — административный React SPA для обходов, пользователей, Inventory, ЭМУ и PERCo-Web. Frontend отвечает за presentation state и orchestration UI, но не является источником бизнес-истины.

## Композиция приложения

- `src/main.tsx` — React root, глобальные styles и recovery после stale Vite chunks;
- `src/app/App.tsx` — верхнеуровневая композиция workspace;
- `src/app/auth` — login/session UI;
- `src/app/shell` — Sidebar, Topbar и WorkspaceHeader;
- `src/app/routing` — ScreenRouter;
- `src/repositories/navigationRepository.ts` — screen registry;
- `src/data.ts` — ограниченные fallback/mock fixtures, не production data.

Навигация hash-based. Screen id является частью UI-контракта и permission mapping.

## Поток данных

```text
Screen/component → workspace hook → repository → ApiClient → ASP.NET Core API
                                  └→ mock/browser storage adapter
```

Правила:

- screen не выполняет произвольные HTTP-запросы напрямую;
- repository инкапсулирует URL, DTO и transport details;
- hook управляет loading/error/mutation/refresh состоянием;
- UI model mapping выполняется на границе repository/hook;
- API mode не смешивает серверные коллекции с локально созданными mock-записями;
- mock mode остается доступным для изолированной разработки интерфейса.

## Data-source и session

`src/api/dataSource.ts` выбирает `api` или `mock` режим. Конфигурация окружения имеет приоритет над сохраненным пользовательским выбором.

`useSession` управляет login/me/logout и состоянием текущего пользователя. До появления валидной API-сессии защищенные данные не должны запрашиваться как анонимный web-пользователь.

Bearer token добавляется общим API client. Session expiration переводит интерфейс в контролируемый auth flow.

## Feature boundaries

`src/features` группирует продуктовые экраны и локальные компоненты:

- `patrol` — dashboard, results, requests, assignments, employees, schedule, routes;
- `mobileAccounts` — мобильные аккаунты и security/session panels;
- `users` — web-пользователи, роли, permissions и scopes;
- `inventory` — Inventory/PPE workspace;
- `emu` — дашборд, учет и история работ;
- `perco` — настройки и диагностика интеграции.

Переиспользуемые UI primitives находятся в `src/shared/ui`. Feature-specific modal, table и workspace components не следует переносить в shared до появления второго реального потребителя.

## State ownership

Локальный component state подходит для:

- открытого modal/drawer;
- выбранной строки или вкладки;
- несохраненных полей формы;
- presentation filters.

Workspace hooks отвечают за:

- загрузку и refresh;
- optimistic/pending UI state;
- mutation errors;
- синхронизацию нескольких экранных блоков;
- mapping server DTO в UI view models.

PostgreSQL/API отвечает за:

- пользователей и права;
- сотрудников, маршруты, заявки и назначения;
- результаты;
- mobile accounts;
- Inventory, ЭМУ и PERCo.

`localStorage` не используется как production persistence. Он допустим для настроек UI, mock mode и безопасного временного состояния, не подменяющего серверную запись.

## Permissions

`src/security/permissions.ts` содержит клиентское отображение permission codes на действия/экраны.

Frontend-проверка нужна для UX, но не является security boundary. Backend `RequirePermission` остается обязательным для каждого защищенного endpoint-а.

Admin role дает полный доступ в клиентском helper согласно серверной модели. Scope-ограничения должны применяться сервером к данным, а не только скрывать UI.

## Routing и загрузка экранов

`ScreenRouter` связывает screen id с feature screen и передает только необходимые props/callbacks. Тяжелые feature-модули могут загружаться лениво.

При изменении screen id нужно синхронно обновить:

- registry/navigation data;
- `ScreenId` type;
- router;
- permission mapping;
- deep links/notifications, если они ведут на этот экран;
- structural и UI tests.

## Contracts

Web DTO находятся в `src/api/contracts.ts`; общие UI types — в `src/types.ts`.

Пока OpenAPI codegen отсутствует:

- C# DTO, TypeScript DTO и repository mapping изменяются одним change set;
- новые enum/status значения нормализуются на границе;
- contract regressions покрываются API и frontend tests;
- UI не должен полагаться на неописанные поля JSON.

## Ошибки и восстановление

- transport errors преобразуются в читаемые repository/hook errors;
- command validation показывается рядом с полями или в workspace;
- системные сбои загрузки получают retry;
- stale dynamic chunk вызывает однократный controlled reload;
- отсутствие permission не маскируется как пустой список.

## Стили

- глобальный shell и общие tokens находятся в `src/styles.css` и `src/shared/styles`;
- feature styles находятся рядом с соответствующим модулем;
- shared primitives должны сохранять accessibility roles и keyboard behavior;
- визуальное переиспользование не должно создавать скрытую зависимость между bounded contexts.

## Проверки

- `npm run typecheck`;
- `npm run test:unit`;
- `npm run test:structural`;
- `npm run build`;
- `npm run test:e2e` для выбранных API/UI smoke-сценариев.

UI tests должны проверять доступные роли и пользовательское поведение, а не случайную DOM-структуру.

## Текущие ограничения и технический долг

- `App.tsx` остается крупной composition root и требует осторожного дальнейшего разделения по workspace boundaries;
- OpenAPI/DTO codegen отсутствует;
- schedule grid не имеет отдельного CRUD/persistence API;
- часть compatibility wrappers в `src/screens` сохраняется на время структурной миграции;
- mock fixtures остаются полезны для UI tests, но не должны выглядеть как production data.

Новые изменения должны уменьшать связанность App/ScreenRouter и переносить orchestration в feature/workspace hooks без создания глобального state container без необходимости.
