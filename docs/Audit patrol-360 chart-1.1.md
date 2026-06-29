# Audit patrol-360 chart-1.1

Дата: 26.06.2026  
Назначение: единый статусный реестр по накопленным аудитам Patrol360.  
Цель: отделить реально выполненное от незавершенного, оставить только полезный план, вынести хорошие идеи в backlog и явно исключить то, что сейчас не подходит проекту.

## 1. Легенда статусов

| Статус | Значение |
| --- | --- |
| Выполнено | Есть подтверждение в коде/документах/проверках, задача закрыта для текущего уровня зрелости. |
| Частично выполнено | Основа есть, но остались сценарии, UI-polish, runtime smoke, тесты или миграции. |
| Не выполнено | В аудитах есть требование, но реализации или надежного подтверждения нет. |
| В план | Нужно делать в ближайших проходах. |
| Идея позже | Полезно, но не блокирует стабильность ближайших релизов. |
| Исключить | Не подходит текущей архитектуре, преждевременно или создает лишний риск. |

## 2. Источники

| Документ | Роль в этом chart |
| --- | --- |
| `code-quality-audit-2026-06-22.md` | Качество кода, крупные файлы, mojibake, тестовые gates. |
| `architecture-audit-2026-06-22.md` | Общая архитектурная оценка. |
| `architecture-technical-decisions-audit-2026-06-22.md` | Modular monolith, runtime dependencies, API/health/auth hardening. |
| `api-integrations-audit-2026-06-22.md` | API и интеграции. |
| `analytics-internal-services-audit-2026-06-22.md` | Аналитика, внутренние сервисы, dashboards/diagnostics. |
| `security-api-audit-2026-06-23.md` | Security/API риски. |
| `patrol-structure-audit-2026-06-24.md` | Patrol web/backend/mobile структура. |
| `mobile-report-sync-audit-2026-06-25.md` | Offline/outbox/mobile report sync. |
| `mobile-patrol-scenario-stabilization-plan.md` | Мобильные сценарии обходов и защита от ошибок пользователя. |
| `patrol-routes-points-audit-2026-06-25.md` | Маршруты, точки, NFC/QR, результаты. |
| `patrol-status-lifecycle.md` | Lifecycle статусов обходов. |
| `patrol-api-contract.md` | Patrol API contract baseline. |
| `patrol-web-structure.md` | Web Patrol структура. |
| `inventory-ppe-full-audit-2026-06-25.md` | Полный аудит СИЗ. |
| `inventory-ppe-legacy-business-rules-audit-2026-06-25.md` | Старый проект как источник бизнес-правил СИЗ. |
| `inventory-ppe-stabilization-status-2026-06-26.md` | Текущий статус стабилизации СИЗ. |
| `residual-p1-p2-audit-2026-06-26.md` | Детальный аудит незакрытых P1/P2-хвостов: СИЗ UI, mobile APK, API/security, OpenAPI, импорт, e2e. |
| `project-full-audit-2026-06-22.md` | Общий аудит проекта. |
| `project-refactoring-audit-2026-06-25.md` | Рефакторинг и структура проекта. |
| `refactor-structure-plan.md`, `structure-improvement-plan.md`, `structure-remaining-work.md` | План структурной стабилизации. |
| `emu-work-accounting-audit.md`, `emu-work-accounting-control-audit.md`, `emu-work-accounting-development-plan.md` | ЭМУ, учет работ, PERCo-ready логика. |
| `accounting-development-plan.md` | Бухгалтерия/склад/СИЗ крупный план развития. |
| `frontend-improvement-plan.md`, `ui-finalization-spec.md` | UI cleanup и фронтенд-стандартизация. |
| `mobile-offline-recovery.md` | Mobile offline recovery. |

## 3. Краткий итог

Проект уже прошел большой стабилизационный слой: backend-сервисы начали раскладываться по partial-файлам, mobile outbox/report sync усилен, PPE-печать приведена ближе к правильному канону, DB integration ранее был доведен до зеленого состояния, основные build/typecheck/unit/structure/encoding gates проходили.

Главный остаток сейчас не в отсутствии направления, а в количестве параллельных незакрытых P1/P2-хвостов: UI бухгалтерии/СИЗ, mobile runtime/APK smoke, API hardening, security policies, OpenAPI/contract drift, импорт норм/номенклатуры, устаревшие e2e smoke tests.

## 3.1. Второй проход анализа на 26.06.2026

Повторный проход по audit/plan/status-документам подтвердил: старые аудиты нельзя использовать как один большой список задач. В них смешаны уже выполненные mechanical splits, реальные P1-дефекты, хорошие идеи на будущее и решения, которые сейчас проекту вредны. Рабочий backlog нужно вести только через этот chart.

| Группа аудитов | Что уточнено вторым проходом | Итоговое решение |
| --- | --- | --- |
| Architecture/code-quality | Главная архитектурная линия не изменилась: monorepo + modular monolith. Большая часть structural split уже сделана, но EF configurations, PERCo split, API hardening и frontend cleanup еще не закрыты. | Оставить как backend/frontend стабилизацию, микросервисы исключить. |
| Patrol web/mobile | Базовая структура, outbox и lifecycle уже есть, но browser comments по `#results/#assign` и APK/runtime smoke еще не закрыты. | Считать кодовую основу частично готовой, а runtime/UI сценарии - активным P1. |
| Mobile offline reports | Очередь, retry, stale sending recovery и duplicate protection есть. Главный незакрытый риск - доказательство на APK: offline, reconnect, media, authRequired. | Не добавлять новые сложные mobile-фичи до APK smoke. |
| PPE/SIZ | Печать и validation первого прохода улучшены, backend split выполнен, но целевая модель `PpeNormItem/PpeIssueItem/PpeBrandModelDictionary`, импорт DOCX/Excel и UI выдачи остаются незавершенными. | Ближайший рабочий фокус - `Бухгалтерия -> Выдача`, затем `Возврат/списание` и история. |
| EMU/PERCo | EMU-сервис достаточно разложен и функционально продвинут. PERCo остается следующим крупным интеграционным узлом, но не должен перебивать текущие PPE UI-дефекты. | PERCo split держать P2 после бухгалтерского P1 UI. |
| Security/API | Аудит проведен, но auth handler, policies, readiness, OpenAPI/contract drift и dependency audit еще не закрыты. | Отдельный P1 security/API pass, не смешивать с UI rewrite. |
| Analytics/performance | Идеи по read models/materialized views полезны, но без DB traces преждевременны. | Оставить в backlog "после замеров", не начинать сейчас. |
| CI/gates | Кодовые проверки зеленели; полный `Test-All` без `-SkipFrontendInstall` может падать на Windows из-за locked Rollup binary. | Считать это environment/runbook задачей, не дефектом проекта. |

### 3.1.1. Что считать выполненным после второго прохода

| Блок | Выполнено |
| --- | --- |
| Архитектурное решение | Modular monolith закреплен как целевая модель; микросервисы не нужны. |
| Backend split | `EfMobileAppService`, mobile patrol outbox, `EfEmuService`, `EfPatrolStore`, Inventory workflow/export разрезаны до управляемой структуры. |
| Gates | Encoding/structure/format/build/test/web checks проходили после ключевых изменений; `Test-All -SkipFrontendInstall` проходил как рабочий DB gate. |
| Mobile sync foundation | Есть SQLite/outbox, retry, stale sending recovery, duplicate/conflict handling, sync queue и background task foundation. |
| PPE print foundation | Канон СИЗ зафиксирован; личная карточка и лист подписи больше не должны строиться из категорий/складских названий как основного источника. |
| PPE price precision | Копейки в суммах сохраняются без округления до рублей. |

### 3.1.2. Что считать частично выполненным

| Блок | Что есть | Что мешает закрыть |
| --- | --- | --- |
| Patrol `#results` | Компоненты результата и media viewer выделены | Старые стили, строки/фильтры/модалка требуют UI pass и browser smoke. |
| Patrol `#assign` | Assignment components и backend lifecycle есть | Активные назначения, отмена, избранные сотрудники, дата по умолчанию требуют проверки и polish. |
| Mobile patrol UX | Lifecycle/outbox основа есть | Нужны APK update smoke, media full-cycle и проверка offline/server-cancel сценариев. |
| PPE выдача | Часть логики и печати стабилизирована | Вкладка выдачи и модуль `Бухгалтерия -> Выдача` еще неудобны и требуют полной перерисовки. |
| PPE возврат/списание | Backend/история/движения частично готовы | Нужен экран выбора сотрудника и реально выданных предметов. |
| PPE история | События пишутся на backend-уровне | Нужен удобный журнал: сотрудник, предмет, действие, дата, кто сделал. |
| Frontend architecture | `shared/ui`, `app`, feature CSS существуют | Старые локальные дубли и глобальные стили еще не вычищены. |
| EF configurations | Структура частично есть | Перенос mappings из `Patrol360DbContext` не завершен как правило проекта. |

### 3.1.3. Что не выполнено и остается реальным backlog

| Приоритет | Задача | Почему это реально нужно |
| --- | --- | --- |
| P1 | Перерисовать `Бухгалтерия -> Выдача` | Это сейчас самый заметный рабочий дефект СИЗ-сценария. |
| P1 | Перерисовать `Возврат и списание` | Пользователь должен видеть только реально выданные предметы и проводить корректные операции. |
| P1 | Сделать удобную историю СИЗ | Без журнала невозможно нормально проверять выдачу, возврат, списание и DOCX. |
| P1 | Закрыть browser comments по `#results/#assign` | Есть подтвержденные визуальные дефекты в рабочих экранах обходов. |
| P1 | Провести APK/runtime smoke mobile | Без этого offline/outbox нельзя считать production-ready. |
| P1 | API/security hardening | Auth handler, policies, readiness и OpenAPI нужны для эксплуатационной стабильности. |
| P2 | Добавить `PpeNormItem`, `PpeIssueItem`, `PpeBrandModelDictionary` | Это целевая модель СИЗ; текущие поля остаются фазовой совместимостью. |
| P2 | Импортировать DOCX нормы и Excel номенклатуру отдельно | Ускорит ввод и уберет ручные ошибки, но требует preview/сопоставления. |
| P2 | Экран `норма -> складская позиция` | Нужен для правильной связи нормы и склада. |
| P2 | Mechanical split `EfPercoIntegrationService` | Следующий крупный backend-интеграционный узел после закрытия PPE UI. |
| P2 | Обновить e2e tests | Текущие сценарии частично устарели после UI-изменений. |

### 3.1.4. Что оставить только как хорошую идею

| Идея | Почему не сейчас |
| --- | --- |
| Materialized views/read models | Нужны DB traces и доказанная нагрузка. |
| SignalR live updates | Сначала стабилизировать polling/API и основные сценарии. |
| Redis/RabbitMQ/Hangfire/MinIO | Нет текущего эксплуатационного требования, добавят runtime-сложность. |
| Полная автоматизация APK | Сначала ручной update smoke поверх старой базы. |
| Полный визуальный regression suite | Имеет смысл после стабилизации UI-компонентов. |

### 3.1.5. Что исключить из планов

| Исключить | Причина |
| --- | --- |
| Большой rewrite проекта | У проекта уже есть рабочая архитектура; нужен controlled refactor. |
| Микросервисы | Не соответствуют текущему размеру/риску/эксплуатационной зрелости. |
| Прямой перенос старого СИЗ-проекта | Переносить нужно правила, а не старый UI/код/костыли. |
| Перенос mobile в `apps/mobile` до APK smoke | Риск сломать обновление и локальную базу. |
| Big-bang миграция СИЗ-БД | Нужна фазовая nullable migration с backfill и совместимостью. |
| Удаление compatibility re-exports без `rg` | Риск скрытых импортов и поломки роутинга. |

## 4. Единая матрица аудитов

| № | Область | Вывод из аудитов | Статус | Решение |
| --- | --- | --- | --- | --- |
| 1 | Архитектура | Оставить monorepo + modular monolith, не уходить в микросервисы | Выполнено | Продолжать текущую модель. Микросервисы исключить. |
| 2 | Архитектура | Разделить active dependencies и target/planned dependencies | Выполнено частично | Документация обновлена, но нужно держать это правило в ADR/runbooks. |
| 3 | Архитектура | Не подключать Redis/RabbitMQ/MinIO/Hangfire/SignalR как обязательный runtime без необходимости | Выполнено как решение | Оставить как planned/optional, не делать сейчас. |
| 4 | Gates | Убрать mojibake/BOM/line-ending проблемы | Выполнено частично | Encoding gate зеленый, но новые документы/скрипты надо проверять постоянно. |
| 5 | Gates | `Test-All -IncludeDbIntegration` должен быть надежным | Частично выполнено | Кодовый gate зеленый с `-SkipFrontendInstall`; полный `npm ci` может падать из-за Windows EPERM. Нужен runbook и чистое окружение. |
| 6 | Backend structure | Разрезать `EfMobileAppService` | Выполнено | Есть partial-файлы Auth/Bootstrap/Files/Outbox/Helpers/Types. |
| 7 | Backend structure | Разрезать `EfMobileAppService.Outbox.Patrol` | Выполнено | Есть Completion/PointResults/RequestLifecycle/Validation. |
| 8 | Backend structure | Разрезать `EfEmuService` | Выполнено на текущем уровне | Есть WorkSessions/Reports/Maintenance/Decisions/Helpers partial-структура. |
| 9 | Backend structure | Разрезать `EfPatrolStore` | Выполнено | Есть Dashboard/Assignments/Results/Routes/Employees/MobileAccounts/Requests/Common. |
| 10 | Backend structure | Разрезать `EfInventoryWorkflowService` | Выполнено | Есть Issue/ReturnWriteOff/History/Validation partial-файлы. |
| 11 | Backend structure | Разрезать `EfInventoryExportService` print-часть | Выполнено | `EfInventoryExportService.Print.cs` создан. |
| 12 | Backend structure | Разрезать `EfPercoIntegrationService` | Не выполнено полностью | В план после закрытия текущих бухгалтерских UI/PPE хвостов. |
| 13 | EF structure | Вынести mappings из `Patrol360DbContext` в `Configurations/<Module>` | Частично выполнено | Папка `Configurations` есть, но нужно довести перенос и structure tests. |
| 14 | API hardening | Стандартный ASP.NET authentication handler поверх текущих токенов | Не выполнено | P1 security/API pass. |
| 15 | API hardening | Permission policies вместо точечных checks | Частично выполнено | RBAC/permissions есть, но полноценная policy-модель требует отдельного прохода. |
| 16 | API hardening | `/health/ready`: PostgreSQL, migrations, file storage | Не выполнено полностью | P1 runtime hardening. |
| 17 | API hardening | OpenAPI runtime/dev artifact и contract drift check | Не выполнено | P1/P2 API tooling. |
| 18 | Security | Базовые security checks и API audit | Частично выполнено | Аудит есть, но нужны rate limits, auth hardening, secret/storage review. |
| 19 | Security | `npm audit` vulnerabilities | Не выполнено | Отдельный dependency/security pass. Не смешивать с функциональным UI. |
| 20 | Patrol web | Разрезать `ResultsScreen` | Выполнено частично | Есть `ResultsWorkspace`, `PatrolResultDetails`, `PointResultTable`, `ResultMediaViewer`; UI еще требует polish. |
| 21 | Patrol web | Media viewer поверх result modal | Частично выполнено | Компонент есть, но требуется browser QA на фото/видео и z-index сценариях. |
| 22 | Patrol web | Перерисовать строки результатов и быстрые фильтры | Частично выполнено | В план UI pass по `#results`. |
| 23 | Patrol web | Убрать правый inspector выбранного обхода, если он мешает | Не выполнено полностью | В план UI pass по `#results`. |
| 24 | Patrol web | Разрезать `AssignmentScreen` | Частично выполнено | Есть feature/assignments components, но screen еще требует финального workspace cleanup. |
| 25 | Patrol web | Активные назначения: scroll, полный badge, корректные статусы | Частично выполнено | В план, потому что были browser comments о старых/обрезанных статусах. |
| 26 | Patrol web | Избранные сотрудники в назначениях | Частично выполнено/нужно проверить | Есть настройки/favorites на backend, UI сценарий создания заявки надо перепроверить. |
| 27 | Patrol web | Дата заявки по умолчанию сегодня | Частично выполнено/нужно проверить | В browser QA. |
| 28 | Patrol routes | NFC/QR uniqueness и route points validation | Выполнено частично | DB tests есть; UI/edge cases требуют периодического smoke. |
| 29 | Mobile | Offline outbox и защита отчетов от потери | Выполнено частично | Outbox, retry, stale sending recovery, duplicate protection есть; runtime/APK не закрыт. |
| 30 | Mobile | Экран `Не отправлено / Очередь` | Выполнено частично | `SyncQueueScreen` есть, нужно проверить runtime на устройстве. |
| 31 | Mobile | Background sync | Частично выполнено | `backgroundSyncTask` есть, но Android guarantees/APK smoke не проверены. |
| 32 | Mobile | Фото и видео полный цикл | Частично выполнено | Файловый механизм есть, но нужен end-to-end runtime smoke: local -> upload -> point -> web. |
| 33 | Mobile | Заявки не исчезают молча, отмена/изменение видимы | Частично выполнено | Lifecycle и статусы есть, но сценарии offline cancel требуют runtime QA. |
| 34 | Mobile | Accept/release/start/pause/resume/handoff lifecycle | Частично выполнено | Backend commands есть, mobile UX требует финальной проверки. |
| 35 | Mobile | APK build/update поверх старой базы | Не выполнено в текущем chart | Обязательный release smoke, в план. |
| 36 | Mobile | Перенос папки `Мобильное приложение` в `apps/mobile` | Исключить сейчас | Делать нельзя до отдельного APK install/update smoke. |
| 37 | PPE/SIZ | Канон `норма -> номенклатура -> факт выдачи -> печать -> история` | Выполнено как бизнес-решение | Зафиксировано и частично реализовано. |
| 38 | PPE/SIZ | Личная карточка печатает нормы | Выполнено | DOCX content check подтверждал отсутствие моделей в таблице норм. |
| 39 | PPE/SIZ | Лист подписи печатает фактическую выдачу | Выполнено частично | Работает в fixture, нужен визуальный DOCX/PDF render и реальные образцы. |
| 40 | PPE/SIZ | Категории не должны печататься как СИЗ | Выполнено частично | Validation есть, но нужен полный UI validation pass. |
| 41 | PPE/SIZ | Копейки в суммах не округлять | Выполнено | UI ввод/отображение копеек исправлены. |
| 42 | PPE/SIZ | UI `Выдача и чек-лист` | Частично выполнено | Нужно продолжить перерисовку удобного интерфейса. |
| 43 | PPE/SIZ | Модуль `Бухгалтерия -> Выдача` полностью перерисовать | Не выполнено | Следующий P1 UI pass: сначала UX-проектирование, потом реализация. |
| 44 | PPE/SIZ | Возврат/списание по реально выданным предметам | Частично выполнено | Backend/история есть; UI нужно перерисовать. |
| 45 | PPE/SIZ | История движения: создано/выдано/возвращено/списано/DOCX | Частично выполнено | Backend события есть, нужен удобный пользовательский журнал. |
| 46 | PPE/SIZ | `PpeNormItem`, `PpeIssueItem`, `PpeBrandModelDictionary` | Не выполнено | P2 миграционный проход. |
| 47 | PPE/SIZ | Импорт норм из DOCX | Не выполнено | P2 importer с preview. |
| 48 | PPE/SIZ | Импорт складской номенклатуры из Excel отдельно | Не выполнено | P2 importer склада, не смешивать с нормами. |
| 49 | PPE/SIZ | Экран сопоставления `норма -> складская позиция` | Не выполнено | P2 UI/API. |
| 50 | PPE/SIZ | Не копировать старый проект напрямую | Выполнено как решение | Старый проект использовать только как источник правил. |
| 51 | EMU | Ядро учета работ, смены, решения, PERCo-ready logic | Выполнено частично/высокая готовность | Много DB tests и реализаций есть; остаются UI/analytics polishing. |
| 52 | EMU | Reports/Maintenance split | Выполнено | Reports и Maintenance разнесены. |
| 53 | EMU | PERCo lunch/absence edge cases | Выполнено частично | Исправлен конкретный lunch open interval case; нужны production traces. |
| 54 | PERCo | Web integration diagnostics | Частично выполнено | Контроллер/сервис есть, но сервис крупный и требует split. |
| 55 | PERCo | `EfPercoIntegrationService` mechanical split | Не выполнено | В план после текущих бухгалтерских/PPE UI задач. |
| 56 | Analytics | Dashboard/results/EMU/inventory analytics | Частично выполнено | Основные dashboards есть, но без полного observability/data mart слоя. |
| 57 | Analytics | Materialized/read-model решения | Идея позже | Делать только после Postgres traces/EXPLAIN и доказанной нагрузки. |
| 58 | Frontend architecture | Перенос shell/routing в `apps/web/src/app` | Частично выполнено | Папка `app` есть; нужно завершить cleanup импортов. |
| 59 | Frontend architecture | `shared/ui` единый слой | Частично выполнено | Папка есть, но старые локальные дубли еще остаются. |
| 60 | Frontend architecture | Разрезать `styles.css` | Частично выполнено | Feature CSS появились, глобальный стиль еще надо удерживать. |
| 61 | Frontend tests | E2E smoke по основным потокам | Частично выполнено | Часть e2e устарела из-за нового UI, нужно обновить. |
| 62 | CI/Git | Remote GitHub, branch protection, CODEOWNERS | Не подтверждено | Проверить отдельно, не считать закрытым. |
| 63 | Docs | Аудиты накоплены, но не сведены | Выполнено этим документом | Этот chart становится новым входом для планирования. |

## 5. Реально нужно выполнить

Это задачи, которые напрямую повышают стабильность или закрывают подтвержденные дефекты.

### P0

| Приоритет | Задача | Почему нужно |
| --- | --- | --- |
| P0 | Запустить `Test-All -IncludeDbIntegration -SkipFrontendInstall` после последнего backend split | Подтвердить DB integration после механического переноса Inventory. |
| P0 | Зафиксировать Windows runbook для `npm ci EPERM Rollup native binary` | Чтобы не путать блокировку файла с падением тестов проекта. |
| P0 | Продолжить UI-проектирование `Бухгалтерия -> Выдача` до реализации | Сейчас пользовательский сценарий не должен строиться на старой битой таблице. |
| P0 | Browser smoke `#inventory-ppe`, `#inventory-issue`, `#inventory-operations`, `#inventory-history` после следующего UI pass | Бухгалтерия сейчас активно меняется; нужны скриншотные/ручные проверки. |

### P1

| Приоритет | Задача | Почему нужно |
| --- | --- | --- |
| P1 | Перерисовать `Бухгалтерия -> Выдача`: сотрудники, нормы, выбранная номенклатура, черновик, подтверждение | Ключевой рабочий сценарий СИЗ. |
| P1 | Перерисовать `Возврат и списание`: сотрудник -> выданные предметы -> операция | Сейчас backend готов больше, чем UX. |
| P1 | Сделать удобную историю СИЗ: сотрудник, предмет, действие, дата, кто сделал | Нужна эксплуатационная прозрачность. |
| P1 | Добить web `#results`: строки, фильтры, media viewer, убрать старый стиль | Есть подтвержденные browser comments. |
| P1 | Добить web `#assign`: активные назначения, отмена/возврат, избранные сотрудники, дата по умолчанию | Есть подтвержденные browser comments. |
| P1 | APK/runtime smoke mobile offline/outbox/photo/video | Без этого нельзя считать mobile recovery production-ready. |
| P1 | Standard auth handler + readiness health | Security/API hardening из аудитов. |

### P2

| Приоритет | Задача | Почему нужно |
| --- | --- | --- |
| P2 | `PpeNormItem`, `PpeIssueItem`, `PpeBrandModelDictionary` с миграцией | Закрывает временную фазовую модель СИЗ. |
| P2 | Импорт DOCX норм и Excel номенклатуры | Ускоряет ввод данных и снижает ручные ошибки. |
| P2 | Экран сопоставления `норма -> складская позиция` | Нужен для правильного потока СИЗ. |
| P2 | `EfPercoIntegrationService` mechanical split | Следующий крупный backend-узел. |
| P2 | OpenAPI + contract drift checks | Уменьшает риск рассинхронизации backend/web/mobile. |
| P2 | Обновить e2e tests под новый UI | Сейчас часть smoke-ожиданий устарела. |

## 6. Что идет в планы

| Тема | План |
| --- | --- |
| Бухгалтерия/СИЗ UI | Сделать рабочие места `Выдача`, `Возврат/списание`, `История`, `Печать` с понятными списками и модалками. |
| Mobile | Довести сценарии offline report, background sync, media upload и authRequired до APK smoke. |
| Patrol web | Закрыть visual comments по `#results` и `#assign`, затем обновить e2e. |
| Backend structure | Продолжить controlled split: PERCo, EF configurations, затем точечные policies/domain helpers. |
| API/security | Auth handler, policies, health/readiness, OpenAPI, dependency audit. |
| Data/performance | DB traces/EXPLAIN, только потом индексы/read models/materialized views. |
| Docs/runbooks | Оставить этот chart как верхний planning index, старые аудиты не использовать как прямой backlog без фильтра. |

## 7. Хорошие идеи на потом

| Идея | Условие, когда возвращаться |
| --- | --- |
| Materialized views/read models для dashboards | Только после замеров PostgreSQL и подтвержденных bottlenecks. |
| SignalR live updates | После стабилизации базового polling/API и мобильных сценариев. |
| RabbitMQ/Hangfire orchestration | Когда появятся реальные фоновые очереди с требованиями SLA, не раньше. |
| Redis cache | После профилирования, если память/инвалидация понятны. |
| MinIO/S3-like storage | Если локальное хранилище файлов станет эксплуатационным риском. |
| Advanced analytics dashboards | После нормализации primary workflows и данных. |
| Full visual regression/screenshots | После стабилизации UI-компонентной структуры. |
| APK automation | После ручного smoke обновления поверх старой версии. |

## 8. Исключить сейчас

| Идея/требование | Решение | Причина |
| --- | --- | --- |
| Переписать проект на микросервисы | Исключить | Текущая целевая модель - modular monolith; микросервисы увеличат риск. |
| Перенести старый проект СИЗ кодом напрямую | Исключить | Старый проект только источник бизнес-правил; код/стили/костыли не переносить. |
| Переносить mobile папку в `apps/mobile` прямо сейчас | Исключить до smoke | Риск сломать APK/update path. |
| Вводить RabbitMQ/Redis/MinIO/Hangfire как активные зависимости сейчас | Исключить из ближайшего P0/P1 | Нет доказанной необходимости, усложнит runtime. |
| Делать materialized/read-model слой без DB traces | Исключить до измерений | Риск создать лишнюю архитектуру без подтвержденной проблемы. |
| Делать big-bang redesign БД СИЗ | Исключить | Нужна фазовая миграция с nullable fields/backfill/tests. |
| Смешивать UI rewrite, backend migration и security hardening в одном проходе | Исключить | Слишком высокий blast radius. |
| Удалять compatibility re-exports без `rg` | Исключить | Риск скрытых импортов и поломки роутинга. |

## 9. Фактические подтверждения в коде

| Подтверждение | Где видно |
| --- | --- |
| MobileApp split | `libs/infrastructure/Persistence/MobileApp/*` |
| Mobile patrol outbox split | `EfMobileAppService.Outbox.Patrol.*.cs` |
| EMU split | `libs/infrastructure/Persistence/Emu/*` |
| Patrol store split | `libs/infrastructure/Persistence/Patrol/*` |
| Inventory workflow split | `libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.*.cs` |
| Inventory print split | `libs/infrastructure/Persistence/Inventory/EfInventoryExportService.Print.cs` |
| Patrol results components | `apps/web/src/features/patrol/results/*` |
| Inventory PPE components | `apps/web/src/features/inventory/ppe/*` |
| Mobile sync queue/background files | `Мобильное приложение/src/features/syncQueue`, `Мобильное приложение/src/sync/backgroundSyncTask.ts` |

## 10. Проверки, которые считать обязательными после следующих проходов

| Тип | Команда/проверка |
| --- | --- |
| Backend build | `dotnet build .\Patrol360.slnx --no-restore` |
| Backend tests | `dotnet test .\Patrol360.slnx --no-build` |
| DB integration | `.\tools\Test-All.ps1 -IncludeDbIntegration -SkipFrontendInstall` |
| Structure | `dotnet run --project tests\Patrol360.Structure.Tests\Patrol360.Structure.Tests.csproj --no-restore` |
| Encoding | `.\tools\Verify-TextEncoding.ps1` |
| Format | `dotnet format .\Patrol360.slnx --verify-no-changes --no-restore` |
| Web typecheck | `npm run typecheck --prefix apps\web` |
| Web unit | `npm run test:unit --prefix apps\web -- --run` |
| Web build | `npm run build --prefix apps\web` |
| Browser smoke | `#inventory-ppe`, `#inventory-issue`, `#inventory-operations`, `#inventory-history`, `#assign`, `#results` |
| Mobile smoke | APK update, offline report, sync queue, photo/video upload, authRequired without data loss |

## 11. Итоговое решение

Этот chart заменяет прямое использование всех старых аудитов как backlog. Старые аудиты остаются архивом фактов и контекста, но новые задачи нужно брать из разделов:

1. `Реально нужно выполнить`
2. `Что идет в планы`
3. `Хорошие идеи на потом`
4. `Исключить сейчас`

Ближайший правильный следующий проход: спроектировать и затем перерисовать `Бухгалтерия -> Выдача` как отдельное рабочее место без изменения backend API, после этого закрыть `Возврат/списание` и пользовательскую историю СИЗ.
