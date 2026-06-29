# Аудит остаточных P1/P2-хвостов Patrol360 на 26.06.2026

Цель: проверить текущий остаток из общего chart: UI бухгалтерии/СИЗ, mobile runtime/APK smoke, API hardening, security policies, OpenAPI/contract drift, импорт норм/номенклатуры и e2e smoke tests.

Вывод: направление корректное, но эти хвосты нельзя закрывать одним большим проходом. Они относятся к разным слоям риска: пользовательский UX, runtime mobile, security/API contract, данные СИЗ и тестовая инфраструктура. Их нужно закрывать отдельными короткими проходами с собственными проверками.

## 1. Сводка

| Область | Текущее состояние | Риск | Приоритет | Решение |
| --- | --- | --- | --- | --- |
| UI бухгалтерии/СИЗ | База есть, но `ppeWizard.tsx` все еще крупный, сценарий выдачи/возврата требует перерисовки | Пользователь ошибается в выдаче, возврате, модели/марке, документе | P1 | Сначала UX `Бухгалтерия -> Выдача`, затем `Возврат/списание`, затем история |
| Mobile runtime/APK smoke | Outbox/background dependencies есть, но нет подтвержденного последнего APK update/runtime smoke | Offline/report/media могут работать в коде, но не быть подтверждены на устройстве | P1 | Отдельный APK gate: build, update поверх старого APK, offline/reconnect/media/auth |
| API hardening | `Program.cs` использует `UseAuthorization()`, но нет стандартного `AddAuthentication()/UseAuthentication()` | Auth идет через custom filter, сложнее middleware, diagnostics и policy tests | P1 | Ввести session-token authentication handler без изменения формата токена |
| Security policies | Permission checks есть через `RequirePermissionAttribute`, но это не полноценные ASP.NET policies | Нельзя централизованно проверять endpoint metadata и policy drift | P1 | Перевести permissions на policies, старые attributes оставить совместимыми |
| OpenAPI / contract drift | Runtime OpenAPI/Swagger в коде не найден, docs прямо фиксируют отсутствие | DTO backend/web/mobile могут расходиться незаметно | P2 | Добавить OpenAPI artifact и drift check в CI/gate |
| Импорт норм/номенклатуры | Есть employee/legacy import, но нет полноценного DOCX norm importer и отдельного Excel catalog importer | Excel может снова смешаться с нормами, ручной ввод норм будет ошибочным | P2 | DOCX norms importer отдельно, Excel catalog importer отдельно, потом mapping screen |
| E2E smoke tests | Много Playwright smoke, но большая часть route/mock; API contour gated env-флагом | Новые UI-изменения могут не ловиться, старые селекторы устаревают | P2 | Обновить smoke под новый UI и выделить обязательный minimal runtime pack |

## 2. UI бухгалтерии/СИЗ

### Наблюдения

| Файл | Наблюдение |
| --- | --- |
| `apps/web/src/features/inventory/ppe/ppeWizard.tsx` | Файл все еще около 74 KB. Компоненты уже вынесены, но главный wizard содержит ручные нормы, picker modal, line editor orchestration, localStorage, выбор моделей и сценарии выдачи. |
| `apps/web/src/features/inventory/ppe/IssueChecklistStep.tsx` | Шаг выдачи вынесен, но фактическая таблица/редактирование строк остается в wizard. |
| `apps/web/src/features/inventory/ppe/PpeIssueLineEditor.tsx` | Есть базовая карточка строки, но она пока только shell-wrapper для строк. |
| `apps/web/src/features/inventory/ppe/ppeWizard.tsx` | Ручные нормы и подсказки моделей сохраняются в `localStorage` (`MANUAL_NORMS_STORAGE_KEY`, `MODEL_SUGGESTIONS_STORAGE_KEY`). Это удобно для первого прохода, но не является общей серверной моделью. |
| `apps/web/src/features/inventory/ppe/usePpeRepositoryActions.ts` | Backend действия уже получают `brandModelArticle`, то есть основа для правильной печати есть. |

### Ошибки/риски

| № | Риск | Последствие | Как закрыть |
| --- | --- | --- | --- |
| 1 | Wizard остается центром слишком большого сценария | Любая правка выдачи рискует ломать печать, picker и preview | Вынести `PpeItemPickerModal`, `PpeIssueLineTable`, `ManualNormPanel`, `ModelSuggestionsPanel` |
| 2 | Ручные нормы и модели только в браузере | Другой пользователь их не увидит; очистка браузера удалит подсказки | P2 backend dictionaries: manual norms + brand/model suggestions |
| 3 | Выдача и возврат еще не оформлены как отдельные рабочие места | Пользователь не видит простой поток: сотрудник -> предметы -> действие | Перерисовать `Бухгалтерия -> Выдача` и `Возврат/списание` до следующей миграции |
| 4 | История есть на backend-уровне, но UX не стал главным рабочим журналом | Сложно понять кто, когда, что выдал/вернул/списал | Сделать историю отдельным экраном с фильтрами сотрудник/предмет/действие |

### Решение

Не начинать миграцию `PpeNormItem/PpeIssueItem` до финального UX первого рабочего места. Сначала стабилизировать интерфейс выдачи на текущих DTO, затем переносить данные в целевую модель.

## 3. Mobile runtime / APK smoke

### Наблюдения

| Файл | Наблюдение |
| --- | --- |
| `Мобильное приложение/package.json` | Есть `expo-background-task`, `expo-task-manager`, `expo-sqlite`, `expo-image-picker`, `expo-file-system`, `react-native-nfc-manager`. |
| `Мобильное приложение/app.config.js` | Background task plugin подключен; Android `versionCode` = 18, версия `0.1.17`; cleartext разрешен для пилотного LAN. |
| `Мобильное приложение/src/sync/backgroundSyncTask.ts` | Задача делает `initializeDatabase()` -> `recoverStaleSendingOutboxCommands()` -> `runForegroundSync()`. |
| `Мобильное приложение/scripts/build-apk.ps1` | Скрипт сборки APK есть. |

### Что не доказано

| Сценарий | Статус |
| --- | --- |
| Обновление поверх старого APK без потери SQLite/outbox | Не подтверждено последним audit evidence |
| Offline submit -> reconnect -> auto sync на реальном Android | Не подтверждено последним runtime smoke |
| App kill/reboot -> stale `sending` recovery | Не подтверждено на устройстве |
| Фото/видео: local -> upload -> point binding -> web result | Не подтверждено полным устройственным сценарием |
| 401/403 refresh failure: токены очищены, outbox сохранен | Требует runtime/API smoke |

### Решение

Это не задача "переписать mobile sync". Кодовая база уже содержит основу. Нужен отдельный release-gate:

1. Собрать APK.
2. Установить поверх старого APK.
3. Проверить сохранение SQLite/outbox.
4. Пройти обход offline.
5. Добавить фото и видео.
6. Нажать отправку offline.
7. Включить сеть.
8. Проверить web-результат.
9. Смоделировать 401.
10. Проверить, что локальные данные не удалены.

## 4. API hardening и security policies

### Наблюдения

| Файл | Наблюдение |
| --- | --- |
| `apps/api/Program.cs` | Есть `AddControllers()`, `AddProblemDetails()`, `AddCors()`, `UseCors()`, `UseAuthorization()`. Стандартные `AddAuthentication()` и `UseAuthentication()` не подключены. |
| `apps/api/Authorization/RequirePermissionAttribute.cs` | Авторизация работает через `IAuthorizationFilter`: вручную читает Bearer token, вызывает `IAuthSessionService.GetCurrentUser(token)` и проверяет `user.Permissions`. |
| `apps/api/Controllers/*` | Большинство API endpoint защищены `RequirePermission` / `RequireAnyPermission`. |
| `tests/Patrol360.Api.Tests/ApiSmokeTests.cs` | Есть unit/smoke проверки permission attributes. |

### Риск

Текущий подход рабочий, но это не стандартный ASP.NET Core auth pipeline. Из-за этого сложнее:

- централизованно делать challenge/forbid;
- подключать authorization policies;
- проверять endpoint metadata;
- строить OpenAPI security scheme;
- ловить пропущенные permissions structure-test-ами;
- добавлять correlation/security diagnostics.

### Решение

P1 security/API pass:

1. Добавить custom `AuthenticationHandler` поверх текущего session/access token.
2. Оставить формат токена и web/mobile protocol без изменений.
3. Подключить `AddAuthentication()` / `UseAuthentication()`.
4. Завести policies вида `Permission:inventory.ppe.manage`.
5. Сделать `RequirePermissionAttribute` совместимым wrapper-ом или заменить на policy attribute поэтапно.
6. Добавить structure/API test: каждый controller action либо имеет permission policy, либо явно allowlist.

## 5. Health readiness

### Наблюдения

Поиск по исходникам не нашел явной ASP.NET Core реализации `/health/ready` через `MapHealthChecks`, `MapGet` или `HealthController`. В документах и Docker-конфигурации endpoint используется, а web nginx содержит health для frontend/proxy. Это означает, что текущий runtime health нужно перепроверить отдельно: кто именно отвечает на `/health/ready` в текущем контуре и проверяет ли он БД.

### Риск

Если `/health/ready` отвечает `200` без PostgreSQL/migrations/storage checks, Docker может считать API готовым при неготовой БД или сломанном file storage.

### Решение

P1 runtime hardening:

| Endpoint | Правильное поведение |
| --- | --- |
| `/health/live` | Процесс жив, без тяжелых проверок |
| `/health/ready` | PostgreSQL connectivity, pending migrations, critical file storage path |
| `/health/dependencies` | Admin diagnostics: optional integrations, worker, external services |

## 6. OpenAPI / contract drift

### Наблюдения

| Источник | Наблюдение |
| --- | --- |
| Поиск по коду | `AddSwaggerGen`, `UseSwagger`, `AddEndpointsApiExplorer`, `OpenAPI` runtime artifact в API не найдены. |
| `docs/backend-implementation.md` | Прямо указано: OpenAPI generation and generated frontend DTOs are not wired yet. |
| `docs/security-api-audit-2026-06-23.md` | Указано: OpenAPI/Swagger runtime artifact и contract drift check не обнаружены. |
| `apps/web/src/api/contracts.ts` | Web использует ручные TypeScript DTO. |

### Риск

Backend DTO, web DTO и mobile DTO могут расходиться без падения gate. Это особенно рискованно для mobile sync и PPE/Inventory, где shape сложный.

### Решение

P2 API tooling:

1. Подключить OpenAPI в dev/runtime.
2. Добавить export `openapi.json` как build artifact.
3. Добавить drift check: backend contracts -> generated TS -> сравнение с committed generated output.
4. Поэтапно заменить ручные DTO в web/mobile, начиная с новых/изменяемых областей.

## 7. Импорт норм и номенклатуры

### Наблюдения

| Файл | Наблюдение |
| --- | --- |
| `apps/api/Controllers/InventoryController.cs` | Есть импорт сотрудников (`employees/import/preview`, `employees/import`). |
| `libs/infrastructure/Persistence/EfInventoryLegacyImportService.cs` | Есть legacy import inventory-related данных. |
| `libs/infrastructure/Persistence/EfInventoryCatalogQuery.cs` | `PositionNorms` все еще связаны с `ItemId`; это фазовая модель нормы через складскую позицию. |
| `libs/infrastructure/Persistence/Migrations/20260626100000_PpePositionNormPrintFields.cs` | Добавлены print fields для position norms, но это не полноценный `PpeNormItem`. |
| `apps/web/src/features/inventory/ppe/ppeWizard.tsx` | Ручные нормы и модели сохраняются локально, не как серверный справочник. |

### Что отсутствует

| Требование | Статус |
| --- | --- |
| DOCX importer норм электромонтеров | Не найден |
| Excel importer складской номенклатуры отдельно от норм | Частично есть legacy/catalog import, но не выделен новый сценарий "Excel = только склад" |
| Preview распознавания разделителей норм | Не найден |
| Экран сопоставления `норма -> складская позиция` | Не найден как отдельный рабочий экран |
| Серверный словарь марок/моделей | Не завершен как `PpeBrandModelDictionary` |

### Решение

Не смешивать с текущим UI pass. Правильный P2 порядок:

1. Спроектировать `PpeNormItem` как независимую норму.
2. Спроектировать `PpeIssueItem` как факт выдачи.
3. Спроектировать `PpeBrandModelDictionary`.
4. DOCX importer: нормы и разделители.
5. Excel importer: складская номенклатура.
6. Mapping screen: `норма -> складская позиция`.
7. Backfill текущих `position_norms` в новые сущности.

## 8. E2E smoke tests

### Наблюдения

| Файл/группа | Наблюдение |
| --- | --- |
| `apps/web/e2e/*` | Много Playwright smoke tests уже есть. |
| `apps/web/e2e/run-playwright.mjs` | По умолчанию выставляет mock mode. |
| `apps/web/e2e/emu-api-contour.spec.ts` | Реальный API contour есть, но запускается только при `PATROL360_E2E_API_MODE=true`. |
| `apps/web/e2e/obhod-api-contour.spec.ts` | Реальный API contour для обходов есть, тоже gated env-флагом. |
| Inventory e2e | Большая часть тестов route-мокает API и проверяет UI shell/flows, не реальную БД. |
| PPE e2e | Есть smoke для PPE wizard/print endpoints, но он опирается на текущие selectors и route mocks. |

### Риск

После перерисовки UI тесты могут:

- проходить в mock mode, но не ловить runtime API regressions;
- падать на старых CSS selectors;
- не проверять browser comments по `#results/#assign`;
- не покрывать новый `Бухгалтерия -> Выдача`, возврат/списание и историю.

### Решение

Разделить e2e на два набора:

| Набор | Назначение | Gate |
| --- | --- | --- |
| `mock-visual-smoke` | Быстро проверить основные экраны без API | PR/local quick |
| `api-contour-smoke` | Проверить реальные API flows в Docker/DB | Nightly/release |
| `inventory-ppe-runtime-smoke` | Выдача, печать, возврат, история | После PPE UI pass |
| `patrol-results-assign-smoke` | `#results/#assign` browser comments | После Patrol UI pass |

## 9. Рекомендуемый порядок закрытия

| Порядок | Проход | Почему так |
| --- | --- | --- |
| 1 | UX/design spec `Бухгалтерия -> Выдача` | Сначала зафиксировать сценарий, чтобы не переделывать UI дважды |
| 2 | Реализация `Бухгалтерия -> Выдача` на текущих DTO | Самый заметный пользовательский дефект |
| 3 | `Возврат/списание` + история СИЗ | Замыкает факт выдачи в движение предметов |
| 4 | Browser smoke inventory screens | Проверяет реальные пользовательские хвосты после UI |
| 5 | Mobile APK/runtime smoke | Закрывает главный production-risk мобильного приложения |
| 6 | API auth handler + policies + readiness | Закрывает security/API эксплуатационный слой |
| 7 | OpenAPI artifact + contract drift | После стабилизации shape текущих API |
| 8 | P2 PPE data model/import/mapping | Миграционный слой после стабилизации UI и печати |
| 9 | E2E refresh | Обновить selectors и разделить mock/API gates |

## 10. Acceptance

Остаточный P1/P2 блок можно считать закрытым, когда:

1. `Бухгалтерия -> Выдача` работает как отдельное понятное рабочее место.
2. Возврат/списание показывает только реально выданные предметы.
3. История показывает сотрудника, предмет, действие, дату и пользователя.
4. APK обновляется поверх старого приложения без потери SQLite/outbox.
5. Offline report с фото/видео доходит до web после восстановления сети.
6. API использует стандартный authentication handler и policies.
7. `/health/ready` проверяет PostgreSQL/migrations/storage.
8. OpenAPI artifact генерируется и drift check падает при рассинхроне DTO.
9. DOCX norms importer и Excel catalog importer не смешивают нормы и склад.
10. E2E разделены на quick mock smoke и release API-contour smoke.

