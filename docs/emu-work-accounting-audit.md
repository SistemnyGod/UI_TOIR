# Полный аудит модуля ЭМУ “Учет работ / учет рабочего времени”

Дата аудита: 2026-06-15  
Аудируемое состояние: текущая рабочая копия репозитория Patrol360, включая незакоммиченные изменения.  
Формат: аудит по коду, быстрым проверкам и browser QA без изменения исходников и БД.

## 1. Краткий вывод

Модуль ЭМУ находится в рабочем, но не полностью закрытом для промышленной эксплуатации состоянии.

Подтверждено: ядро учета работ реализовано не как макет, а как полноценный контур: есть backend-сервис, API, web-экраны, worker для переноса незавершенных работ, mobile outbox, тесты жизненного цикла, права, аудит, section-scope, история, экспорт, сменные сводки и PERCo-заготовки. Быстрые проверки проходят: .NET build/test, web typecheck, unit tests и production build.

Главные блокеры до статуса “готово без оговорок”:

1. История выполненных работ имеет дефект синхронизации состояния: при первом открытии фильтр периода показывал 15.06.2026, KPI и вкладки сотрудников/участков считали 0, но таблица “Работы” показывала 10 строк за май-июнь; после “Применить” таблица очистилась, но счетчик вкладки “Работы” остался 10.
2. Сводки смен/месяца и решения ЭМУ доступны по `emu.view`, но в контроллере не видно применения section-scope к этим endpoint’ам. Это риск раскрытия данных сотрудников/решений по чужим участкам.
3. Дефолтная ночная смена имеет обед 00:00-01:00 и `LunchTaken = true`; это может противоречить бизнес-правилу, где ночной обед не должен автоматически вычитаться.
4. Сверхурочка сейчас считается как все рабочее время после конца смены; нет явного статуса “30-60 минут требует решения” и “более 60 минут сверхурочно”, если это требуется бизнесом.
5. В истории и отчетах агрегаты частично строятся на клиенте. Для больших периодов это риск неполных итогов, лишних запросов и расхождения между таблицей, счетчиками и экспортом.
6. DB integration, e2e, Docker/runtime health и реальные PERCo-данные в этом аудите не подтверждены.

Итог: пользоваться модулем можно для пилотной/операционной эксплуатации при контроле администратором и регулярной сверке отчетов. Для production-ready нужно закрыть риски отчетов, section-scope на сменных сводках/решениях, бизнес-правила ночного обеда/сверхурочки и пройти DB/e2e/runtime проверки.

## 2. Источники фактов

### Подтверждено кодом

- Контракты: `libs/contracts/EmuContracts.cs`.
- Интерфейсы: `libs/application/IEmuServices.cs`.
- API: `apps/api/Controllers/EmuController.cs`.
- Сервис/БД: `libs/infrastructure/Persistence/EfEmuService.cs`.
- Worker: `apps/worker/Worker.cs`.
- Mobile outbox/backend sync: `libs/infrastructure/Persistence/EfMobileAppService.cs`.
- Web workspace/repository: `apps/web/src/hooks/useEmuWorkspace.ts`, `apps/web/src/repositories/emuRepository.ts`.
- Web screens: `apps/web/src/screens/emu/EmuWorkAccountingScreen.tsx`, `apps/web/src/screens/emu/EmuCompletedWorkHistoryScreen.tsx`, `apps/web/src/screens/emu/EmuDashboardScreen.tsx`, `apps/web/src/screens/emu/emu.css`.
- Tests: `tests/Patrol360.Infrastructure.Tests/EmuDbIntegrationTests.cs`, `tests/Patrol360.Api.Tests/ApiSmokeTests.cs`, `apps/web/src/__tests__/emuWorkBoard.test.ts`, `apps/web/src/__tests__/emuWorkTime.test.ts`.

### Подтверждено командами

Выполнено 2026-06-15:

| Команда | Результат |
|---|---|
| `dotnet build .\Patrol360.slnx --no-restore` | Passed, 0 warnings, 0 errors |
| `dotnet test .\Patrol360.slnx --no-build` | Passed: 50, skipped: 41 DB/integration, failed: 0 |
| `npm run typecheck --prefix apps\web` | Passed |
| `npm run test:unit --prefix apps\web` | Passed: 7 files, 51 tests |
| `npm run build --prefix apps\web` | Passed, Vite build successful |

### Подтверждено browser QA

Проверены страницы на `http://localhost:5173`:

- `/#emu-work-accounting`
- `/#emu-completed-work-history`
- `/#emu-dashboard`

Проверка была безопасной: без создания новых работ, пауз, завершений и удаления.

Наблюдения:

- На доске учета видны счетчики, кнопки “Справочники”, “Избранные”, “Отправить в работу”, фильтр участка, плотность карточек, статусы и правая панель занятости.
- Справочники открываются в модалке; внутренние списки имеют `overflow-y: auto`, высота списков около 150px, есть реальный scrollHeight больше clientHeight.
- Избранные открываются в модалке; список сотрудников имеет внутренний скролл, один список показал `clientH = 306`, `scrollH = 1294`, `overflowY = auto`.
- В истории видны фильтры периода, смены, сотрудника, участка, статуса, причин, сортировки, кнопки “Применить”, “Сбросить”, “Экспорт”.
- В истории подтвержден page size selector: 25/50/100/200.
- На dashboard видны KPI, статус смены, участки, динамика, быстрые действия, занятость, активные работы, последние события и проблемы.
- На мобильной ширине 390px общий horizontal overflow страницы не появился, но таблица истории остается широкой внутри узкой области; нужен отдельный контроль UX для истории на mobile/card-view.

### Нужно проверить вручную/на данных

- Полный lifecycle create/pause/resume/complete/carry-over на реальной БД.
- DB integration tests с PostgreSQL.
- e2e Playwright против API-режима.
- Docker Compose/LAN runtime, health endpoints.
- Реальные PERCo события вход/выход/обед/отсутствие.
- Экспорт CSV на больших периодах.
- Поведение при нескольких операторах и конкурентных изменениях одной карточки.

### Ограничение Data Analytics preflight

В текущей shell-сессии Python для Data Analytics preflight недоступен: `python` не найден, `py -0p` сообщил, что Python не установлен для launcher, bundled runtime через workspace dependencies не найден. Это не блокировало аудит: выводы построены по репозиторию, тестам и browser QA.

## 3. Назначение модуля

Модуль “Учет работ” в ЭМУ нужен для диспетчерского учета работ и рабочего времени сотрудников:

- создать карточку работы по участку и задаче;
- назначить одного или нескольких сотрудников;
- фиксировать приход/начало участия;
- ставить сотрудников на паузу или “другую работу”;
- возвращать к работе;
- завершать участие сотрудника отдельно или всю карточку;
- переносить незавершенные работы;
- видеть текущую занятость и проблемные ситуации;
- формировать историю выполненных работ;
- смотреть отчеты по сотрудникам, участкам, сменам и месяцу;
- готовить данные для сверки с PERCo.

Фактически модуль закрывает не только “список работ”, а контур учета человеко-минут, пауз, простоев, ручных корректировок и спорных решений.

## 4. Архитектура модуля

### Backend

Основные слои:

- `EmuContracts`: DTO, query DTO, response DTO, команды.
- `IEmuServices`: интерфейсы каталогов, работ, смен, планов, maintenance.
- `EmuController`: HTTP API, permissions, section-scope, экспорт.
- `EfEmuService`: EF Core реализация бизнес-логики и расчетов.
- `Patrol360DbContext`/entities/migrations: таблицы работ, сотрудников карточки, пауз, интервалов, смен, решений, уведомлений, PERCo.

### Frontend

Основные части:

- `useEmuWorkspace`: единая рабочая модель, API/mock режим, refresh, локальные действия, query/export.
- `emuRepository`: HTTP-клиент API.
- `EmuWorkAccountingScreen`: операционная доска работ.
- `EmuCompletedWorkHistoryScreen`: история/отчеты.
- `EmuDashboardScreen`: dashboard.
- `emu.css`: общий visual layer модуля.

### Worker

`apps/worker/Worker.cs` запускает плановые maintenance-задачи. Для ЭМУ важен перенос забытых активных работ около 00:05 бизнес-времени и обновление уведомлений/решений.

### Mobile

`EfMobileAppService` принимает outbox-команды:

- `createWorkTask`
- `updateWorkTask`
- `pauseWorkTask`
- `resumeWorkTask`
- `completeWorkTask`
- shift remarks/media attachments

Мобильный outbox вызывает тот же `IEmuWorkService`, поэтому основные правила жизненного цикла переиспользуются. Но нужен отдельный аудит видимости по участкам и прав мобильного пользователя.

## 5. Функциональный аудит

### Создание работы

Подтверждено кодом:

- API требует `emu.work.create`.
- Controller проверяет доступ к участку через `CanAccessEmuSection`.
- Service проверяет активность участка, наличие сотрудников, задачу, существование сотрудников, активные конфликты, согласование плана, дубликат plan task, client idempotency.
- Номер работы создается через advisory lock.
- По каждому сотруднику создается participant и интервал участия.
- Пишется audit event.

Риски:

- Нужно DB/e2e подтверждение в API-режиме с реальными пользователями и section-scope.
- Нужно проверить UX ошибок: конфликт активной работы, неактивный участок, несогласованный план.

### Несколько сотрудников в одной работе

Подтверждено кодом:

- DTO и service поддерживают список employees.
- Расчеты времени считаются по каждому участнику.
- Можно добавлять сотрудника позже с собственным временем начала.
- Можно завершать/ошибочно помечать отдельного сотрудника.

Важно: итоговые `WorkMinutes`, `WaitingMinutes`, `OtherWorkMinutes` карточки являются суммой по участникам, то есть человеко-минутами, а не длительностью карточки по календарю. Это нужно явно показывать в UI/отчетах, иначе пользователи будут считать это ошибкой.

### Запрет двух активных работ на сотрудника

Подтверждено кодом:

- `FindWorkingConflicts` используется при создании, добавлении сотрудника и resume.
- Конфликт ищется по незавершенным карточкам и статусам работающего участия.

Пробел:

- Нужна e2e-проверка сообщения ошибки в web/mobile.

### Пауза и продолжение

Подтверждено кодом:

- API требует `emu.work.pause`.
- Controller проверяет section access.
- Pause проверяет rowVersion, незавершенность карточки, список сотрудников, активную причину ожидания, время не раньше прихода и не слишком далеко в будущем, отсутствие уже открытой паузы.
- Resume проверяет rowVersion, сотрудников и рабочие конфликты.
- Интервалы участия закрываются/создаются.

Пробел:

- Нужна проверка сценариев “часть сотрудников на паузе, часть работает”, “другая работа”, “пауза через мобильный outbox”.

### Завершение

Подтверждено кодом:

- API требует `emu.work.complete`.
- Controller проверяет section access.
- Complete проверяет rowVersion, результат, открытые паузы, причины невыполнения, выбранных сотрудников.
- Статус карточки пересчитывается.
- Плановая задача может закрываться.

Риск:

- На реальных данных в истории есть строки с длительностью 93 часа. Это может быть корректный перенос/длинная незавершенная работа, но требует отдельного контроля: такие карточки должны иметь понятное объяснение, флаг “долгая/перенесенная” и аудит.

### Перенос незавершенных работ

Подтверждено кодом:

- Есть `CarryOverWorkSession`.
- Есть `CarryOverForgottenWork`.
- Worker вызывает перенос около 00:05 бизнес-времени.
- Есть DB integration tests, но в текущем прогоне они skipped.

Нужно проверить:

- Как перенос виден оператору утром.
- Как влияет перенос на историю и сменные отчеты.
- Не создает ли перенос искусственные сверхдлинные интервалы.

### Справочники и избранные

Подтверждено кодом и browser QA:

- Справочники участков, причин ожидания, причин невыполнения и шаблонов работ доступны в модалках.
- Избранные сотрудники управляются отдельно.
- Скроллы в модалках работают после текущих CSS-правок.

Риски:

- Favorite employees endpoint не фильтруется по section-scope в контроллере. Возможно это допустимо, но если избранные раскрывают сотрудников чужих участков, нужно добавить ограничение или бизнес-решение.
- Нужны UI-тесты на модалки справочников/избранных и малую высоту экрана.

### План работ

Подтверждено кодом:

- Плановые задачи фильтруются `GetAllowedEmuSectionIds` в list/changes.
- Create/update проверяют `CanAccessEmuSection` по request section.

Риск:

- В controller не видно явной проверки section-scope для approve/reschedule по уже существующей задаче. Возможно service валидирует, но это нужно проверить отдельно. Для безопасности лучше иметь один helper как `ValidateWorkSessionSectionAccess`, но для plan task.

## 6. Аудит расчетов времени

### Как сейчас считается карточка

`RecalculateSession`:

- для каждого участника берет период от `ArrivedAt` до `FinishedAt` / `CompletedAt` / now;
- суммирует паузы, где участвует этот сотрудник;
- делит паузы на ожидание и “другая работа”;
- рабочее время = total - waiting - other;
- итог карточки = сумма по всем участникам.

Вывод: модель корректна для учета человеко-времени, но UI должен везде различать:

- длительность карточки по календарю;
- суммарное активное человеко-время;
- паузы/простой;
- “другая работа”.

### Сменные сводки

`GetEmployeeShiftSummary`:

- берет stored shift или строит default shift;
- применяет PERCo presence, если есть таблица и нет ручной коррекции;
- подбирает интервалы участия вокруг смены;
- считает work/pause/free/before shift/overtime;
- учитывает обед, PERCo lunch absence и decisions;
- возвращает intervals для UI.

Сильные стороны:

- есть интервальная модель, а не только поля “минуты”;
- есть ручные смены и month summary;
- есть PERCo-aware решения по обеду/отсутствию.

Риски:

- Endpoint shift summary не получает `AllowedSectionIds`; если сотрудник имеет работы на чужом участке, summary может показать интервалы/решения вне разрешенных участков.
- Овертайм считается как все workRanges после конца смены. Если бизнес-правило требует “30-60 минут требует решения, более 60 минут сверхурочно”, этого статуса сейчас нет.
- Ночная смена по дефолту имеет `LunchTaken = true`, 00:00-01:00. Если ночной обед должен быть оплачиваемым/невычитаемым, текущая логика неверна.
- Для 2/2 и 5/2 в коде есть сменные типы/шаблоны, но график чередования как календарное правило требует отдельного подтверждения на данных.

### Обед

Подтверждено кодом:

- Дневные шаблоны используют 12:00-13:00.
- Ночной шаблон использует 00:00-01:00.
- Есть lunch overlap decisions.
- Есть resolutions: `worked_through_lunch`, `exclude_lunch`, `confirmed_parallel_work`, `fixed_manually`, `handled_manually`, `false_alarm`.

Нужно уточнить:

- ночной обед;
- опоздание/ранний уход с обеда;
- работа в обед по распоряжению;
- работа вне территории по PERCo;
- ручная корректировка против PERCo.

### Спорные ситуации

Подтверждено кодом:

- Есть `EmuDecisionDto`.
- Есть escalation threshold 30 минут.
- Есть решения по PERCo exit during work, lunch exit, missing presence, absence after shift.

Риск:

- Decisions endpoint не section-scoped в контроллере.
- Нужны UI-сценарии закрытия решений с обязательным комментарием и проверкой rowVersion.

## 7. Аудит отчетов и истории

### API истории

Подтверждено кодом:

- `EmuWorkSessionQueryDto` поддерживает `dateFrom`, `dateTo`, `employeeId`, `employeeSearch`, `sectionId`, `shiftType`, причины, статусы, includeDeleted, problemOnly, manualCorrectionsOnly, page/pageSize/sort.
- Backend применяет фильтры до пагинации.
- `total`, `page`, `pageSize`, `pageCount` возвращаются через `EmuListResponseDto`.
- `shiftType` фильтруется по `EmuEmployeeShifts`/fallback employee shift, а не просто по времени карточки.
- `employeeSearch` ищет по ФИО snapshot, ФИО employee, табельному, должности, подразделению.
- Экспорт принимает те же фильтры и требует `emu.reports.export`.

### Web история

Подтверждено кодом/browser:

- Есть вкладки: работы, сотрудники, участки, исключения.
- Есть период от/до.
- Есть смена день/ночь.
- Есть page size 25/50/100/200.
- Есть кнопки назад/вперед, page/pageCount, “показано X-Y из N”.
- Есть employee report modal с вкладками summary/sections/works/month.
- Month tab использует `getEmployeeMonthSummary`.

### Найденные дефекты

1. Несинхронное состояние при первом открытии истории:
   - UI показал фильтр периода 2026-06-15..2026-06-15;
   - KPI показали 0;
   - вкладки “По сотрудникам” и “По участкам” показали 0;
   - таблица “Работы” показала 10 строк за май-июнь;
   - после “Применить” строки очистились, но счетчик “Работы 10” остался.

2. Агрегаты отчетов считаются на frontend из `reportRows`. Код делает два запроса: текущая страница и “полный” query. В API-режиме `queryWorkSessions` без page/pageSize вызывает `getAllApiWorkSessions`, который загружает pages по 500. Это лучше, чем одна страница, но:
   - для больших периодов может быть дорого;
   - если загрузка всех страниц не закончилась/ошиблась, KPI расходятся;
   - серверный экспорт может отличаться от экранных агрегатов.

3. Employee tab/report может быть недоступен при рассинхронизации counters/reportRows, даже когда таблица показывает работы.

4. На mobile таблица истории остается широкой. Если контейнер не дает явный горизонтальный скролл или card layout, пользователь будет терять контекст.

### Что нужно сделать по отчетам

- Перевести KPI/агрегаты истории на серверный endpoint или явно грузить snapshot отчета с теми же фильтрами и статусом загрузки.
- Исправить начальную и повторную синхронизацию: фильтры, page result, reportRows, tab counts должны обновляться атомарно.
- При смене фильтров сбрасывать page и counts одновременно.
- Проверить, что `dateFrom/dateTo` реально применяется при первом открытии, а не только после “Применить”.
- Для employee/section reports использовать тот же source-of-truth, что таблица.
- Добавить unit/e2e tests на сценарий “открыть history -> изменить дату -> применить -> counts/table/KPI совпадают”.

## 8. UX/UI аудит

### Что уже хорошо

- Операционная доска стала плотнее и ближе к диспетчерскому инструменту.
- Есть compact/detail density.
- Основные кнопки и фильтры доступны в первом экране.
- Справочники и избранные теперь имеют рабочий внутренний скролл.
- Dashboard имеет полный набор операционных блоков.
- История получила рабочие фильтры и пагинацию.

### Что мешает эксплуатации

1. История перегружена таблицей и боковыми деталями; на узком экране нужен карточный режим или фиксированный горизонтальный скролл с липкими ключевыми колонками.
2. В истории счетчики и таблица могут расходиться, что снижает доверие к отчету.
3. KPI dashboard на текущей ширине растягиваются крупными карточками; для operational layout нужны более компактные KPI.
4. Время 93 часа в таблице выглядит как ошибка без пояснения переноса/долгой карточки.
5. Модалки справочников рабочие, но их нужно покрыть тестами на малую высоту и большое количество справочников.
6. Hover/focus button styling уже частично выправлялся, но нужен единый визуальный контракт для primary/secondary/outline buttons.

### Рекомендации UI

- История: sticky фильтры, compact table, card mode на mobile, sticky pagination.
- Employee report: явно показывать период отчета и источник данных.
- Long-running work: badge “перенесено/долгая работа”, tooltip с аудитом.
- Dashboard: уменьшить KPI cards, объединить нулевые блоки, оставить больше места активным работам и решениям.
- Модалки: header/actions sticky, body scroll, visible focus outline.

## 9. Backend/security audit

### Permissions

Подтверждено:

- Dashboard: `emu.dashboard.view`.
- Settings/sections/templates/favorites read: `emu.view`.
- Directories manage: `emu.directories.manage`.
- Work create/update/pause/complete/delete/audit: отдельные permissions.
- History/export: `emu.history.view`, `emu.reports.view`, `emu.reports.export`.
- Shift adjust: `emu.shift.adjust`.
- Decision resolve: `emu.decision.resolve`.
- Plan view/manage/approve: отдельные permissions.

### Section-scope

Подтверждено:

- `GetAllowedEmuSectionIds` возвращает:
  - `null` для admin/manager/`emu.scope.all`;
  - список `moduleKey = emu`, `scopeType = emu_section`;
  - пустой список, если участки не назначены.
- Work list/dashboard/settings/templates/plan list фильтруются по allowed sections.
- Work create/update/add/finish/mistaken/pause/resume/complete/carry-over/delete/audit проверяют section access.
- Backend ожидает `scopeType = emu_section`, что соответствует исправлению scope bug.

Риски:

- `EmployeeShifts`, `EmployeeShiftSummary`, `EmployeeMonthSummary`, `Decisions`, `ResolveDecision`, `FavoriteEmployees` не показывают явной section-scope проверки в controller.
- Plan approve/reschedule требуют отдельной проверки section-scope существующей задачи.
- Mobile bootstrap sections показывает активные участки; нужен отдельный scope check для мобильного пользователя.

### Concurrency

Подтверждено:

- Work operations используют rowVersion.
- Decision resolve использует rowVersion.
- Work number guarded advisory lock.

Риски:

- Нужны e2e/API tests на конфликт двух операторов в web.
- Нужна проверка UX при stale rowVersion: пользователь должен видеть понятное сообщение и возможность обновить карточку.

### Soft delete/audit

Подтверждено:

- Delete soft-deletes work sessions.
- IncludeDeleted guarded by permissions.
- Audit events пишутся на основные операции.

Нужно проверить:

- Полнота audit по plan, shift adjust, decisions, mobile outbox.
- Видимость audit по section-scope.

## 10. PERCo readiness

Что уже подготовлено:

- Есть PERCo entities/migrations/services.
- Есть presence intervals/access events logic.
- Есть расчет фактического присутствия на смене.
- Есть решения по:
  - выход во время активной работы;
  - выход в обед во время работы;
  - отсутствие PERCo presence при работе;
  - отсутствие после смены;
  - обед как выход/возврат через проходную.
- Есть tests в `EmuDbIntegrationTests`, но они skipped в текущем быстром прогоне.

Что нужно уточнить с бизнесом:

- Что считается входом/выходом для смены при нескольких проходах через PERCo.
- Как учитывать ночную смену, если события пересекают дату.
- Как учитывать обед ночью.
- Как считать отсутствие на территории при работе, если сотрудник выполнял внешнюю задачу.
- Что делать при расхождении ФИО/табельного PERCo и справочника сотрудников.
- Какие решения можно авторазруливать, а какие требуют оператора.

Риски интеграции:

- Конфликты часовых поясов.
- Дубли событий PERCo.
- Поздняя доставка событий.
- Ручная корректировка смены против автоматического PERCo.
- Необходимость аудита всех автоматических пересчетов.

## 11. Mobile/offline аудит

Подтверждено кодом:

- Mobile outbox поддерживает create/update/pause/resume/complete work task.
- Команды вызывают `IEmuWorkService`, значит большая часть backend validation переиспользуется.
- Mobile bootstrap возвращает EMU sections.

Риски:

- Нужна проверка section-scope для mobile account: мобильный пользователь не должен получать/создавать задачи чужого участка.
- Нужно проверить конфликт outbox-команд при устаревшем rowVersion.
- Нужен тест offline sequence: create -> pause -> resume -> complete после задержки синка.
- Нужно проверить медиа/shift remarks в связке с ЭМУ.

## 12. Что доработать

### Критично

1. Исправить рассинхронизацию истории: filters/table/KPI/tab counts/pagination должны иметь один source-of-truth.
2. Добавить section-scope к shift summaries, month summary, decisions, favorite employees или явно доказать, что эти данные не раскрывают чужие участки.
3. Согласовать и исправить ночной обед.
4. Реализовать статусы/решения сверхурочки, если бизнес требует пороги 30/60 минут.
5. Прогнать DB integration tests на PostgreSQL.
6. Прогнать e2e на API-режиме.

### Важно

1. Server-side агрегаты истории: employee/section totals, KPI, exceptions.
2. UI для длинных/перенесенных работ.
3. Tests для `shiftType`, `employeeSearch`, section-scope в reports.
4. Mobile section-scope/offline конфликтные сценарии.
5. Plan section-scope для approve/reschedule.

### Улучшения

1. Compact dashboard layout.
2. Card mode истории на mobile.
3. Sticky actions в отчетах и модалках.
4. Единый button hover/focus contract.
5. Больше audit visibility для оператора.

## 13. Что сделать с нуля

Не требуется переписывать модуль с нуля. Архитектурная база рабочая.

С нуля стоит добавить отдельный слой отчетных агрегатов:

- `GET /emu/reports/work-history-summary`
- `GET /emu/reports/employees`
- `GET /emu/reports/sections`
- `GET /emu/reports/exceptions`

Эти endpoints должны:

- принимать те же фильтры, что history/export;
- применять section-scope;
- считать totals на сервере;
- возвращать версии/метаданные периода;
- быть покрыты DB tests.

## 14. Checklist готовности

### Сейчас выполнено

- [x] Backend build проходит.
- [x] Non-DB tests проходят.
- [x] Web typecheck проходит.
- [x] Web unit tests проходят.
- [x] Web production build проходит.
- [x] Основная доска учета открывается.
- [x] Dashboard открывается.
- [x] History открывается.
- [x] Справочники/избранные имеют внутренний скролл.
- [x] Section-scope применен к основным work-session операциям.

### Не подтверждено

- [ ] DB integration tests на PostgreSQL.
- [ ] Docker Compose runtime.
- [ ] e2e API-mode.
- [ ] Реальный PERCo поток.
- [ ] Mobile offline full-cycle.
- [ ] Экспорт больших периодов.
- [ ] Section-scope для shift/month/decision reports.
- [ ] Production performance на большом объеме истории.

### Не готово без доработок

- [ ] История: синхронизация filters/table/KPI/counts.
- [ ] Ночной обед.
- [ ] Сверхурочка 30/60 минут.
- [ ] Server-side report aggregates.
- [ ] UX истории на mobile.

## 15. Топ-10 первоочередных задач

1. Исправить state bug истории: начальный load, Apply, tab counts, KPI, pagination и table должны использовать один query/result snapshot.
2. Добавить backend tests на `GetWorkSessions`: date range, shiftType day/night, employeeSearch, pageSize 25/50/100/200, total/pageCount.
3. Вынести агрегаты истории на backend или гарантировать полную загрузку всех страниц с явным loading/error state.
4. Добавить section-scope в `EmployeeShifts`, `EmployeeShiftSummary`, `EmployeeMonthSummary`, `Decisions`, `ResolveDecision`, `FavoriteEmployees` или зафиксировать исключение.
5. Добавить section-scope tests для reports/decisions/month summary.
6. Согласовать ночной обед и изменить default/template/tests.
7. Добавить бизнес-логику overtime thresholds: 0-30 допустимо, 30-60 требует решения, >60 сверхурочно, если это итоговое правило.
8. Прогнать DB integration tests с PostgreSQL и включить результаты в release checklist.
9. Прогнать e2e на `/#emu-work-accounting`, `/#emu-completed-work-history`, `/#emu-dashboard` в API-режиме.
10. Довести mobile/offline: section-scope, stale rowVersion, create/pause/resume/complete replay.

## 16. Итоговый статус

Статус по проверенным критериям: **рабочий пилотный контур, требующий доработки отчетов, section-scope и бизнес-правил времени перед промышленным использованием**.

Что можно использовать сейчас:

- создание и ведение карточек работ;
- паузы/возвраты/завершение;
- базовый dashboard;
- история с ручной проверкой результатов;
- справочники/избранные;
- базовый section-scope для карточек работ;
- pilot PERCo readiness.

Что нельзя считать полностью готовым:

- юридически/операционно значимый табель времени без сверки;
- отчеты по сотрудникам/участкам как единственный источник истины;
- section-isolated доступ ко всем отчетным endpoint’ам;
- production runtime без DB/e2e/Docker/PERCo проверок.

