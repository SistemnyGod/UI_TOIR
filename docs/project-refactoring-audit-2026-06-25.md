# Аудит рефакторинга проекта Patrol360

Дата: 2026-06-25  
Тип проверки: source-level audit без runtime browser/DB profiling.  
Ограничение: рабочее дерево уже сильно изменено до аудита; unrelated изменения, generated deletions и мобильные APK/Android артефакты не анализировались как мои изменения и не откатывались.

## 1. Краткий вывод

Проект уже движется в правильную сторону: backend остается modular monolith, web постепенно переехал в `features/*`, EF-сервисы частично разрезаны на partial-файлы, mobile имеет offline/outbox/background sync основу, а по СИЗ появились канонические проверки печати и движения. Главная проблема сейчас не в выбранной архитектуре, а в незавершенной декомпозиции и в разных правилах между backend/web/mobile.

Рефакторинг в первую очередь нужен там, где одновременно меняется бизнес-логика, UI, печать, история или sync: СИЗ workflow/export, Patrol assignment/results, mobile patrol repository, status dictionaries, `Patrol360DbContext` mappings. Переписывать проект с нуля не нужно. Нужны малые проходы с тестами после каждого шага.

## 2. Архитектура проекта

| Раздел | Что найдено | Проблема | Как структурировать | Приоритет |
| ------ | ----------- | -------- | ------------------- | --------- |
| Backend layers | `apps/api`, `libs/application`, `libs/contracts`, `libs/infrastructure`, `libs/domain` | Слои есть, но часть бизнес-правил живет в EF-сервисах и контроллерах | Переносить правила в application/domain policies точечно после mechanical split | P1 |
| EF persistence | Есть папки `Persistence/Emu`, `MobileApp`, `Patrol`, `Perco`, `Configurations` | `Patrol360DbContext.cs` все еще 1753 строки, часть mapping остается централизованной | Продолжить вынос `IEntityTypeConfiguration<>` по модулям | P1 |
| Web | Есть `apps/web/src/features/{dashboard,emu,inventory,patrol,perco,users}` и `shared` | Старые `screens/components` compatibility еще присутствуют, часть экранов монолитна | Удалять compatibility только после `rg` по imports; новые компоненты держать в feature/shared | P1 |
| Mobile | Есть `api`, `db`, `features`, `sync`, `services`, `domain`, `ui` | `patrolRepository.ts` смешивает local DB, lifecycle, sync mapping и submit | Разрезать repository facade + scoped repositories | P1 |
| Docs | Есть специализированные аудиты по architecture/API/security/PPE/patrol/mobile | Нет одного текущего refactoring backlog документа, связывающего зоны риска | Этот документ использовать как верхнеуровневый backlog | P0 |
| Tests | Есть unit, API, infrastructure DB integration, structure tests, web unit/e2e | DB integration зависит от окружения; mobile runtime/APK проверки не автоматизированы | Явно разделить source gates и runtime gates | P0 |

## 3. Крупные файлы и монолиты

Миграционные designer/snapshot файлы намеренно не считаются ручной целью рефакторинга.

| Файл | Размер | Что смешано | Как разделить | Риск |
| ---- | -----: | ----------- | ------------- | ---- |
| `apps/web/src/features/patrol/AssignmentScreen.tsx` | 2014 строк | сотрудники, маршруты, избранное, заявки, история, модалки, active assignments | `AssignmentWorkspace`, panels, modal, actions, status utils | Высокий: основной экран назначения |
| `libs/infrastructure/Persistence/EfInventoryWorkflowService.cs` | 1908 строк | Custody, PPE cards, users, employees, history, stock moves, returns/write-offs | partial по `Custody`, `PpeCards`, `PpeLines`, `PpeMovements`, `EmployeesUsers`, `History` | Высокий: СИЗ и склад |
| `libs/infrastructure/Persistence/Patrol360DbContext.cs` | 1753 строки | mappings всех модулей | `Configurations/<Module>/*.cs` | Средний: schema mapping |
| `apps/web/src/features/inventory/ppe/ppeWizard.tsx` | 1555 строк | сотрудник, параметры, выдача, чек-лист, печать, preview | step components + `ppeWizardState` + print preview components | Высокий: критичный UX СИЗ |
| `Мобильное приложение/src/db/repositories/patrolRepository.ts` | 1436 строк | request board, assignments, points, submit, local statuses | facade + `requestBoardRepository`, `assignmentLifecycleRepository`, `pointResultRepository`, `submitReportRepository` | Высокий: offline данные |
| `libs/infrastructure/Persistence/EfInventoryExportService.cs` | 1194 строки | reports, DOCX/PDF, PPE card, signature sheet, validation, templates | `InventoryReportExport`, `PpePrintExport`, `PpePrintValidator`, `DocxBuilders` | Высокий: печать и документы |
| `apps/web/src/features/inventory/InventoryItemsScreen.tsx` | 1112 строк | catalog table, filters, item details, stock UI | list/table, filters, item modal, stock panel | Средний |
| `apps/web/src/features/inventory/InventorySettingsScreen.tsx` | 931 строк | diagnostics, settings, dictionaries, import | tabs + diagnostics panel + import panel | Средний |
| `Мобильное приложение/src/features/patrol/PointFillScreen.tsx` | 601 строк | scan/manual result, comments, attachments, unavailable tag, submit | status selector, attachment gallery, comment, submit actions | Средний |
| `libs/infrastructure/Persistence/Patrol/EfPatrolStore.MobileAccounts.cs` | 675 строк | CRUD, sessions, bindings, flags, audit/security | queries/lifecycle/bindings/sessions/audit | Средний |

## 4. Границы модулей

| Модуль | Что должно быть внутри | Что сейчас лишнее | Что вынести | Что нельзя трогать |
| ------ | ---------------------- | ----------------- | ----------- | ------------------ |
| Учет работ / EMU | work sessions, shifts, reports, decisions, plans | Часть отчетных фильтров и business rules все еще рядом с EF query | Query filters в отдельные helpers/policies | DTO/API результатов работ без отдельного плана |
| СИЗ | нормы, номенклатура, факт выдачи, печать, история, склад | `EfInventoryWorkflowService` держит слишком много сценариев; web wizard перегружен | Ppe workflow service split, единые print DTO/validators, status catalog | Канон печати норм и листа подписи |
| Обходы / Patrol | назначения, заявки, результаты, mobile sync, история | Русские status labels местами используются как значения UI-фильтров | Status code/label map; panels/actions split | Legacy `takePatrolRequest` для старых APK |
| Маршруты и точки | route CRUD, points, NFC/QR uniqueness, route versions/snapshot | Route UI и patrol assignment еще частично связаны через screen-level логику | route domain utils + route repositories | NFC/QR uniqueness |
| Mobile | offline SQLite, outbox, files, background sync, status lifecycle | Repository смешивает DB schema, UI mapping и lifecycle | Repository facade + typed local status mappers | SQLite/outbox compatibility при APK update |
| Интеграции PERCo | settings/auth, events, presence, employee sync, diagnostics | Уже разрезано, но EventSync/Diagnostics еще крупные | helpers для presence windows, event matching, diagnostics projection | Внешний protocol и credential handling |

## 5. Дублирование логики

| Логика | Где дублируется | Почему опасно | Как объединить |
| ------ | --------------- | ------------- | -------------- |
| Status labels | backend constants, web components, mobile `localStatus.ts`, assignment UI | Разные labels ломают фильтры и UX; часть UI сравнивает русские строки | `StatusCode -> label/tone` в contracts/web/mobile maps; запрет сравнения по label |
| PPE print rules | `EfInventoryExportService`, `ppePrint.tsx`, `ppeWizard.tsx`, tests | Preview может расходиться с DOCX | Единый print DTO + frontend preview только из DTO |
| PPE issue statuses | backend workflow, web wizard, operations screen | Выдано/возврат/списание может по-разному влиять на склад и лист подписи | Общий status catalog: issue/signature/terminal/stock effect |
| Date/time formatting | web screens, mobile screens, backend export | Неконсистентные даты в печати/результатах | shared formatter per frontend/mobile; backend invariant ISO in DTO |
| Permission checks | `RequirePermissionAttribute`, web `hasPermission`, UI button gates | UI может показать действие без API права или скрыть разрешенное | OpenAPI/permission matrix + tests на endpoint permission |
| Mobile sync statuses | outbox repo, sync queue, screens, backend response statuses | Отчет может выглядеть зависшим, хотя принят сервером | Single reconciliation mapper for `accepted/duplicate/conflict/rejected` |
| Inventory mock/API behavior | `mockInventoryRepository.ts` и real repository | Mock может проходить, production ломаться | Contract tests на mock parity для критичных СИЗ операций |

## 6. Статусы и бизнес-правила

| Статус/область | Как сейчас | Проблема | Как должно быть |
| -------------- | ---------- | -------- | --------------- |
| Assignment web | Встречаются русские labels `В пути`, `Завершает`, `Задержка` | Label используется как логическое значение | Code: `accepted/inProgress/paused/completed/cancelled`; label только display |
| Mobile patrol | Есть `accepted`, `inProgress`, `paused`, `completedLocal`, `syncError`, `authRequired` | Нужно закрепить terminal behavior для cancelled after offline complete | `completedLocal + server cancelled` должен уходить в terminal/history, не вечный active conflict |
| PPE issue | Есть `issued`, `replacement`, `reissued`, `returned`, `written_off`, `not_issued` | Нужно едино определить влияние на склад, лист подписи и историю | Status catalog с flags: signatureRow, stockOut, stockIn, terminal |
| PPE print | Validator уже блокирует generic categories | DTO пока локальный внутри export service | Вынести `PpePrintLine` в contract/read model, использовать в web preview |
| Sync outbox | Есть pending/sending/retryLater/accepted/duplicate/conflict | Нужно не допускать параллельную отправку одного отчета | Single-flight per assignment/clientOperationId + UI reconciliation |
| Print statuses | Есть export jobs/system log, но нет единого UI lifecycle | Пользователь не всегда видит, что preview/DOCX/PDF сформированы одинаково | `notGenerated/previewReady/hasErrors/docxGenerated/pdfGenerated/printed` |

## 7. API и DTO

| API/DTO | Проблема | Кто использует | Как исправить | Риск |
| ------- | -------- | -------------- | ------------- | ---- |
| `/api/v1/mobile/outbox` | Расширяется новыми командами lifecycle | старый и новый APK | Только additive commands; legacy `takePatrolRequest` оставить | Высокий |
| Inventory PPE DTO | Норма, номенклатура, модель/марка частично живут в line fields | web PPE wizard, export, tests | Добавлять nullable `normName/catalogName/brandModelArticle/isSectionTitle` без breaking change | Средний |
| Results DTO/media | Web viewer должен показывать фото/видео поверх modal | web results | Уточнить media kind/contentType в DTO, не ломая старые поля | Средний |
| Permissions DTO | Роли и direct permissions есть, web содержит свой list | web/API | Сгенерировать permission catalog из backend seed/contracts | Средний |
| OpenAPI | Нужно проверить актуальность runtime artifact | API clients | Добавить contract drift check между DTO и web/mobile clients | Средний |

## 8. База данных

| Таблица/поле | Проблема | Что изменить | Нужна миграция | Риск |
| ------------ | -------- | ------------ | -------------- | ---- |
| `inventory_ppe_lines` | Факт выдачи, print fields и movement связь сосредоточены в одной строке | В P2 выделить полноценные `PpeNormItem`, `PpeIssueItem`, `PpeBrandModelDictionary` или совместимые таблицы | Да | Высокий |
| `inventory_stock_moves` | Для PPE уже используется `PpeCardLineId`; нужно закрепить уникальность move type/line | Добавить unique/index guard после проверки данных | Да | Средний |
| `Patrol360DbContext` mappings | Mapping централизован и трудно ревьюить | Перенос в `Configurations/<Module>` | Нет, если без schema change | Средний |
| Mobile SQLite | Есть индексы для request/assignment/points/outbox/files | Нужен APK update smoke и migration test | Нет на backend; mobile migration да | Высокий |
| Audit/history | СИЗ события и system log есть, но покрытие действий неодинаково | Добавить события для ручных норм, brand/model dictionary, print/export | Возможно | Средний |

## 9. Frontend

| Экран/компонент | Проблема | Как разделить | Приоритет |
| --------------- | -------- | ------------- | --------- |
| `AssignmentScreen.tsx` | 2014 строк, много сценариев в одном файле | Workspace + EmployeePicker + RoutePicker + RequestModal + ActiveAssignments + History + actions | P0/P1 |
| `ppeWizard.tsx` | 1555 строк, UX выдачи и печати перегружен | EmployeeStep, ParamsStep, IssueChecklist, PrintStep, validation panel | P0/P1 |
| `InventoryOperationsScreen.tsx` | Уже переработан, но еще 645 строк и совмещает stock operation + PPE return/write-off | `PpeReturnWriteOffPanel` + `ManualStockOperationPanel` | P1 |
| `ResultsWorkspace.tsx` | Результаты уже выделены, но workspace 597 строк; есть дубли с components/results | Свести Result row/table/media/status helpers в одно место | P1 |
| `InventoryItemsScreen.tsx` | 1112 строк | catalog list/detail/stock/history/import | P2 |
| `shared/ui` | Есть, но покрытие еще неполное | ModalShell, CompactTable, StatusBadge, InspectorPanel использовать в новых feature-кодах | P1 |

## 10. Backend

| Файл/сервис | Проблема | Как рефакторить | Риск |
| ----------- | -------- | --------------- | ---- |
| `EfInventoryWorkflowService.cs` | Смешаны custody, PPE, employees/users, movements, history | Mechanical partial split, затем policies для PPE status/stock effects | Высокий |
| `EfInventoryExportService.cs` | Печать, export, validators, DOCX builders в одном файле | Выделить PPE print builder/validator/read model; reports отдельно | Высокий |
| `Patrol360DbContext.cs` | Все mappings в одном месте | `IEntityTypeConfiguration<>` по модулям | Средний |
| `EfPatrolStore.MobileAccounts.cs` | 675 строк после split | Queries/Lifecycle/Bindings/Sessions/Audit | Средний |
| `EfMobileAppService.Helpers.cs` | 384 строки helpers разных зон | DTO mapping, parsing, text normalization, status mapping | Средний |
| `EfEmuService.Maintenance.Notifications.cs` | 402 строки | PERCo scan blocks + notification upserts helpers | Средний |
| API controllers | `InventoryController` 785 строк, `EmuController` 843 строки | Дробить только после service split | Средний |

## 11. Mobile

| Mobile-раздел | Проблема | Как улучшить | Что нельзя ломать |
| ------------- | -------- | ------------ | ----------------- |
| `patrolRepository.ts` | 1436 строк, смешаны все Patrol local сценарии | facade + scoped repositories | SQLite schema/outbox compatibility |
| `outboxRepository.ts` | 593 строки, много статусов/queries | Commands, queue summaries, reconciliation helpers | `clientOperationId` и retry backoff |
| `bootstrapRepository.ts` | Сложная логика сохранения локальных active states | Добавить тесты на merge server/local states | Не удалять `completedLocal/syncError/authRequired` |
| `PointFillScreen.tsx` | UI, attachment, manual/skipped flow вместе | Components: status selector, unavailable action, gallery, comment, actions | point result persistence |
| Background sync | deps есть: `expo-background-task`, `expo-task-manager` | Нужен runtime APK smoke, Android ограничения задокументировать | Нельзя обещать мгновенную отправку |

## 12. Печать, Excel, DOCX/PDF

| Форма/отчет | Проблема | Как исправить | Приоритет |
| ----------- | -------- | ------------- | --------- |
| Личная карточка СИЗ | Канон уже усилен tests, но DTO локальный в export service | Вынести print read model contract и использовать в preview | P0 |
| Лист подписи | Раньше был пустой/нерабочий UI; backend tests есть, runtime нужно проверить | End-to-end browser smoke + fixture DOCX compare | P0 |
| PPE preview | Может расходиться с DOCX, если web строит rows сам | Preview от backend print DTO | P1 |
| Inventory reports | Export service смешивает разные отчеты | Report-specific builders | P2 |
| Excel import/export | Есть legacy import, diagnostics; нужна матрица mapping | Отдельный import contract/runbook и tests на дубли legacy_id | P2 |
| Temporary files/Blob URL | Нужно проверить cleanup | Добавить browser/runtime audit | Нужно проверить |

## 13. История и аудит действий

| Действие | Логируется сейчас | Что нужно добавить |
| -------- | ----------------- | ------------------ |
| Создание PPE карточки | Есть card/system log частично | Проверить полноту actor/comment |
| Добавление/изменение PPE строки | Есть `InventoryPpeCardLineEventEntity` | Добавить явные event types для manual norm, brand/model change |
| Выдача/возврат/списание | Добавлены stock moves и movement history для PPE | Закрепить unique/idempotency и UI journal filters |
| Печать DOCX/PDF | `InventorySystemLogEntity`/export job | Связать print status с UI и audit view |
| Patrol result completion | Есть outbox/result history | Добавить audit для cancelled-after-offline-complete terminal path |
| Route/NFC change | Есть route CRUD, нужно проверить audit coverage | Добавить event history для NFC/QR corrections |
| Permission/user changes | Site users/roles есть | Проверить audit trail для direct permissions/scopes |

## 14. Тесты

| Область | Какие тесты есть | Чего не хватает | Приоритет |
| ------- | ---------------- | --------------- | --------- |
| Backend unit/API | `Patrol360.Api.Tests`, smoke/controller tests | Endpoint permission allowlist и DTO compatibility tests | P1 |
| Infrastructure DB | Assignments, Results, MobileApp, EMU, PPE print/movement | Полный green DB gate зависит от PostgreSQL runtime; добавить migrations/data tests | P0 |
| Structure | `Patrol360.Structure.Tests` | Ограничения на размер файлов и forbidden compatibility imports | P1 |
| Web unit | Vitest 53 tests по текущему прогону ранее | Тесты `ppeWizard`, result media viewer, assignment status badges | P0/P1 |
| Web e2e | Playwright specs есть | Stable smoke `#inventory-ppe`, `#assign`, `#results` после UI правок | P0 |
| Mobile | Typecheck/lint, runtime вручную | Automated SQLite migration/outbox tests, APK update smoke | P1 |
| Print | PPE DOCX integration tests есть | Compare web preview rows with backend print DTO | P1 |

## 15. Риски рефакторинга

| Рефакторинг | Польза | Риск | Как снизить риск |
| ----------- | ------ | ---- | ---------------- |
| PPE print DTO/read model | Единая карточка/лист подписи | Средний | Additive DTO, fixture tests, no route breaking |
| PPE data model P2 | Чистое разделение нормы/номенклатуры/факта | Высокий | Nullable migrations, backfill script, DB integration before UI switch |
| Split `EfInventoryWorkflowService` | Снижение связности | Средний | Mechanical-only pass, no logic changes, tests after each group |
| Split `AssignmentScreen` | Уменьшение UI дефектов | Средний | Keep old screen as wrapper, component tests |
| Split mobile `patrolRepository` | Безопаснее offline sync | Высокий | Facade API unchanged, SQLite fixtures, APK update smoke |
| Status catalog | Единые backend/web/mobile rules | Высокий | First labels-only map, then code migration with compatibility |
| Remove compatibility files | Чистая структура | Средний | `rg` imports, staged module-by-module deletion |
| Move EF mappings | Чище DbContext | Средний | No schema changes, compare generated migration is empty |
| API auth/policies | Надежнее security | Высокий | Keep token format; add handler/policies in compatibility mode |

## 16. Что можно оставить как есть

| Область | Почему можно оставить |
| ------- | --------------------- |
| Верхнеуровневая modular monolith архитектура | Соответствует текущему масштабу и уже поддерживает apps/libs/tests/docs |
| Existing contracts projects | Хорошая точка для API DTO; нужны additive изменения, не замена |
| Mobile outbox/background sync базовая модель | Уже есть retry, stale sending recovery, background task deps |
| PERCo split structure | Уже разложено на scoped files; нужны точечные улучшения, не новый rewrite |
| EMU partial split | После предыдущих проходов остатки управляемые; не приоритет перед СИЗ/Patrol/mobile |
| Existing DB integration pattern | Полезен; нужно стабилизировать runtime gate |

## 17. Безопасный план рефакторинга

| Этап | Задача | Результат | Риск |
| ---- | ------ | --------- | ---- |
| P0 | Зафиксировать green gates: build, unit, structure, encoding, web build; отдельно разобраться с DB runtime connection | Понятная baseline-точка | Низкий |
| P0 | СИЗ: вынести print DTO/read model и подключить preview к тем же строкам, что DOCX | Лист подписи и карточка не расходятся | Средний |
| P0 | Web `#results`: завершить table/media viewer cleanup и smoke | Результаты обходов читаемы, media поверх modal | Средний |
| P1 | `AssignmentScreen.tsx` split без изменения API | Удобная поддержка назначений/отмен/избранного | Средний |
| P1 | `EfInventoryWorkflowService.cs` mechanical split | СИЗ/склад/история становятся сопровождаемыми | Средний |
| P1 | Mobile `patrolRepository.ts` split через facade | Снижение риска потери outbox/local data | Высокий |
| P1 | Status catalog для Patrol/PPE/Mobile sync | Единые правила отображения и фильтрации | Высокий |
| P2 | PPE нормальная модель данных: norm item, issue item, brand dictionary | Правильный поток `норма -> факт -> история` | Высокий |
| P2 | EF configurations по модулям | Чистый `Patrol360DbContext` | Средний |
| P2 | Compatibility cleanup | Уменьшение путаницы imports | Средний |

## 18. Первые 10 задач

1. Стабилизировать DB integration gate: понять, почему PostgreSQL connection рвется до тестовой логики.
2. Вынести PPE print/read DTO и использовать его одновременно для backend DOCX/PDF и web preview.
3. Закрепить PPE status catalog: `issued/replacement/reissued/returned/written_off/not_issued` с effects для склада, истории и листа подписи.
4. Разрезать `EfInventoryWorkflowService.cs` на PPE/Custody/EmployeesUsers/Movements/History partial-файлы.
5. Разрезать `ppeWizard.tsx` на шаги и улучшить вкладку `Выдача и чек-лист`.
6. Разрезать `AssignmentScreen.tsx`, начав с active assignments, request modal и favorites picker.
7. Разрезать mobile `patrolRepository.ts` через facade без изменения screen imports.
8. Добавить structure guard на новые файлы больше 800-1000 строк и forbidden imports из legacy compatibility слоев.
9. Вынести EF mappings из `Patrol360DbContext.cs` по модулям и проверить empty migration.
10. Добавить browser smoke для `/#inventory-ppe`, `/#assign`, `/#results` после UI-правок.

## 19. Проверки, выполненные для аудита

| Проверка | Результат |
| -------- | --------- |
| Чтение вложенного prompt | Исходный файл был mojibake, восстановлен декодированием cp1251 -> UTF-8 |
| `git status --short` | Рабочее дерево сильно dirty до аудита; unrelated изменения не трогались |
| Поиск крупных файлов | Найдены текущие top monolith files, исключая миграционные designer/snapshot |
| Проверка структуры папок | Подтверждены `features`, `Persistence/<Module>`, mobile `db/sync/features` |
| Поиск status/API/permission/print references | Подтверждены зоны дублирования и рисков |
| Runtime DB/browser profiling | Не выполнялось в этом аудите; нужно отдельным gate-pass |
