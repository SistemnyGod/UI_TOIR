# Контрольный аудит ЭМУ “Учет работ / учет рабочего времени”

Дата: 2026-06-16  
Состояние: текущая рабочая копия Patrol360 после доработок модуля ЭМУ.  
Формат: аудит по коду, прошлому аудиту, быстрым регрессионным проверкам и статическому UX/logic review. Код и БД в рамках этого аудита не менялись.

## 1. Краткий вывод

Модуль стал заметно ближе к рабочему отчетному контуру: добавлен серверный snapshot отчета истории, расширены фильтры истории, часть section-scope перенесена в сменные/отчетные данные, добавлено правило ночной смены без автоматического обеда, появилась заготовка под спорную сверхурочку.

Статус сейчас: **можно использовать в контролируемой пилотной эксплуатации**, но **не считать полностью закрытым production-ready**. Главные причины: DB integration тесты все еще пропущены, runtime/browser QA в этом контрольном аудите не выполнен, есть остаточные security/logic риски вокруг справочников, избранных сотрудников, update плана и тяжелой клиентской загрузки истории.

## 2. Подтверждено командами

Выполнено 2026-06-16:

| Команда | Результат |
|---|---|
| `dotnet build .\Patrol360.slnx --no-restore` | Passed, 0 warnings, 0 errors |
| `dotnet test .\Patrol360.slnx --no-build` | Passed: 50, skipped: 41 DB/integration, failed: 0 |
| `npm run typecheck --prefix apps\web` | Passed |
| `npm run test:unit --prefix apps\web` | Passed: 7 files, 51 tests |
| `npm run build --prefix apps\web` | Passed, Vite build successful |

Ограничение: `dotnet test --no-build` не выполняет 41 DB/integration тест. Значит, PostgreSQL-сценарии, реальные EF-запросы, транзакции, concurrency и миграционно-зависимые сценарии этим прогоном не подтверждены.

## 3. Ограничения Data Analytics / runtime QA

Data Analytics preflight в текущей shell-сессии не запустился: `python` не найден, `py -0p` сообщил, что Python launcher не видит установленных версий, bundled workspace runtime не настроен. Это не означает, что Python отсутствует на машине вообще; это означает, что он недоступен из текущей shell-сессии Codex.

Browser QA в этом контрольном проходе не выполнен: доступного browser-control tool в текущем наборе инструментов не оказалось. Поэтому UX-выводы ниже основаны на коде, предыдущем browser QA из `docs/emu-work-accounting-audit.md` и уже видимых дефектах в исходниках.

## 4. Сводка статусов по проблемам прошлого аудита

| Проблема из прошлого аудита | Статус | Что подтверждено | Что осталось |
|---|---|---|---|
| История: рассинхрон таблицы/KPI/вкладок | Частично исправлено | Добавлен `/api/v1/emu/reports/work-history`; KPI и counts в web берутся из `reportSnapshot`. | Frontend все еще параллельно грузит полный список `queryWorkSessions(query)` для `reportRows`; это тяжело для больших периодов и сохраняет риск рассинхрона деталей/модалок. Runtime QA не подтвержден. |
| Section-scope для смен, месяца и решений | Частично исправлено | `EmployeeShifts`, `EmployeeShiftSummary`, `EmployeeMonthSummary`, `Decisions`, `ResolveDecision` теперь получают `AllowedSectionIds`. | `FavoriteEmployees` остается без section-scope; `UpdatePlanTask` проверяет только новый `request.SectionId`, но не старый участок существующей задачи. |
| Ночная смена автоматически вычитает обед | Частично исправлено | В дефолтной смене `LunchTaken = false` для `ShiftType = night`. | Существующие ручные смены/данные могли остаться с `LunchTaken = true`; прямого DB-теста на ночной seed пока нет. |
| Сверхурочка без статуса 30-60 минут | Частично исправлено | Добавлены `QuestionableOvertimeMinutes` и decision `overtime_review`. | Нет полноценного бизнес-цикла подтверждения/отклонения сверхурочки; resolution не влияет явно на summary/report; UI почти не раскрывает спорные минуты. |
| Клиентские агрегаты отчетов | Частично исправлено | Серверный snapshot считает totals/employees/sections/exceptions по общему query builder. | Snapshot endpoint выгружает все строки периода в память; employee modal продолжает опираться на полный клиентский набор строк. |
| DB/e2e/Docker/PERCo реальные данные | Не подтверждено | Быстрые non-DB проверки проходят. | Нужны DB integration, e2e, Docker health, реальные PERCo события. |

## 5. Подтверждено кодом

### Backend отчетов

Добавлен публичный endpoint:

- `GET /api/v1/emu/reports/work-history` в `apps/api/Controllers/EmuController.cs`.
- Контроллер строит общий `EmuWorkSessionQueryDto` через `BuildWorkSessionQuery`, как и список/экспорт.
- `BuildWorkSessionQuery` прокидывает `AllowedSectionIds`, `shiftType`, `employeeSearch`, flags и фильтры периода.

Добавлены DTO:

- `EmuWorkHistoryReportDto`
- `EmuWorkHistoryTotalsDto`
- `EmuEmployeeWorkReportDto`
- `EmuSectionWorkReportDto`
- `EmuWorkHistoryExceptionDto`

Реализация в `libs/infrastructure/Persistence/EfEmuService.cs`:

- `GetWorkHistoryReport` строит totals, employee breakdown, section breakdown, exceptions.
- `BuildWorkSessionQuery` применяет section-scope до фильтров и агрегаций.
- `shiftType` фильтруется по сменам сотрудников, а не только по времени начала карточки.
- `employeeSearch` ищет по ФИО, табельному, должности, подразделению и snapshot-полям участников.

Оценка: архитектурно направление правильное. Список, export и report теперь ближе к одному источнику правды.

### Section-scope

Подтверждено:

- `GetEmployeeShifts(... allowedSectionIds)`
- `GetEmployeeShiftSummary(... allowedSectionIds)`
- `GetEmployeeMonthSummary(... allowedSectionIds)`
- `GetDecisions(... allowedSectionIds)`
- `ResolveDecision(... allowedSectionIds)`
- `GetPlanTasks(... allowedSectionIds)`
- `GetPlanTaskChanges(... allowedSectionIds)`
- `ReschedulePlanTask`, `ApprovePlanTask`, `ApproveWeek` получают scope.

Остаточные риски:

- `FavoriteEmployees()` в `apps/api/Controllers/EmuController.cs` возвращает избранных без scope. Для ограниченного пользователя это может раскрывать ФИО/должности сотрудников, которые не относятся к доступным участкам.
- `UpdatePlanTask` проверяет доступ только к `request.SectionId`. Если пользователь знает id чужой задачи, нужна проверка доступа к существующему участку задачи до изменения.
- `ResolveDecision` при недоступном решении идет через общий `ToActionResult`; нужно проверить, не возвращается ли 400 вместо 403. Безопасность запрета есть, но HTTP-семантика может быть неверной.

### Правила времени

Подтверждено:

- В DTO смены/месяца появился `QuestionableOvertimeMinutes`.
- В summary после 30 минут сверхурочки создается decision `overtime_review`.
- Для ночного default/template shift `LunchTaken = false`.
- `GetEmployeeMonthSummary` суммирует `QuestionableOvertimeMinutes`.

Остаточные риски:

- `overtime_review` использует generic decision resolution. Нет отдельного состояния “подтверждено сверхурочно”, “не оплачивать”, “исправлено вручную”.
- Нужна проверка, влияет ли решение на дальнейший пересчет summary. Сейчас код выглядит как detection/notification, а не как окончательная бизнес-коррекция.
- Ночная смена исправлена для новых default/template данных, но существующие данные не мигрированы и не проверены.

### Frontend истории

Подтверждено:

- `emuRepository.getWorkHistoryReport(params)` добавлен.
- `useEmuWorkspace.queryWorkHistoryReport` добавлен.
- `EmuCompletedWorkHistoryScreen` хранит `reportSnapshot`.
- KPI и tab counts берутся из server snapshot, а не только из текущей страницы.
- Page/pageSize для таблицы сохраняются отдельно от snapshot.

Остаточные риски:

- `buildReport` вызывает одновременно:
  - page request,
  - full `queryWorkSessions(query)`,
  - report snapshot.
- Полная загрузка `queryWorkSessions(query)` для больших периодов остается проблемой производительности.
- Employee modal и некоторые details завязаны на `reportRows`, то есть на полном клиентском наборе строк, а не на серверных агрегатах.
- В исходнике есть mojibake toast-строки, например сообщения после успешного формирования отчета/экспорта. Пользователь может увидеть битый русский текст.

## 6. Проверка бизнес-сценариев

| Сценарий | Статус | Комментарий |
|---|---|---|
| Создать работу | Нужно проверить на runtime/DB | Кодовый контур есть, но контрольный аудит не выполнял разрушительные действия. |
| Отправить в работу | Нужно проверить на runtime/DB | Ранее были UI-замечания по hover; по текущему аудиту browser не проверялся. |
| Пауза/продолжение | Нужно проверить на runtime/DB | DB tests существуют, но пропущены. |
| Завершение работы | Нужно проверить на runtime/DB | Требуется e2e с реальной БД. |
| Несколько сотрудников в одной работе | Частично подтверждено кодом | В report snapshot участники агрегируются отдельно; DB lifecycle tests пропущены. |
| Запрет двух активных работ на сотрудника | Частично подтверждено тестовым покрытием | Есть DB integration тесты, но они skip в текущем прогоне. |
| Перенос незавершенных работ | Частично подтверждено кодом/тестами | Worker и тесты есть; DB тесты skip. |
| Справочники и избранные | Частично исправлено | UI ранее имел scroll; scope по избранным сотрудникам остается риском. |
| История выполненных работ | Частично исправлено | Серверный snapshot добавлен; full client load и browser QA остаются. |
| Dashboard | Нужно проверить на runtime | По коду не видно критичного падения, но визуальная плотность/актуальность счетчиков требует браузера. |

## 7. Проверка отчетов

### История работ

Исправлено:

- Есть серверный snapshot с totals, employees, sections, exceptions.
- Фильтры `shiftType` и `employeeSearch` проходят через backend.
- Список остается постраничным.

Частично:

- Пагинация таблицы есть, но модалки и дополнительные вкладки все еще используют полный список строк на клиенте.
- `GetWorkHistoryReport` не ограничивает период и делает `ToList()` по всем строкам подходящего фильтра. На больших периодах возможны задержки и память.

Не подтверждено:

- Export и snapshot дают идентичные итоги на реальных данных.
- Section-scope в export/report/list совпадает на PostgreSQL.
- Mobile/card view истории без overflow после текущих изменений.

### Отчет по сотруднику

Частично:

- Server snapshot уже содержит employee breakdown.
- Месячная сводка имеет `QuestionableOvertimeMinutes`.

Осталось:

- Модалка сотрудника не стала полностью server-driven. Для истории и участков сотрудника используется полный клиентский набор работ.
- Нет отдельного endpoint для employee report по выбранному периоду с деталями, если производительность станет проблемой.

### Отчет по участкам

Частично:

- Server snapshot содержит section breakdown.
- Section-scope применяется на query уровне.

Осталось:

- Раскрытие работ участка на frontend зависит от `reportRows`.
- Нужен DB/runtime тест, что ограниченный пользователь не видит чужие участки во вкладке “Участки”.

### Исключения/аудит

Частично:

- `exceptions` в snapshot ограничены 200 проблемными строками.
- Признаки проблем включают перенос, ожидание, прочие работы, результат не “Выполнено”, manual corrections.

Осталось:

- Нужна явная классификация исключений: перенос, ручная правка, сверхурочка, спорное время, удаление, отсутствие PERCo.
- Нужна проверка, что audit events подтягиваются стабильно и без N+1/лишней памяти.

## 8. UX/UI аудит по текущему состоянию кода

Исправления последних итераций в целом двигают модуль к плотному operational layout. Однако остаются проверяемые UX-риски:

- В истории есть toast-сообщения с битой кодировкой в исходнике. Это нужно исправить до эксплуатации.
- Без browser QA нельзя подтвердить, что sticky headers/actions в модалках не перекрывают контент.
- Нельзя подтвердить, что справочники/избранные после последних правок везде имеют внутренний scroll на 1280px и mobile.
- Для истории на больших данных нужен отказ от обязательной полной клиентской загрузки.
- Dashboard требует финальной проверки плотности: проблемные решения и активные работы должны быть выше вторичных графиков.

## 9. Роли, права и безопасность

Положительно:

- Основные work-session, report, shift summary, month summary, decisions и plan list теперь получают `AllowedSectionIds`.
- Write-операции по work session проверяют доступ к участку.
- Report snapshot применяет scope до агрегации.

Проблемы:

1. **Избранные сотрудники без scope.** `FavoriteEmployees()` возвращает общий список избранных. Для scoped-пользователей это потенциальное раскрытие персональных данных.
2. **Update plan task old-section bypass.** Контроллер проверяет доступ к новому `request.SectionId`, но не подтверждает доступ к существующей задаче до изменения.
3. **ResolveDecision статус ошибки.** Нужно вернуть 403/404 для недоступного решения, а не validation problem, если сейчас получается 400.
4. **AppliedQuery раскрывает `AllowedSectionIds`.** В `EmuWorkHistoryReportDto` возвращается `AppliedQuery`, где query копируется с `AllowedSectionIds`. Это не критичная утечка, но лучше не отдавать внутренний scope list клиенту.

## 10. БД и data model

Что выглядит устойчиво:

- Work sessions имеют section, status, result, waits, participants, audit.
- Decisions имеют dedupe key и status.
- Shift summaries строятся из смены, интервалов и карточек работ.

Что требует проверки:

- Миграции/seed для night shift `LunchTaken = false`.
- Данные старых смен с `LunchTaken = true`.
- Индексы под новый `GetWorkHistoryReport`: период, участок, employee, status, audit flags.
- Производительность `LoadSessions()` + `ToList()` на годовом периоде.
- Влияние `RecalculateSessions(rows, save:false)` на EF tracking внутри report request.

## 11. PERCo readiness

Готово частично:

- В модуле уже есть концепты presence, lunch exit/return, decisions, manual correction и summaries.
- Есть тестовые сценарии PERCo в DB integration tests, но они skipped.

Не закрыто:

- Нет подтверждения на реальных PERCo-событиях.
- Нужна матрица конфликтов: вход без работы, работа без входа, выход во время работы, обед, ночная смена, stale open presence, ручная корректировка.
- Нужна политика разрешения конфликтов: что влияет на оплачиваемое время, что только уведомляет, что требует подтверждения руководителя.

## 12. Новые или оставшиеся риски

1. `FavoriteEmployees` раскрывает сотрудников scoped-пользователю.
2. `UpdatePlanTask` может не проверять старый участок существующей задачи.
3. `GetWorkHistoryReport` неограниченно грузит все строки периода.
4. Employee modal зависит от full client rows, а не от server employee report.
5. `AppliedQuery` возвращает внутренние `AllowedSectionIds`.
6. `overtime_review` есть, но workflow решения сверхурочки не завершен.
7. Ночная смена исправлена только для новых default/template данных; старые данные не проверены.
8. Toast-сообщения истории содержат mojibake.
9. DB integration tests пропущены, поэтому PostgreSQL behavior не подтвержден.
10. Browser QA в текущем проходе не выполнен.

## 13. Топ-10 первоочередных задач

1. Закрыть section-scope для `FavoriteEmployees` и связанных справочников сотрудников.
2. Исправить `UpdatePlanTask`: проверять доступ к существующей задаче до применения нового `SectionId`.
3. Убрать `AllowedSectionIds` из `AppliedQuery`, возвращаемого клиенту.
4. Заменить full `queryWorkSessions(query)` в истории на server-driven employee/section details или ленивую загрузку по вкладке.
5. Добавить DB integration тест `/reports/work-history`: totals, employees, sections, exceptions, scope.
6. Добавить DB integration тест night shift: default/template `LunchTaken = false`, старые/ручные смены ведут себя ожидаемо.
7. Добавить DB integration тест overtime: 0-30 без decision, 30-60 `overtime_review`, >60 overtime + отображение в summary.
8. Доработать workflow сверхурочки: решения, статусы, влияние на summary/report.
9. Исправить mojibake toast-строки в `EmuCompletedWorkHistoryScreen`.
10. Провести browser QA трех экранов: `/#emu-work-accounting`, `/#emu-completed-work-history`, `/#emu-dashboard` на 1280px и mobile.

## 14. Checklist готовности

| Критерий | Статус |
|---|---|
| Build backend | Готово |
| Non-DB tests | Готово |
| Web typecheck/unit/build | Готово |
| DB integration tests | Не подтверждено |
| Runtime browser QA | Не подтверждено в этом проходе |
| Report snapshot backend | Частично готово |
| Report frontend sync | Частично готово |
| Section-scope work reports | Частично готово |
| Section-scope shifts/decisions | Частично готово |
| Section-scope catalogs/favorites | Не готово |
| Night lunch rule | Частично готово |
| Overtime rule | Частично готово |
| PERCo real data | Не подтверждено |
| Production readiness | Не готово без оговорок |

## 15. Финальное заключение

После доработок модуль ЭМУ стал работоспособнее и архитектурно ровнее: появились серверные агрегаты истории, scope проник в важные отчетные методы, а быстрые проверки проходят чисто. Но текущий статус остается **“рабочий пилот / ограниченная эксплуатация под контролем”**, а не “полностью готов к промышленному использованию”.

Для перехода к production-ready нужно закрыть оставшиеся security gaps, убрать тяжелую полную загрузку истории, закончить бизнес-цикл сверхурочки, подтвердить ночные смены на БД, выполнить DB integration/e2e/browser QA и проверить PERCo на реальных событиях.
