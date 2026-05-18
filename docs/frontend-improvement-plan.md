# Frontend improvement plan

Дата аудита: 18.05.2026

## Назначение документа

Этот документ фиксирует текущее состояние фронтенда Patrol360 и план его доведения от UI-прототипа к устойчивому MVP. Он не заменяет `frontend-architecture.md`, а дополняет его практическим backlog-планом: что осталось, в каком порядке делать, как проверять готовность.

## Краткий статус

Фронтенд уже прошел важный этап разбиения монолитного UI на экраны, компоненты, хуки, domain helpers и repositories. Приложение собирается через `npm run verify`, TypeScript strict включен, Vite build проходит.

Текущая готовность фронтенда к MVP: примерно 65%.

Главное ограничение: приложение все еще частично живет как локальный UI-прототип. В режиме `API` часть экранов берет данные из backend, а часть продолжает работать через `localStorage`, fallback arrays и локальные заглушки. Из-за этого пользовательский сценарий может выглядеть рабочим, но фактически не быть синхронизированным с сервером.

## Фактическая структура frontend

```text
apps/web/
  src/
    api/             HTTP client, DTO, data-source mode
    components/      shell, feature panels, modals, UI primitives
    domain/          UI-safe business helpers
    hooks/           orchestration and browser state hooks
    repositories/    mock/local/api repositories
    screens/         screen composition
    App.tsx          application shell orchestration
    types.ts         shared UI contracts
    styles.css       global styling
```

Сильные стороны:

- экраны уже вынесены из `App.tsx`;
- CRUD маршрутов, точек, сотрудников, заявок и мобильных аккаунтов частично разделен на repositories/domain;
- есть единый `ApiClient`;
- есть режимы `Mock/API`;
- есть `browserStorageRepository`;
- есть dirty-close protection для request modal;
- сборка frontend проходит.

Основные слабые стороны:

- нет тестов;
- нет OpenAPI/generated DTO;
- нет единой политики loading/error/empty состояний;
- часть API-режима смешивает серверные данные и `localStorage`;
- `styles.css` слишком большой;
- часть экранов остается на fallback/static данных;
- нет полноценного API слоя для schedule/results/site users/assignments;
- нет production-настроек API base URL, auth headers и session handling.

## Карта экранов

| Экран | Текущее состояние | Главный разрыв | Приоритет |
|---|---|---|---|
| Dashboard | Берет API snapshot для summary/active patrols/routes/employees, fallback для части блоков | Метрики и вспомогательные панели частично локальные, нет real results/issues/schedule | P1 |
| Routes | Самый близкий к MVP экран: CRUD routes/points есть локально и через API | Нет server validation по NFC/tag, нет optimistic/error states, нет версионирования маршрутов | P1 |
| Results | Работает на fallback data | Нет API repository, нет реального журнала результатов, вложений, фильтрации с backend | P1 |
| Assignments | Визуальный workflow есть | Нет API create/start/cancel/complete assignments, данные fallback | P1 |
| Schedule | UI-композиция готова | Нет API данных, нет правил конфликтов/исключений/автозаполнения | P2 |
| Employees | CRUD через API есть | Валидация слабая, mobile binding может расходиться с backend, нет истории обходов | P1 |
| Mobile Accounts | CRUD/reset/bind частично через API | Пароли показываются в UI toast/panel, нет блокировки/сессий/audit API, нет auth контекста | P0/P1 |
| Site Users | UI-прототип | Нет API, нет RBAC/contracts, фиксированный временный пароль в форме | P0/P2 |

## P0: стабилизация перед расширением

Цель: убрать риски, которые будут мешать дальнейшей разработке и CI.

### 1. Развести API mode и Mock mode

Проблема: в API mode часть данных продолжает идти из `localStorage` или fallback arrays.

Что сделать:

- завести явный контракт `DataSourceMode` на уровне каждого repository;
- для каждого экрана определить источник данных: `api`, `mock`, `localDraft`;
- запретить API screens автоматически подмешивать local fallback как будто это server data;
- fallback использовать только для empty/error preview, явно маркируя его как mock/dev.

Критерий готовности:

- при включенном `API` экран не показывает локальные черновики как серверные записи;
- после reload данные API-экранов совпадают с backend;
- mock mode остается отдельным режимом для UI-разработки.

### 2. Исправить line endings policy

Проблема: `.editorconfig` требует `crlf`, но большинство файлов имеют LF. `dotnet format --verify-no-changes` выдает массовые ENDOFLINE ошибки.

Варианты решения:

- либо поменять `.editorconfig` на `end_of_line = lf`;
- либо массово нормализовать файлы под CRLF.

Рекомендация: выбрать LF как единый формат для кроссплатформенной разработки и обновить `.editorconfig`/`.gitattributes`.

Критерий готовности:

- `dotnet format .\Patrol360.slnx --verify-no-changes --no-restore` не падает на ENDOFLINE;
- `npm run verify` продолжает проходить.

### 3. Добавить frontend test runner

Проблема: тестов нет, хотя domain helpers и repository mapping уже достаточно важны.

Что добавить:

- `vitest` - подключен;
- `@testing-library/react` - подключен;
- `@testing-library/user-event` - подключен;
- отдельный script: `test`, `test:run` - подключен;
- `@playwright/test` и `test:e2e` - подключены для smoke-проверки frontend shell;
- smoke/component tests для ключевых flows.

Минимальный набор тестов:

- `domain/routes.ts`: create/update/reorder/move route points;
- `domain/mobileAccounts.ts`: login normalization, temporary password branch, binding;
- `domain/serviceRequests.ts`: draft creation;
- `repositories/patrolDataRepository.ts`: DTO -> UI mapping;
- request modal: submit и dirty-close;
- routes screen: create route, create point;
- mobile account: create/reset/bind.

Критерий готовности:

- `npm run verify` включает typecheck/build;
- отдельный `npm run test:run` проходит в CI;
- новые domain helpers покрываются тестами до расширения логики.

### 4. Убрать небезопасные password-заглушки

Проблемы:

- `SiteUserFormPanel` больше не генерирует фиксированный пароль `tmp-Patrol-360`, но еще ждет backend API;
- временные пароли больше не отображаются в UI toast, базовый одноразовый panel-flow добавлен;
- старый `legacy/territory-patrol-panel` содержит plaintext password-прототип и теперь явно вынесен из активной frontend-зоны.

Что сделать:

- в основном React app не генерировать site-user password локально - сделано для текущего UI-прототипа;
- показывать temporary password только в одноразовом secure result panel - базово добавлено для mobile accounts;
- добавить явное предупреждение "доступно только до закрытия окна" - добавлено в secure panel;
- старый `legacy/territory-patrol-panel` не подключать к production build и CI.

Критерий готовности:

- в production UI нет фиксированного временного пароля - базово закрыто;
- password display изолирован в одном компоненте - базово закрыто через `TemporaryPasswordPanel`;
- reset/create password actions готовы к auth/RBAC.

## P1: завершить API-интеграцию ключевых экранов

### 1. Requests

Сейчас:

- backend имеет `GET /api/v1/patrol-requests` и `POST /api/v1/patrol-requests`;
- frontend умеет POST и читает backend list через `GET /api/v1/patrol-requests`;

Доработать:

- добавить `getPatrolRequests()` в `patrolRequestsRepository` - сделано;
- в API mode читать список заявок из backend - сделано;
- убрать сохранение API-created request в localStorage - сделано через отдельный session state API-заявок;
- добавить loading/error state для request list - сделано в dashboard request panel;
- добавить view endpoint после появления backend `GET /api/v1/patrol-requests/{id}`.

Критерий готовности:

- созданная через API заявка видна после reload - закрыто на уровне frontend API list;
- локальные mock-заявки не смешиваются с API-заявками - базово закрыто для frontend state.

### 2. Results

Сейчас:

- экран полностью на fallback data.

Доработать:

- расширить существующий `resultsRepository`, который сейчас содержит fallback data и UI-фильтрацию, до полноценного `mock/api` repository;
- подготовить DTO для results list/detail/issues/attachments;
- подключить фильтры к API query;
- заменить hardcoded pagination на stateful pagination;
- добавить empty/loading/error states.

Минимальный MVP:

- список результатов;
- фильтр по статусу;
- detail drawer;
- отображение attachments как metadata rows;
- создание заявки из результата.

### 3. Assignments / Active patrols

Сейчас:

- часть active patrols приходит из dashboard API;
- экран назначения использует fallback assignable routes/employees.

Доработать:

- расширить существующий `assignmentsRepository`, который сейчас содержит только fallback export для маршрутов и сотрудников;
- добавить API methods: create assignment, start, cancel, complete;
- синхронизировать active patrol state только из backend в API mode;
- вынести draft logic в feature hook `useAssignmentsWorkspace`.

Критерий готовности:

- назначение создается через backend;
- dashboard сразу показывает актуальное назначение после refresh;
- локальные активные обходы не подмешиваются в API mode.

### 4. Employees

Сейчас:

- list/create/update/delete уже идут через API;
- local validator слишком слабый: `isEmployeeDirectoryList = Array.isArray`.

Доработать:

- усилить runtime validation для employee localStorage;
- добавить API error display в form modal;
- добавить field-level errors из ProblemDetails;
- разделить `hasMobileAccount` как derived state от accounts, не ручной флаг формы;
- подготовить employee patrol history panel.

### 5. Mobile accounts

Сейчас:

- list/create/bind/reset/delete частично через API;
- loading/error/retry state для API list добавлен в mobile account panel;
- security events fallback;
- sessions fallback/display-only.

Доработать:

- добавить API repository для sessions/security events;
- добавить block/unblock после backend;
- заменить binding по ФИО на employee ID после изменения backend contract;
- изолировать temporary password display;
- добавить confirmation dialog на reset/delete.

## P2: довести вторичные экраны

### 1. Schedule

Сейчас:

- композиция экрана готова;
- данные и действия локальные.

Доработать:

- расширить существующий `scheduleRepository`: get week/month, create/update/delete entries;
- API DTO для exceptions/conflicts/autofill;
- edit drawer должен сохранять через repository;
- conflict panel должен читать backend-calculated conflicts;
- добавить route/employee selectors из API snapshot.

### 2. Site users / RBAC

Сейчас:

- полностью UI-прототип.

Доработать:

- расширить существующий `siteUsersRepository`: list/create/update/block/reset password;
- `rolesRepository`: roles/permissions;
- заменить фиксированный temporary password;
- добавить validation/errors/loading;
- скрывать actions по permissions текущего пользователя.

### 3. Dashboard supporting panels

Сейчас:

- summary и active patrols частично API;
- readiness/results/schedule части fallback.

Доработать:

- отдельные API repositories для readiness/issues/today routes;
- dashboard должен показывать источник и время последнего refresh;
- добавить manual refresh;
- добавить stale/error indicator.

## P3: архитектурная чистка frontend

### 1. Feature hooks

Цель: убрать рост `App.tsx` и `usePatrolWorkspaceData`.

Добавить hooks:

- `useRoutesWorkspace`;
- `useRequestsWorkspace`;
- `useEmployeesWorkspace`;
- `useMobileAccountsWorkspace`;
- `useAssignmentsWorkspace`;
- `useScheduleWorkspace`;
- `useSiteUsersWorkspace`.

Каждый hook должен владеть:

- data loading;
- mutation actions;
- loading/error state;
- selected row/form orchestration;
- toast-safe action result.

`App.tsx` должен остаться shell-композицией: navigation, topbar, current screen, global modal, toast.

### 2. Repository contracts

Для каждого repository ввести одинаковую форму:

```ts
interface FeatureRepository {
  list(...): Promise<...>;
  get?(id: string): Promise<...>;
  create?(payload: ...): Promise<...>;
  update?(id: string, payload: ...): Promise<...>;
  delete?(id: string): Promise<void>;
}
```

Правила:

- API repository не пишет localStorage;
- local repository не вызывает API;
- mock repository не мутирует production state;
- DTO mapping живет рядом с repository, не в JSX.

### 3. DTO generation

Сейчас DTO временно описаны в `apps/web/src/api/contracts.ts`.

Доработать после стабилизации backend:

- добавить OpenAPI;
- сгенерировать TypeScript DTO;
- заменить ручные temporary contracts;
- оставить UI model отдельно от API DTO.

## P4: UX, формы, ошибки

### Единая модель состояния

Для каждого API-backed экрана:

- `idle`;
- `loading`;
- `ready`;
- `empty`;
- `error`;
- `saving`.

Что добавить:

- skeleton или compact loader;
- retry button;
- field-level validation summary;
- disabled state на saving;
- optimistic update только там, где есть rollback.

### Формы

Усилить:

- required fields;
- max length в соответствии с backend;
- duplicate checks там, где это не конфликтует с backend;
- date/time validation;
- dirty state для всех крупных drawers/modals;
- confirm delete/reset/archive.

### Accessibility

Проверить:

- focus trap в модалках;
- keyboard navigation по таблицам;
- aria-label для icon-only buttons;
- visible focus styles;
- контраст статусов;
- корректный порядок tab navigation.

## P5: performance and optimization

Текущий build:

- JS: около 351 kB, gzip около 98 kB;
- CSS: около 56 kB, gzip около 11 kB.

На текущем этапе размер приемлемый, но перед расширением стоит подготовить:

- split `styles.css` на tokens/base/layout/features;
- memoize тяжелые derived lists только после появления реальных объемов данных;
- заменить repeated `Array.find/filter` на indexed maps в больших таблицах;
- добавить pagination/virtualization для results, employees, route points при росте данных;
- добавить API request cancellation через `AbortController` для переключения экранов/режимов;
- добавить request dedup/cache для dashboard snapshot.

React best practices фокус:

- избегать waterfall loading;
- грузить независимые API через `Promise.all`;
- не держать derived state в effects, если можно вычислить в render/useMemo;
- не читать localStorage вне repository/hook слоя;
- не добавлять inline components внутри components;
- не раздувать `App.tsx` новыми workflow branches.

## Качество и CI

Минимальный frontend gate:

```powershell
cd .\apps\web
npm run typecheck
npm run build
npm run test:run
```

Расширенный gate после добавления e2e:

```powershell
npm run verify
npm run test:run
npm run e2e
```

Smoke сценарии:

1. Dashboard loads.
2. Switch Mock/API.
3. Open request modal, edit, dirty-close confirm.
4. Create request.
5. Create route.
6. Add route point.
7. Create employee.
8. Create mobile account.
9. Reset mobile account password.
10. Navigate every screen without console errors.

## Рекомендуемый порядок работ

### Этап 0: Stabilization

Оценка: 1-2 дня.

- решить LF/CRLF policy;
- добавить `test` scripts;
- зафиксировать frontend gates;
- убрать фиксированный site-user password;
- описать API/mock/local source rules.

### Этап 1: Data source cleanup

Оценка: 2-4 дня.

- разделить API/local/mock state по repositories;
- requests перевести на API list;
- убрать API-created requests из localStorage;
- добавить loading/error state в `usePatrolDataSource`;
- добавить error handling для `refreshMobileAccounts` - сделано, включая loading/error/retry state.

### Этап 2: Core API screens

Оценка: 4-7 дней.

- Results API repository;
- Assignments API repository;
- Employees form errors;
- Mobile accounts sessions/security events;
- Dashboard refresh/stale indicators.

### Этап 3: Feature hooks

Оценка: 3-5 дней.

- вынести workflow из `App.tsx` и `usePatrolWorkspaceData`;
- сформировать feature hooks;
- стандартизировать repository contracts.

### Этап 4: Secondary screens

Оценка: 5-8 дней.

- Schedule API;
- Site users API;
- RBAC-aware UI;
- dashboard supporting panels.

### Этап 5: UI polish and test coverage

Оценка: 4-6 дней.

- split CSS;
- accessibility pass;
- component tests;
- smoke/e2e tests;
- console-error-free browser QA.

## Definition of Done для frontend MVP

Фронтенд можно считать MVP-ready, когда:

- `npm run verify` проходит;
- тестовый runner подключен и основные domain/repository tests проходят;
- API mode не показывает localStorage данные как server data;
- основные экраны имеют loading/empty/error states;
- routes/employees/requests/mobile accounts работают через API;
- results и assignments имеют хотя бы MVP API flow;
- schedule/site users явно помечены как mock или подключены к API;
- нет фиксированных временных паролей в UI;
- `App.tsx` не разрастается новыми feature workflow;
- CSS разделен или как минимум имеет понятный план разделения;
- smoke-проход по всем экранам не дает console errors.

## Обновленная оценка готовности frontend

| Направление | Готовность |
|---|---:|
| UI composition | 75% |
| API integration | 45% |
| Local/mock separation | 45% |
| Forms/workflows | 60% |
| Error/loading states | 35% |
| Tests | 0% |
| Accessibility | 45% |
| Performance readiness | 50% |
| Frontend architecture | 70% |

Итоговая frontend готовность к MVP: 60-65%.

Главное условие роста до 80%: завершить разделение API/local/mock, добавить тесты и подключить API для requests/results/assignments.

## Дополнение от 18.05.2026: уточненная ревизия фронта

После повторной сверки `apps/web/src` важно уточнить: часть repository-файлов уже заведена, но несколько из них пока являются не API-слоем, а тонкими обертками над `data.ts`. Поэтому задача не в том, чтобы "создать файлы", а в том, чтобы довести их до одинакового production-контракта.

### Fallback-only repositories

| Файл | Что есть сейчас | Что добавить |
|---|---|---|
| `repositories/resultsRepository.ts` | fallback results, фильтры, метрики, поиск результата | `getResults`, `getResult`, серверные фильтры, пагинация, issue/request actions |
| `repositories/assignmentsRepository.ts` | fallback employees/routes | list/create/start/cancel/complete assignment через API, отдельные mock fixtures |
| `repositories/scheduleRepository.ts` | fallback schedule cells/week days | week/month API, сохранение смен, исключения, конфликты, автозаполнение |
| `repositories/siteUsersRepository.ts` | fallback users, role descriptions, helper functions | users API, roles API, password reset flow, block/unblock, permissions |
| `repositories/dashboardRepository.ts` | fallback metrics | API для readiness/issues/today routes, stale/error metadata |
| `repositories/activePatrolsRepository.ts` | выбор API/local active patrols и local create from request | API mutations/status transitions, отказ от local active patrols в API mode |

Критерий готовности: каждый repository должен явно экспортировать `createMock...Repository`, `createApi...Repository` или единый factory, а screens/hooks не должны импортировать fallback массивы напрямую для production-потока.

### ApiClient и runtime config

Текущий `ApiClient` уже централизует HTTP, но для production ему не хватает:

- `VITE_API_BASE_URL` или другого env-based base URL вместо неявного `""` - добавлено;
- поддержки `AbortSignal` для отмены запросов при смене экрана, режима данных и размонтировании - добавлено на уровне `ApiClient`;
- timeout/abort policy для зависших запросов - добавлено на уровне `ApiClient`;
- единого обработчика `401/403` с переводом пользователя в login/session-expired state;
- auth strategy: cookie credentials или bearer token, согласованная с backend;
- нормальной обработки `ProblemDetails.errors` на уровне полей формы - базовый контракт добавлен в `ApiError.errors`;
- обработки non-JSON ответов и пустого тела не только для `204` - добавлено;
- correlation/request id в ошибках, чтобы связывать frontend toast с backend logs - добавлено через `ApiError.requestId`.

После этого все repositories должны получать `ApiClient` через factory/dependency injection, а не создавать собственный клиент без конфигурации.

### Auth, session и RBAC на фронте

Сейчас topbar показывает статичного "Пользователь панели / Оператор", а экраны не знают реальную роль и permissions. Для MVP это допустимо только как mock mode.

Доработать:

- добавить `sessionRepository` и `useSession`;
- загрузить текущего пользователя, роль, permissions и признаки истечения сессии;
- скрывать или блокировать действия по permissions: создание заявок, назначение обходов, управление мобильными аккаунтами, управление пользователями;
- добавить logout/session expired UI;
- убрать hardcoded user из `Topbar`;
- связать `Site users / RBAC` с тем же permission contract, а не держать отдельную UI-демонстрацию ролей.

Критерий готовности: пользователь без нужного permission не видит destructive/admin actions, а прямой вызов API все равно защищается backend-авторизацией.

### Поиск и навигация

Сейчас поиск в `Topbar` фактически показывает toast и не фильтрует текущий экран. Навигация построена на hash screen без query state.

Доработать:

- сделать `searchQuery` screen-aware: маршруты ищут точки/теги, сотрудники ищут ФИО/подразделение, результаты ищут маршрут/статус/замечания;
- сохранить фильтры и selected entity в URL query/hash, чтобы работали deep links;
- добавить reset filters;
- реализовать keyboard shortcut `/` через focus на search input;
- для detail drawers добавить ссылочные состояния: выбранный результат, заявка, сотрудник, маршрут, аккаунт;
- проверить back/forward поведение после выбора экрана и сущности.

Критерий готовности: после reload или отправки ссылки пользователь попадает на тот же экран и выбранную сущность, если она еще существует.

### Mobile accounts: форма и безопасный password flow

В `MobileAccountCreateDrawer` список кандидатов сейчас зафиксирован как `employeeCandidates: string[] = []`, поэтому UI всегда показывает empty state. Кроме того, кнопки "Создать и привязать" и "Создать аккаунт" отправляют один и тот же submit без различия действия.

Доработать:

- передавать кандидатов из `employeeDirectory`;
- выбирать сотрудников по ID, а не по ФИО;
- развести intent кнопок: создать, создать и привязать, создать без привязки;
- добавить field-level validation для login/role/scope;
- заменить отображение temporary password в toast на одноразовую secure panel - сделано;
- добавить confirm для reset/delete;
- показать loading/error внутри drawer, а не только глобальным toast;
- синхронизировать sessions/security events с API.

Критерий готовности: создание аккаунта из API mode не зависит от локального справочника, а временный пароль не остается в глобальном toast/history. Password-flow часть закрыта, источник сотрудников и field validation остаются в работе.

### State ownership и prop drilling

`App.tsx` и `ScreenRouter` сейчас передают большое количество props и action callbacks. Это работает, но дальнейшее расширение будет быстро увеличивать связность.

Доработать:

- вынести mobile accounts из `App.tsx` в `useMobileAccountsWorkspace`;
- вынести request modal orchestration в `useRequestsWorkspace`;
- сгруппировать props по feature-model объектам вместо длинного списка однотипных callbacks;
- оставить `ScreenRouter` только для маршрутизации screens;
- для каждого screen завести contract: `state`, `actions`, `status`.

Критерий готовности: добавление нового действия в одном модуле не требует пробрасывать callback через `App.tsx -> ScreenRouter -> Screen -> Panel`, если действие не является глобальным.

### Error boundary, observability и browser QA

Добавить отдельный слой качества UI:

- React error boundary вокруг рабочей области;
- глобальный API banner для offline/API unavailable;
- единый toast severity: info/success/warning/error;
- logging hook для frontend ошибок без персональных данных;
- Playwright smoke для всех экранов;
- проверка, что в browser console нет runtime errors/warnings после основных сценариев;
- visual checks для модалок, drawer, таблиц и мобильной ширины.

Минимальный smoke-набор:

1. открыть dashboard;
2. переключить Mock/API;
3. пройти все screens;
4. создать заявку;
5. создать маршрут и точку;
6. создать сотрудника;
7. открыть mobile account drawer;
8. открыть/закрыть request modal с dirty confirm;
9. проверить back/forward hash navigation;
10. убедиться, что console чистая.

### Test data и fixtures

`data.ts` сейчас одновременно играет роль демо-данных и fallback-источника. Для долгосрочной поддержки лучше разделить назначение данных.

Доработать:

- `fixtures/mockData.ts` для demo/mock mode;
- `fixtures/testFactories.ts` для тестов;
- repositories не должны импортировать production fallback напрямую из общего `data.ts`;
- mock data должны быть детерминированными и не маскировать отсутствие API;
- для component tests использовать маленькие factory-наборы, а не весь большой demo dataset.

Критерий готовности: тесты могут собрать минимальный сценарий из factory, а mock mode использует отдельные демонстрационные данные.

### CSS и UI-система

`styles.css` остается самым крупным frontend-файлом. Это не блокер сборки, но станет проблемой при расширении screens.

Доработать:

- разделить CSS на `tokens`, `base`, `layout`, `components`, `features`;
- зафиксировать naming convention для feature-классов;
- проверить, что screen-specific стили не влияют на другие экраны через слишком общие селекторы;
- оставить barrel-файлы вроде `components/RequestModals.tsx` только там, где они действительно упрощают публичный импорт;
- добавить визуальные состояния для disabled/loading/error в кнопках, формах и таблицах;
- проверить responsive layout для dashboard, route editor, schedule grid и mobile account drawer.

Критерий готовности: новую feature-панель можно стилизовать без правок большого общего файла и без риска сломать соседний экран.

## Уточненный порядок после дополнения

Если делать фронт прагматично, порядок лучше такой:

1. `ApiClient` config/auth/error contract.
2. Разделить fallback-only repositories на mock/api contracts.
3. Вынести `useMobileAccountsWorkspace` и `useRequestsWorkspace`.
4. Подключить API list для requests и убрать API-created requests из localStorage.
5. Довести Results и Assignments до MVP API flow.
6. Подключить session/RBAC read model и убрать hardcoded topbar user.
7. Добавить Vitest/component tests на domain/repository/form flows.
8. Сделать Playwright smoke и console-error gate.
9. Разделить CSS после стабилизации поведения, чтобы не смешивать визуальный refactor с API-логикой.
