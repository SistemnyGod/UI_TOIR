# Остатки legacy и кандидаты на удаление — 9 октября 2026

**Обновление 10 октября:** подтверждённая очистка выполнена; результаты и сохранённые исключения — в [отчёте реализации](legacy-cleanup-implementation-2026-10-10.md). Описание ниже фиксирует состояние до удаления.

## Вывод

В проекте остались три разных вида старого кода: отключённые экраны и вспомогательные функции; временные переэкспорты после переноса файлов; работающие адаптеры старых данных и клиентов. Удалять следует первые два вида после перевода тестов и служебных скриптов. Адаптеры данных и история требуют отдельного завершения перехода.

Основные кандидаты:

- **88 файлов старых веб-путей**: 58 в `src/components`, 30 в `src/screens`;
- **42 файла прежних мастеров/панелей СИЗ и 2 их CSS** вне графа основного приложения;
- **25 прежних панелей** дашборда, назначений, результатов, сотрудников, аккаунтов и пользователей;
- **11 мобильных файлов** вне графа маршрутов Expo;
- **18 приватных объявлений C# без ссылок из рабочего кода**: 16 методов и 2 record. Один метод вызывается тестом через reflection; остальные 17 не имеют найденных вызовов из проверенных исходников и тестов;
- старые складские API и импорт инвентаря, оставшиеся в основном сервере.

Это не сумма всех файлов для немедленного удаления. Например, старый мастер может хранить локальные черновики, а файлы без ссылок из основного приложения могут использоваться конфигурацией или тестами. Ни один файл приложения, таблица или контейнер в ходе этой проверки не удалён.

## Что можно очищать первым

### 1. Временные старые пути frontend

[src/components](<C:/Users/AI_server/Desktop/Proekt obhod/apps/web/src/components>) и [src/screens](<C:/Users/AI_server/Desktop/Proekt obhod/apps/web/src/screens>) содержат **88 файлов, около 262 строк**. Большинство — короткие переэкспорты компонентов из `features`, `app/shell` и `shared`. Основное приложение уже импортирует новые пути. Например, старый `screens/DashboardScreen.tsx` просто переэкспортирует новый дашборд.

Из этих 88 файлов 12 входят в граф импортов тестов. Дополнительно [структурная проверка frontend](<C:/Users/AI_server/Desktop/Proekt obhod/tests/web/unit/run-unit-tests.mjs:24>) до сих пор требует существования старых `src/App.tsx` и `src/screens/DashboardScreen.tsx`. Сам `src/App.tsx` тоже является неиспользуемым основным приложением переэкспортом; `main.tsx` импортирует `app/App` напрямую.

**Действие:** перевести импорты тестов на настоящие расположения и изменить структурную проверку, затем удалить старые пути и больше не создавать новые совместимые переэкспорты без конкретного потребителя. Не удалять реализации из `features`, на которые эти файлы указывают.

### 2. Приватные остатки backend

Подтверждённые примеры без найденных рабочих вызовов:

| Файл | Остаток |
| --- | --- |
| [EfInventoryWorkflowService.ReturnWriteOff.cs:251](<C:/Users/AI_server/Desktop/Proekt obhod/libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.ReturnWriteOff.cs:251>) | `GetAvailableStock` — прежний подсчёт наличия для СИЗ |
| [EfInventoryExportService.cs:284](<C:/Users/AI_server/Desktop/Proekt obhod/libs/infrastructure/Persistence/EfInventoryExportService.cs:284>) | `ToPpeStatusLabel`, `PpePrintQuantityText`, `ToRussianPpeStatus`, `IsOpenPpeLineForSignature` |
| [EfInventoryExportService.cs:1185](<C:/Users/AI_server/Desktop/Proekt obhod/libs/infrastructure/Persistence/EfInventoryExportService.cs:1185>) | `InsertParagraphBefore`, `InsertParagraphAfter` |
| [EfEmuShiftReportService.cs:282](<C:/Users/AI_server/Desktop/Proekt obhod/libs/infrastructure/Persistence/EfEmuShiftReportService.cs:282>) | `MapSummary`, заменённый текущей выборкой журнала |
| [EfMobileAppService.Outbox.Patrol.Completion.cs:502](<C:/Users/AI_server/Desktop/Proekt obhod/libs/infrastructure/Persistence/MobileApp/EfMobileAppService.Outbox.Patrol.Completion.cs:502>) | `BuildPersistedMobilePointComment`, `BuildPersistedMobilePointIssueType`, `BuildPersistedMobilePointSeverity`, `CompletePointResultSnapshot` |
| [EfInventoryWorkflowService.Issue.cs:372](<C:/Users/AI_server/Desktop/Proekt obhod/libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.Issue.cs:372>) | `MapPpeCard` |
| [EfPpeKitTemplateService.cs:132](<C:/Users/AI_server/Desktop/Proekt obhod/libs/infrastructure/Persistence/Inventory/EfPpeKitTemplateService.cs:132>) | `NormalizeUnit` |

Также найдены `StockAggregateRow`, `BuildResultComment` и `CatalogLineDescription`. Полный список и строки — в диагностическом JSON.

**Исключение:** [RebuildPresenceIntervalsForNewEventsAsync](<C:/Users/AI_server/Desktop/Proekt obhod/libs/infrastructure/Persistence/Perco/EfPercoIntegrationService.Presence.cs:89>) отсутствует в рабочих вызовах, но тест ЭМУ вызывает его через reflection. Его очистку нужно сопровождать переводом теста на поддерживаемый механизм пересчёта; молча удалять проверку поведения нельзя.

**Действие:** удалять небольшими группами вместе с исключительно обслуживающими их приватными полями/типами, затем собирать решение и выполнять тесты соответствующей области. Не удалять целые сервисы по наличию одного неиспользуемого метода.

### 3. Небольшие неиспользуемые веб-адаптеры

Не найдены потребители в основном приложении и импортирующие их тесты для:

- [api/patrolData.ts](<C:/Users/AI_server/Desktop/Proekt obhod/apps/web/src/api/patrolData.ts>) — старые имена API-клиента поверх `patrolDataRepository`;
- [repositories/dashboardRepository.ts](<C:/Users/AI_server/Desktop/Proekt obhod/apps/web/src/repositories/dashboardRepository.ts>) — переэкспорт демонстрационных метрик;
- [hooks/useSelectedPatrol.ts](<C:/Users/AI_server/Desktop/Proekt obhod/apps/web/src/hooks/useSelectedPatrol.ts>);
- `domain/activePatrolDetails.ts`, используемый старой отключённой панелью;
- `hooks/useMobileSyncWorkspace.ts` и `repositories/mobileSyncRepository.ts` — отключённая связка старой диагностики синхронизации.

Удаление этой связки не означает удаления серверной диагностики или схемы разрешения конфликтов. Их API и поддержка мобильного обмена являются отдельными работающими механизмами.

## Крупные отключённые ветки UI

### Прежние мастера и панели СИЗ

Основной путь создания теперь: `InventoryPpeCreateScreen` → `PpeIssueDocumentConstructor`. При выключенной выдаче показывается причина и переход к подготовке норм; старый мастер не включается автоматически.

Вне основного графа находятся **42 файла, около 5 466 строк** в `features/inventory/ppe`:

- [PpeIssueWorkflowScreen.tsx](<C:/Users/AI_server/Desktop/Proekt obhod/apps/web/src/features/inventory/ppe/PpeIssueWorkflowScreen.tsx>), `PpeIssueWorkflowSteps.tsx`, `ppeIssueDraft.ts`;
- [ppeWizard.tsx](<C:/Users/AI_server/Desktop/Proekt obhod/apps/web/src/features/inventory/ppe/ppeWizard.tsx>), его actions/domain/payloads, шаги и `WizardLinesTable`;
- старые `ppeJournal`, `ppeDrawer`, `PpeDrawerTables`, `usePpeJournalState`;
- прежняя группа выбора товаров и ручных норм: `PpeCatalogPicker`, `PpeItemPickerModal`, `PpePicker*`, `PpeManualNormForm` и ряд связанных компонентов.

Ещё **2 отключённых CSS, около 1 369 строк**: `ppe-catalog-picker.css`, `ppe-issue-workflow.css`.

Часть этой ветки до сих пор проверяется тестами. `PpeIssueWorkflowScreen` также указан в [списке файлов выпуска СИЗ](<C:/Users/AI_server/Desktop/Proekt obhod/tools/apply-ppe-release-overlay.py:46>). Тесты старого мастера не подтверждают работу нынешнего конструктора.

**Действие:** проверить сохранённые локальные черновики и перенести нужные сценарии/регрессии на действующий конструктор; обновить список выпуска; удалить отключённые UI-ветки и их исключительно собственные стили. Сохранить серверную миграцию старых черновиков и старые карточки/строки. Не удалять весь каталог `ppe`: текущие `Document*`, журнал документов, настройки норм, шаблоны и часть каталога используются.

### Прежние панели обходов и других экранов

**25 файлов, около 2 683 строк** в старых группах компонентов не достижимы из основного приложения. Среди них:

- прежние `ActivePatrolDetail`, `ActivePatrolsPanel`, `DashboardMetricsBar`, `DashboardRequestsPanel`, `DashboardTodayRoutesPanel`;
- `ActiveAssignmentsPanel`, `AssignableEmployeesPanel`, `AssignableRoutesPanel`, `AssignmentDraftDrawer`, `AssignmentToolbar`;
- `ResultsJournalPanel`, `ResultDetailDrawer`, `MobileSyncPanel`;
- `PlanningSummaryCards`, `ScheduleSidePanels`, прежние панели метрик/доступа аккаунтов и пользователей.

Текущие результаты используют `ResultsWorkspace`; дашборд и назначения имеют собственные обновлённые реализации. Дополнительно старый `results/PointResultTable.tsx` вне рабочего графа, но импортируется UI-тестом.

**Действие:** перевести оставшиеся проверки на используемые таблицы/модалки, затем удалить прежние панели и зависимые от них функции. Сохранить текущую общую модалку результатов и фотографий.

## Мобильное приложение

Маршрут `app/(tabs)/patrol.tsx` открывает `features/patrol/RequestBoardScreen` напрямую. Прежний dashboard `patrolHome` больше не подключён.

Из **11 кандидатов, около 484 строк**, у семи не найдены рабочие импорты или ссылки из проверенных тестов:

- `src/api/patrolApi.ts` — лишний переэкспорт `mobileApi`;
- `src/features/patrolHome/PatrolHomeScreen.tsx` — прежнее имя экрана;
- `src/domain/patrol/patrolCommands.ts`;
- `src/domain/sync/localStatus.ts`;
- `src/sync/conflictHandler.ts`;
- `src/ui/ConfirmationSheet.tsx`;
- `src/ui/MetricCard.tsx`.

Ещё четыре проверяются только тестами: `patrolRules.ts`, `patrolHomeViewModel.ts`, `usePatrolHomeDashboard.ts`, `retryPolicy.ts`. Для dashboard hook тест читает исходник как текст, а не импортирует его. Их следует удалять после переноса проверяемых правил на действующий экран/обработчик очереди. Нельзя терять требования к фото, комментариям, повтору отправки и восстановлению офлайн-работы.

Отдельный кандидат зависимости: `@tanstack/react-query`. В проверенных `app`/`src` найден только `QueryClientProvider` в корневом layout; запросы, мутации и потребители query client не найдены. Можно убрать этот пустой слой и зависимость отдельным изменением с проверкой запуска и сборки APK. Размер возможной экономии не измерялся. Это не относится к `zod`: он используется для проверки протокола API.

## Старые серверные сценарии, которые сначала нужно закрыть

### Складские остатки

После отказа от складского учёта остались GET `stock`, POST `stock/initial` и ветка `CreateOperation` с явно указанным `warehouseId`, которая проверяет остаток. Для текущей выдачи UI передаёт `warehouseId: null`. Избыточная ветка не должна включаться старым полем запроса.

**Действие:** закрыть новые складские записи, убрать проверку наличия из новых учётных операций и лишние элементы наличия/склада в интерфейсе; сохранить историю и совместимость контрактов там, где они читают старые данные. `CreateOperation` целиком удалять нельзя: текущая форма использует его для фиксации выдачи без склада. Таблица с историческим названием `stock_moves` также содержит учётные движения; её название не делает данные ненужными.

### Старый импорт инвентаря

[EfInventoryLegacyImportService](<C:/Users/AI_server/Desktop/Proekt obhod/libs/infrastructure/Persistence/EfInventoryLegacyImportService.cs>) зарегистрирован в DI. В контроллере остались POST `legacy/import`, POST `legacy/import/dry-run` и GET истории прогонов. Импорт переносит в том числе старые складские движения. Из текущих веб-экранов вызовы `importLegacy` не найдены, но миграционный PowerShell-инструмент использует эти endpoints.

**Действие:** после проверки завершённости переноса вынести запись импорта в отдельную миграционную утилиту либо убрать её из обычного production API. Чтение прогонов, `LegacyId`, журналы, контрольные суммы и необходимые инструменты восстановления сохранить. Этот сервис нельзя назвать полностью неиспользуемым только потому, что на основном экране нет кнопки.

Старые пути создания фактов СИЗ также требуют отдельного вывода из эксплуатации после перехода всех клиентов. Старые карточки, чтение, возвраты и списание текущий UI ещё использует: удалять весь старый `IInventoryWorkflowService` или `InventoryController` нельзя.

## Что сохраняем

| Остаток | Почему он ещё нужен |
| --- | --- |
| `LegacyTemplatesAdmin` и импорт браузерных шаблонов в `KitTemplates` | Подключены к текущим экранам; обеспечивают явную привязку владельца/нормы и перенос состава |
| Миграция старого черновика СИЗ | Вызывается действующим конструктором; сохраняет исходные данные при неподтверждённой норме |
| Старые строки и история СИЗ/под запись | Читаются, участвуют в возвратах, списаниях и печати |
| Миграции PostgreSQL и SQLite | Нужны восстановлению БД и обновлению установленного приложения |
| Чтение прежних SecureStore-токенов и сохранённых логина/пароля | Используется при переходе со старой версии телефона |
| Переход с `patrol360-mobile.db` на зашифрованную БД | Сохраняет офлайн-результаты и черновики при обновлении APK |
| Fallback старых вложений `mobile-files` | Поддерживает чтение файлов из прежнего расположения |
| API mobile v1 и v2 | Текущий APK обращается к обеим версиям: авторизация/outbox/bootstrap v1, заявки на работы v2 |
| HTTP-совместимость LAN | Принятое решение для установленных Android-клиентов; отдельный переход требует проверки устройств |
| Демонстрационные/mock-репозитории | Подключены к режиму разработки и тестам; требуют переноса за границу production, а не слепого удаления `data.ts` |

Файлы `legacy-global.css`, `inventory-legacy-bridge.css`, `01-issue-legacy-base.css` также **подключены сейчас**. Их имена не доказывают неиспользование: они содержат работающие общие правила. Очистка требует переноса нужных селекторов и визуальной проверки соответствующих экранов; удаление целого файла может сломать текущие модалки.

## Архив и инфраструктурный резерв

- [legacy/territory-patrol-panel](<C:/Users/AI_server/Desktop/Proekt obhod/legacy/territory-patrol-panel>) — старый статический прототип без backend-интеграции; CI его не собирает. После сохранения полезных изображений/сценариев его можно убрать из рабочей структуры. Сейчас структурные тесты требуют каталог и README — их тоже нужно обновить.
- Старые APK, `build-output-*/source-before`, релизные снимки, `bin/obj`, `dist`, временные аудиты — архивные или генерируемые материалы, а не используемый код приложения. Чистить отдельно, сохранив актуальный APK, необходимые варианты совместимости, резервные копии выпуска и ключи подписи. Без оценки сохранности архива их не удаляли.
- Redis/RabbitMQ/MinIO уже выделены в `compose.optional-services.yaml`; приложение не имеет найденных клиентов к этим сервисам, README называет их резервом. Это кандидаты на отключение лишних запущенных сервисов после проверки внешних потребителей. Удалять их тома или считать содержимое ненужным по исходникам Patrol360 нельзя.

## Как проверяли и порядок очистки

Проанализированы импорты TS/TSX, статические и динамические импорты с буквальными путями, переэкспорты, CSS `@import`, тестовые импорты и упоминания файлов. Для mobile корни — все файловые маршруты `app`; для web — `src/main.tsx`. Для приватных C#-объявлений проверялись имена во всех исходниках API/worker/libs без миграций и затем ссылки из тестов/утилит.

В веб-графе нет неразрешённых локальных импортов и динамических выражений. В mobile нет неразрешённых локальных импортов; единственный найденный небуквальный динамический import относится к тесту native patch, а не рабочему приложению.

Получены **174 web-кандидата и 11 mobile-кандидатов** вне основного графа, а не 185 файлов, готовых к удалению. Например, `src/test/setup.ts` используется `vite.config.ts` и должен остаться. Граф не заменяет проверку внешних потребителей API, конфигурации, архивных данных и CSS-селекторов. Проверка frontend-структуры прошла; прикладной код не менялся, полные сборки/тесты после удаления не запускались, поскольку удаления не было.

Полные списки: [runtime-imports.json](<C:/Users/AI_server/Desktop/Proekt obhod/TestResults/legacy-audit-20261009/runtime-imports.json>) и [backend-private-candidates.json](<C:/Users/AI_server/Desktop/Proekt obhod/TestResults/legacy-audit-20261009/backend-private-candidates.json>). Скрипт анализа находится рядом. Эти материалы — диагностика, не часть production.

Порядок:

1. Закрыть возможность новой складской записи, сохранив учёт фактов и историю.
2. Перевести тесты/структурные проверки на действующие пути и компоненты.
3. Удалить простые переэкспорты и приватные backend-остатки; собрать и проверить затронутые области.
4. Удалить прежние UI-мастера и панели группами, сохранив данные/переходы; обновить сценарий выпуска.
5. Очистить мобильные кандидаты и пустой query-provider отдельным изменением с проверкой офлайн-работы и APK.
6. После завершения миграций вывести разовый импорт из обычного API, архивировать старый прототип и обновить документацию.

Большая часть отключённого frontend уже не попадает в основной runtime-граф. Главный ожидаемый выигрыш очистки — понятная структура, меньше дублирования и тесты действующего поведения. Ускорение приложения и уменьшение сборки следует измерять отдельно.
