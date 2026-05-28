# ТЗ по доработке Patrol360 до MVP-ready

Дата: 18.05.2026

## 1. Цель

Довести Patrol360 до стабильного MVP-ready состояния: основные административные модули работают через backend/API/DB, frontend не смешивает API-данные с mock/localStorage, безопасность перестает быть заглушкой, интерфейс становится единым и предсказуемым, а качество подтверждается локальным gate, DB integration и CI.

Целевой уровень: MVP-ready, не production-hardening. Расширенная эксплуатация, AD/LDAP, полноценный мониторинг, сложные exports и нагрузочное тестирование идут после MVP.

## 2. Текущая точка старта

Уже есть:

- монорепо `apps`, `libs`, `docs`, `infra`, `tests`, `tools`;
- backend слои `api`, `application`, `contracts`, `domain`, `infrastructure`;
- Docker compose профиль для app/postgres/redis/rabbitmq/minio;
- frontend shell и основные экраны;
- Mobile Accounts baseline: API edit/block/unblock/detach/sessions/security-events, `employeeId` binding, workspace hook, модалки, временный пароль, DB integration smoke;
- локальный gate `tools/Test-All.ps1`;
- E2E smoke по dashboard и Mobile Accounts.

Главные разрывы:

- нет Auth/Session/RBAC;
- нет OpenAPI codegen и contract sync;
- Results, Assignments, Schedule, Site Users не закрыты end-to-end через API/DB;
- часть frontend workflow еще живет в `App.tsx` или fallback repositories;
- DB integration покрывает только Mobile Accounts smoke;
- GitHub remote/branch protection/CODEOWNERS остаются внешним governance шагом.

## 3. Порядок внедрения

### Задача 1. Зафиксировать базовый gate проекта

Цель: перед каждой новой фазой иметь воспроизводимый старт.

Сделать:

- запускать `.\tools\Test-All.ps1 -SkipFrontendInstall -IncludeE2E` перед крупными изменениями;
- запускать `.\tools\Verify-TextEncoding.ps1` после правок русскоязычных docs/frontend;
- после DB/EF изменений запускать `docker compose -f .\infra\docker\compose.yaml up -d postgres` и `.\tools\Test-All.ps1 -SkipFrontendInstall -IncludeDbIntegration`;
- не коммитить generated artifacts, `dist`, `bin`, `obj`, `TestResults`.

Критерии приемки:

- локальный gate зеленый;
- рабочее дерево после `Clean-Workspace.ps1` содержит только осознанные исходные изменения.

### Задача 2. Настроить GitHub governance

Цель: сделать удаленный CI и review policy частью процесса.

Сделать:

- подключить `origin`;
- запушить текущую ветку;
- проверить GitHub Actions workflow `CI / verify`;
- добавить `.github/CODEOWNERS` с владельцами зон `apps/web`, `apps/api`, `libs`, `infra`, `tools`, `docs`;
- включить branch protection через `tools/Set-GitHubBranchProtection.ps1`.

Критерии приемки:

- `CI / verify` зеленый на GitHub;
- PR требует 1 approval;
- required check `CI / verify`;
- force push/delete запрещены;
- CODEOWNERS review включен.

### Задача 3. Реализовать Auth API

Цель: заменить временную модель пользователя реальной backend-сессией.

Сделать:

- `POST /api/v1/auth/login`;
- `GET /api/v1/auth/me`;
- `POST /api/v1/auth/logout`;
- DTO: `LoginRequest`, `SessionUserDto`, `PermissionDto`;
- хранение пользователей и password hash;
- единый формат ошибок через ProblemDetails.

Критерии приемки:

- неверный логин возвращает 401;
- `/auth/me` возвращает текущего пользователя и permissions;
- logout сбрасывает session/token.

### Задача 4. Реализовать RBAC schema и permission checks

Цель: защитить write endpoints и скрыть недоступные действия в UI.

Сделать:

- таблицы `site_users`, `roles`, `permissions`, `user_roles`, `role_permissions`;
- seed базовых ролей: admin, operator, auditor;
- permission checks на create/update/delete/block/reset/write endpoints;
- audit events с actor и correlation id.

Критерии приемки:

- неавторизованный пользователь получает 401;
- пользователь без permission получает 403;
- write operation пишет actor в audit.

### Задача 5. Реализовать страницу входа в веб-приложение

Цель: добавить полноценный login screen как точку входа в web UI, а не пускать пользователя сразу в административную панель.

Сделать:

- отдельный экран `/login` или hash-route `#login`;
- форма логина и пароля;
- submit через `POST /api/v1/auth/login`;
- отображение 401/validation ошибок без toast-only поведения;
- loading/saving state на кнопке входа;
- переход в dashboard после успешного входа;
- redirect на login при отсутствии session;
- сохранение session/token только в выбранном безопасном формате;
- базовый responsive layout для desktop/mobile;
- состояние "сессия истекла" с понятным сообщением;
- запрет доступа к защищенным экранам до авторизации.

Критерии приемки:

- неавторизованный пользователь видит страницу входа;
- успешный вход открывает dashboard;
- неверные учетные данные показывают ошибку на форме;
- после logout пользователь возвращается на login;
- Playwright покрывает login -> dashboard -> logout.

### Задача 6. Подключить sessionRepository и useSession на frontend

Цель: убрать hardcoded user из Topbar и связать UI с реальной сессией.

Сделать:

- `apps/web/src/repositories/sessionRepository.ts`;
- `useSession`;
- Topbar берет имя/роль из `/auth/me`;
- logout action;
- session expired state;
- permission-driven rendering для кнопок.

Критерии приемки:

- пользователь видит свое имя и роль;
- logout возвращает на login/session screen;
- недоступные действия скрыты или disabled с понятным состоянием.

### Задача 7. Включить OpenAPI source of truth

Цель: перестать вручную синхронизировать DTO между backend и frontend.

Сделать:

- генерация OpenAPI JSON для `/api/v1`;
- OpenAPI artifact в build output;
- CI check на актуальность схемы;
- documented command для генерации.

Критерии приемки:

- backend build генерирует OpenAPI;
- изменение DTO отражается в OpenAPI;
- CI падает при рассинхронизации contract artifacts.

### Задача 8. Сгенерировать frontend DTO из OpenAPI

Цель: заменить ручные DTO в `apps/web/src/api/contracts.ts`.

Сделать:

- выбрать генератор TypeScript DTO;
- добавить generated folder;
- оставить UI mapping layer отдельно;
- запретить ручное редактирование generated DTO.

Критерии приемки:

- frontend build использует generated DTO;
- repository mapping остается читаемым;
- ручные API DTO больше не дублируют backend contracts.

### Задача 9. Закрыть Mobile Accounts полностью

Цель: довести первый end-to-end модуль до стандарта для остальных.

Сделать:

- расширить Playwright happy path: create, attach, edit, block, unblock, reset password, delete;
- добавить permission-driven rendering для admin actions;
- добавить field-level validation из ProblemDetails;
- проверить reload persistence в API mode;
- не читать legacy localStorage bindings как server data.

Критерии приемки:

- edit/block/detach/reset/delete работают без pending toast;
- все изменения переживают reload;
- UI показывает ошибки полей от backend.

### Задача 10. Вынести Requests workflow в useRequestsWorkspace

Цель: разгрузить `App.tsx` и подготовить заявки к API flow.

Сделать:

- `useRequestsWorkspace`;
- loading/error/saving states;
- request modal orchestration;
- repository mutation flow;
- refresh после create/update.

Критерии приемки:

- `App.tsx` не содержит бизнес-логику заявок;
- заявки создаются через repository;
- ошибки API не превращаются в silent fallback.

### Задача 11. Доработать Results backend/API

Цель: сделать результаты обходов рабочим модулем, а не статичным экраном.

Сделать:

- DB модели для results list/detail;
- issues;
- attachments metadata;
- фильтры `status`, `route`, `employee`, `date`;
- endpoints list/detail.

Критерии приемки:

- `GET /api/v1/results` возвращает фильтруемый список;
- `GET /api/v1/results/{id}` возвращает detail;
- создание заявки из результата получает source result id.

### Задача 12. Доработать Results frontend

Цель: убрать fallback как рабочий источник данных.

Сделать:

- `resultsRepository` с mock/api ветками;
- `useResultsWorkspace`;
- detail drawer читает API detail;
- empty/loading/error states;
- tests repository mapping.

Критерии приемки:

- API mode не использует mock results как server data;
- detail drawer показывает backend detail;
- Playwright покрывает list/detail/create request.

### Задача 13. Реализовать Assignments backend/API

Цель: сделать назначения управляемым workflow.

Сделать:

- `GET /api/v1/assignments`;
- `POST /api/v1/assignments`;
- `POST /api/v1/assignments/{id}/start`;
- `POST /api/v1/assignments/{id}/cancel`;
- `POST /api/v1/assignments/{id}/complete`;
- DB transitions и audit.

Критерии приемки:

- недопустимые переходы возвращают validation ProblemDetails;
- dashboard active patrols обновляется после mutations;
- backend tests покрывают transitions.

### Задача 14. Доработать Assignments frontend

Цель: связать экран назначений и dashboard с backend state.

Сделать:

- `assignmentsRepository`;
- `useAssignmentsWorkspace`;
- saving states на start/cancel/complete;
- refresh dashboard metrics после mutations;
- E2E assignment flow.

Критерии приемки:

- assignment flow работает без ручного localStorage;
- dashboard отражает изменения после операции.

### Задача 15. Реализовать Schedule backend/API

Цель: перевести плановый обход на backend-calculated rules/conflicts.

Сделать:

- schedule rules;
- exceptions;
- week/month query;
- conflict calculation;
- endpoints для save/edit/delete rules.

Критерии приемки:

- backend возвращает рассчитанные конфликты;
- конфликтные сценарии покрыты tests;
- frontend не считает критичную бизнес-логику расписания сам.

### Задача 16. Доработать Schedule frontend

Цель: сделать расписание редактируемым через repository.

Сделать:

- `scheduleRepository`;
- `useScheduleWorkspace`;
- save/edit panel через API;
- conflict panel из backend;
- loading/error/empty states.

Критерии приемки:

- изменения расписания сохраняются после reload;
- конфликт отображается из API response.

### Задача 17. Реализовать Site Users backend/API

Цель: заменить UI-прототип реальным управлением пользователями сайта.

Сделать:

- users list/create/update/block/unblock;
- roles/permissions list;
- reset password command с one-time result;
- validation ProblemDetails;
- audit actor.

Критерии приемки:

- пароль не генерируется на frontend;
- block/unblock сохраняются в DB;
- roles/permissions берутся из backend.

### Задача 18. Доработать Site Users frontend

Цель: связать пользователей сайта с RBAC и session.

Сделать:

- `siteUsersRepository`;
- `useSiteUsersWorkspace`;
- reset password result panel;
- permission-driven buttons;
- tests на RBAC rendering.

Критерии приемки:

- UI не показывает рабочие admin actions без permission;
- reset password показывает временный пароль только один раз.

### Задача 19. Усилить Employees модуль

Цель: привести сотрудников к полноценному справочнику.

Сделать:

- field-level validation;
- проверки unique personnel number;
- mobile binding consistency;
- CRUD E2E;
- связь с Mobile Accounts через `employeeId`.

Критерии приемки:

- employee CRUD сохраняется через backend;
- мобильная привязка не расходится между Employees и Mobile Accounts.

### Задача 20. Усилить Routes модуль

Цель: закрыть маршруты и точки как надежный справочник.

Сделать:

- route CRUD validation;
- point create/edit/delete;
- point reorder;
- NFC/tag uniqueness;
- version/status rules.

Критерии приемки:

- reorder сохраняется в DB;
- нельзя создать конфликтующий tag;
- Playwright покрывает route CRUD + reorder.

### Задача 21. Унифицировать UI state contract

Цель: все экраны должны одинаково показывать загрузку, пустое состояние, ошибку и сохранение.

Сделать:

- общий contract: `idle`, `loading`, `ready`, `empty`, `error`, `saving`;
- общий визуальный паттерн для retry;
- запрет silent fallback в API mode;
- shared helpers для ProblemDetails.

Критерии приемки:

- каждый screen имеет явные loading/error/empty states;
- API error виден пользователю и тестируется.

### Задача 22. Провести UI polish интерфейса

Цель: привести интерфейс к единому рабочему стилю.

Сделать:

- унифицировать кнопки, dropdown, tabs, modal/drawer;
- закрепить иконки для action buttons;
- убрать вложенные cards;
- проверить mobile viewport;
- выровнять плотность таблиц, фильтров, badges.

Критерии приемки:

- все основные экраны визуально выглядят как один продукт;
- текст не вылезает из кнопок/таблиц;
- модалки закрываются по backdrop и Escape.

### Задача 23. Accessibility pass

Цель: сделать интерфейс управляемым с клавиатуры и понятным для assistive tech.

Сделать:

- focus trap для модалок;
- visible focus states;
- `aria-label` для icon buttons;
- keyboard navigation в таблицах/меню;
- корректные dialog roles.

Критерии приемки:

- модалки не теряют фокус;
- основные действия доступны клавиатурой;
- E2E проверяет Escape/backdrop/focus для ключевых модалок.

### Задача 24. Frontend performance и структура

Цель: уменьшить связность и подготовить проект к росту.

Сделать:

- вынести `useRoutesWorkspace`, `useEmployeesWorkspace`, `useResultsWorkspace`, `useAssignmentsWorkspace`, `useScheduleWorkspace`, `useSiteUsersWorkspace`;
- оставить `App.tsx` shell orchestration;
- разделить `styles.css` на tokens/base/layout/shared/features или подготовить staged split;
- убрать лишние re-render hotspots.

Критерии приемки:

- добавление новой mutation не требует длинного prop drilling через весь shell;
- feature logic локализована рядом с feature screen.

### Задача 25. Backend validation и ProblemDetails

Цель: все API должны возвращать единый контракт ошибок.

Сделать:

- required/max length/enum validation для всех write DTO;
- ProblemDetails с `errors`;
- одинаковые 400/401/403/404 responses;
- tests на validation.

Критерии приемки:

- frontend может показать ошибку конкретного поля;
- backend tests покрывают минимум один invalid case на модуль.

### Задача 26. Audit и correlation id

Цель: иметь трассируемость действий пользователя.

Сделать:

- middleware correlation id;
- actor из session вместо `system`;
- audit для create/update/delete/block/reset/status transitions;
- единый формат audit event DTO.

Критерии приемки:

- каждый write endpoint пишет actor;
- correlation id возвращается в response headers;
- security events в Mobile Accounts показывают реального actor.

### Задача 27. Расширить DB integration profile

Цель: проверять реальные EF/PostgreSQL сценарии, а не только unit smoke.

Сделать:

- route CRUD + point reorder;
- patrol request creates linked assignment;
- employee CRUD;
- auth/RBAC permission denial;
- schedule conflict scenarios.

Критерии приемки:

- `.\tools\Test-All.ps1 -IncludeDbIntegration` проходит против Docker PostgreSQL;
- временные test DB создаются и удаляются автоматически.

### Задача 28. Расширить Playwright E2E

Цель: покрыть ключевые MVP user flows.

Сделать:

- login -> dashboard -> logout;
- mobile account lifecycle;
- request modal create/view;
- route CRUD + point reorder;
- employee CRUD;
- assignment create/start/complete;
- responsive smoke.

Критерии приемки:

- E2E стабильно проходит локально и в CI;
- тесты не зависят от ручного localStorage состояния.

### Задача 29. Docker automation

Цель: сделать запуск проекта и проверок простым.

Сделать:

- `docker compose --profile app up -d --build`;
- health check `GET http://localhost:5080/health/ready`;
- runbook для reset локальной DB;
- script/README для app start/stop/logs;
- optional seed/reset command.

Критерии приемки:

- новый разработчик запускает проект по README без ручных догадок;
- Docker profile стартует API, web и PostgreSQL.

### Задача 30. CI hardening

Цель: GitHub CI должен совпадать с локальным gate.

Сделать:

- убедиться, что artifacts публикуются;
- включить E2E в CI;
- решить режим DB integration: PR service container или scheduled/manual workflow;
- добавить OpenAPI contract check;
- проверить clean workspace после build.

Критерии приемки:

- `CI / verify` зеленый;
- artifacts доступны;
- contract mismatch ломает build.

### Задача 31. Финальная MVP-документация

Цель: зафиксировать, что именно входит в MVP и как его проверять.

Сделать:

- обновить `docs/backend-implementation.md`;
- обновить `docs/frontend-improvement-plan.md`;
- обновить `docs/project-implementation-spec.md`;
- добавить MVP acceptance checklist;
- описать известные ограничения после MVP.

Критерии приемки:

- документация не обещает устаревшие mock-only функции;
- есть четкий список проверок перед release/demo.

## 4. Definition of Done для каждой задачи

Задача считается завершенной, если:

- код реализован в правильном слое;
- API имеет DTO, validation и tests;
- frontend имеет loading/error/empty/saving states;
- UI не ломается на desktop/mobile viewport;
- ошибки backend отображаются в UI;
- `Verify-TextEncoding.ps1` проходит;
- relevant unit/integration/e2e tests проходят;
- docs обновлены, если менялся контракт, UX или процесс запуска.

## 5. Минимальный MVP acceptance

MVP-ready можно считать достигнутым, когда:

- Auth/Session/RBAC работают;
- Mobile Accounts полностью end-to-end;
- Results, Assignments, Schedule, Site Users работают через API/DB в API mode;
- frontend не смешивает API state с localStorage fallback;
- OpenAPI/generated DTO включены в CI;
- DB integration покрывает ключевые lifecycle сценарии;
- Playwright покрывает основные пользовательские потоки;
- Docker запуск воспроизводим;
- GitHub `CI / verify` зеленый и protected branch включен.
