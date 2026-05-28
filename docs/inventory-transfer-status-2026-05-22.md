# Статус переноса Inventory в Patrol360 от 2026-05-22

## Итог

Перенос данных Inventory в локальную целевую БД Patrol360 выполнен после dry-run. Исходная БД Web-инвентаря не изменялась. Перед реальным импортом сделан backup целевой БД.

Сейчас в Patrol360 подготовлены и проверены основные Inventory-модули: Catalog, PPE, Custody, Operations и Reports. Видимый интерфейс на живом стенде показывает русские тексты без mojibake-маркеров.

## Контрольные файлы

| Файл | Назначение |
| --- | --- |
| `output/patrol360-before-inventory-import-20260522.dump` | Backup целевой PostgreSQL БД перед импортом |
| `output/inventory-migration-dry-run-20260522.json` | Dry-run импорта без бизнес-записи |
| `output/inventory-migration-import-20260522.json` | Отчет реального импорта |
| `output/inventory-migration-readiness-after-import-20260522.json` | Counts/metrics целевой БД после импорта |
| `output/custody-a25a34e6-print.pdf` | Проверочный PDF акта "Под запись" после импорта |
| `output/custody-a25a34e6-print.docx` | Проверочный DOCX акта "Под запись" после импорта |

## Результат импорта

| Метрика | Значение |
| --- | ---: |
| Таблиц просканировано | 14 |
| Строк прочитано | 2260 |
| Строк добавлено | 484 |
| Строк обновлено | 1775 |
| Строк пропущено | 1 |
| Статус | completed |

Пропущена одна строка `ppe_card_line_event`: orphan-событие без связанной строки СИЗ в исходной БД. Это допустимый пропуск и он не блокирует перенос.

## Counts после импорта

| Таблица | Строк |
| --- | ---: |
| `inventory.items` | 1347 |
| `inventory.categories` | 10 |
| `inventory.units` | 8 |
| `inventory.warehouses` | 1 |
| `inventory.ppe_cards` | 25 |
| `inventory.ppe_card_lines` | 33 |
| `inventory.ppe_card_line_events` | 80 |
| `inventory.custody_documents` | 11 |
| `inventory.custody_records` | 11 |
| `inventory.custody_record_events` | 31 |
| `inventory.stock_moves` | 91 |
| `inventory.system_log` | 419 |
| `inventory.legacy_import_runs` | 8 |

## Проверки после импорта

- `GET /api/v1/inventory/ppe/cards?page=1&pageSize=5` возвращает реальные карточки СИЗ с русскими ФИО.
- `GET /api/v1/inventory/custody/documents?page=1&pageSize=50` возвращает 11 актов.
- `GET /api/v1/inventory/custody/documents/a25a34e6-8b4f-4f8a-be4d-8f27e8b55187` возвращает detail payload с сотрудником, табельным, подразделением, строкой и историей.
- PDF/DOCX для акта `ПЗ-2026-0001` выгружены и имеют корректные сигнатуры: PDF `%PDF-1.4`, DOCX `PK`.
- `inventory-ppe-smoke.spec.ts`, `inventory-custody-smoke.spec.ts`, `inventory-catalog-smoke.spec.ts`, `inventory-operations-smoke.spec.ts`, `inventory-reports-smoke.spec.ts` проходят.

## Технический способ выполнения

Рабочий `patrol360-api` не использовался для dry-run импорта. Для импорта применялся временный контейнер `patrol360-api-import-dryrun` с отдельной переменной `INVENTORY_LEGACY_CONNECTION_STRING`. После импорта контейнер удален, временное подключение рабочего API к legacy Docker-сети отключено.

## Inventory.Catalog integration

- Экран `#/inventory-items` проверен на импортированных данных: `1347` позиций всего, `1324` активные, `23` скрытые.
- Видимый текст каталога без mojibake-маркеров.
- Таблица каталога закреплена: контролируемая минимальная ширина, переносы текста, отдельная ширина для остатков и действий.
- Добавлен smoke `apps/web/e2e/inventory-catalog-smoke.spec.ts` для журнала номенклатуры, KPI, категорий и строк каталога.

## Inventory.PPE integration

- Экран `#/inventory-ppe` проверен на импортированных данных: видно 5 карточек СИЗ на первой странице, ФИО читаются корректно.
- PPE-модуль вынесен в подмодули journal, wizard, drawer, print и repository-facing hooks.
- Выбор сотрудника заменен на searchable combobox.
- Категории и наборы подготовлены для удобного подбора.
- Print/PDF/DOCX flow закреплен на detail payload.
- `inventory-ppe-smoke.spec.ts` проходит.

## Inventory.Custody integration

- Экран `#/inventory-custody` проверен на импортированных данных: видно 11 актов, включая `ПЗ-2026-0001`.
- Custody-модуль вынесен в подмодули journal, composer, drawer, print и repository-facing actions.
- Добавлен dedicated options endpoint для сотрудников, позиций, складов, категорий и статусов.
- Detail, preview, PDF и DOCX используют общий набор данных акта.
- `inventory-custody-smoke.spec.ts` проходит.

## Inventory.Operations integration

- Экран `#/inventory-operations` проверен на импортированных данных: журнал операций отображает складские движения, видимая кодировка корректная, горизонтального overflow страницы на desktop не найдено.
- Добавлен dedicated endpoint `GET /api/v1/inventory/operations/options`: экран операций получает сотрудников, активную номенклатуру, настройки, склады и остатки одним доменным payload без зависимости от обрезанного первого листа `/items?pageSize=300`.
- `InventoryScreen.tsx` для `inventory-operations` переключен на `getOperationsOptions()`; модуль больше не теряет позиции при большой номенклатуре.
- Таблица операций закреплена: `table-layout: fixed`, контролируемая минимальная ширина, безопасные ширины колонок, ellipsis/overflow-wrap и внутренний горизонтальный scroll на узких экранах.
- Исправлен seeder ролей: `EnsureRolePermissionsAsync` теперь находит роль по seed `id` или по коду роли. Это закрывает дефект существующих БД, где роль `admin` имела другой `id` и не получала новые `inventory.*` права.
- Options endpoints для Operations, Custody и PPE теперь собирают все страницы через `LoadAllPages`, а не упираются в нормализованный максимум `pageSize=100`.
- Live endpoint `GET /api/v1/inventory/operations/options` после rebuild вернул `1324` активные позиции, `283` сотрудника, `25` складских остатков, типы `receipt, return, write_off, issue`.
- Добавлен smoke `apps/web/e2e/inventory-operations-smoke.spec.ts`: загрузка журнала, выбор позиции из options, проведение операции и POST payload `/api/v1/inventory/documents`.

## Inventory.Reports integration

- Экран `#/inventory-reports` проверен на живом стенде: 7 карточек отчетов, ошибок нет, mojibake-маркеров нет, горизонтального overflow страницы нет.
- Добавлен smoke `apps/web/e2e/inventory-reports-smoke.spec.ts`: список отчетов, поиск, видимость карточек, export action.
- Backend теперь скрывает отчет `system_log` для пользователей без `inventory.audit.view` и запрещает export `system_log` без этого права.
- Пагинация `GET /api/v1/inventory/reports` пересчитывает `total/pageCount` после фильтрации системного журнала по правам.
- Live export проверен:
  - `POST /api/v1/inventory/reports/stock/export?format=xlsx` возвращает ненулевой XLSX.
  - `POST /api/v1/inventory/reports/custody/export?format=pdf` возвращает ненулевой PDF.
- Исправлен релизный дефект PDF export отчета `custody`: EF/Npgsql падал на SQL-проекции с `DateTimeOffset`. Форматирование дат перенесено в in-memory projection после выборки.

## Inventory.History/Audit integration

- Экран `#/inventory-history` переведен на dedicated server-side query: `page`, `pageSize`, `query`, `entityType`, `action`, `actor`, `dateFrom`, `dateTo`.
- Экран `#/inventory-system-log` переведен на те же server-side filters и больше не фильтрует только первые загруженные строки.
- Оба экрана очищены от mojibake, получили debounced search, пагинацию, размер страницы, фильтры по сущности/действию/пользователю/датам и drawer детального просмотра.
- `InventoryCustodyScreen.tsx` переведен с dynamic import `inventoryRepository` на статический import; Vite warning по смешанному static/dynamic import исчез.
- Backend endpoints `GET /api/v1/inventory/history` и `GET /api/v1/inventory/system-log` аддитивно расширены audit-фильтрами без изменения DTO и response shape.
- Добавлена migration `20260522215900_InventorySystemLogAuditFilters` для индексов `ix_inventory_system_log_created_at`, `ix_inventory_system_log_action`, `ix_inventory_system_log_actor`.
- Live API smoke на импортированной БД: `history.total=427`, server filter по `export_job` вернул `8`, `system-log?action=created` вернул `8`.
- Live UI smoke: History и System Log открываются без API-ошибок, без mojibake-маркеров и без горизонтального overflow страницы.
- Добавлен smoke `apps/web/e2e/inventory-history-audit-smoke.spec.ts`: server filters, drawer, чистый текст и negative 403-сценарий без `inventory.audit.view`.

## Inventory.Employees/Users integration

- Экраны `#/inventory-employees` и `#/inventory-users` переведены на dedicated server-side query вместо загрузки первых 300 строк из родительского `InventoryScreen`.
- `GET /api/v1/inventory/employees` аддитивно поддерживает `page`, `pageSize`, `query`, `status`, `department`, `employeeGroup`.
- `GET /api/v1/inventory/users` аддитивно поддерживает `page`, `pageSize`, `query`, `status`, `role`.
- Оба экрана очищены от mojibake, получили debounced search, серверные фильтры, пагинацию, выбор размера страницы и controlled table overflow.
- Импорт сотрудников сохранен: preview/import dialog, результат импорта и архивирование сотрудника работают через существующие endpoints.
- Пользователи остаются интегрированными с текущим RBAC Patrol360: создание/изменение перенаправлены на существующее администрирование, экран Inventory поддерживает просмотр, фильтры и отключение.
- Добавлена migration `20260522220500_InventoryEmployeesUsersFilters` для индексов `ix_employees_department`, `ix_employees_employee_group`, `ix_site_users_display_name`.
- Live API smoke на импортированной БД: `employees.total=283`, поиск по реальному подразделению вернул `45` строк, `users.total=23`, фильтр по роли `admin` вернул `1` строку.
- Live UI smoke: Employees и Users открываются без API-ошибок, без mojibake-маркеров и без горизонтального overflow страницы.
- Добавлен smoke `apps/web/e2e/inventory-employees-users-smoke.spec.ts`: server filters, archive employee, disable user, clean text и negative 403-сценарий без `inventory.users.manage`.

## Итоговые проверки

- `dotnet build Patrol360.slnx` проходит без предупреждений и ошибок.
- `tools/Verify-TextEncoding.ps1` проходит: UTF-8 check passed for 387 text files.
- `npm run build` проходит.
- `tools/Test-All.ps1` проходит полностью: .NET build/tests, structure checks, UTF-8 check, npm audit, frontend build, vitest и structural tests.
- Vite warning по `inventoryRepository.ts` закрыт: `InventoryCustodyScreen.tsx` больше не использует dynamic import repository.

## Следующие шаги

1. Провести ручную приемку Inventory.PPE, Inventory.Custody, Inventory.Operations и Inventory.Reports с пользователем на целевом стенде.
2. Сверить counts в UI с `output/inventory-migration-readiness-after-import-20260522.json`.
3. Проверить 3-5 реальных отчетов: UI, XLSX, PDF.
4. После подтверждения parity переходить к следующему модулю переноса: Settings или Issue/Documents.


## Inventory.Settings integration

Дата: 2026-05-23.

Статус: подготовлен следующий доменный модуль Settings для переноса интерфейса и эксплуатации в Patrol360.

Сделано:
- `InventorySettingsScreen.tsx` переписан чистым UTF-8 без mojibake.
- Экран настроек сам загружает `GET /api/v1/inventory/settings` и больше не зависит от тяжелого preload в `InventoryScreen`.
- Активная номенклатура для редакторов норм и наборов догружается лениво только при открытии модалки.
- Сохранены текущие действия: справочники, склады, категории под запись, причины возврата/списания, справочники сотрудников, нормы СИЗ, наборы и диагностика базы.
- Добавлен smoke `inventory-settings-smoke.spec.ts`: проверяет чистый русский текст, lazy-load номенклатуры для модалки норм и вкладку состояния базы.

Проверки:
- `npm run build`
- `powershell -ExecutionPolicy Bypass -File .\tools\Verify-TextEncoding.ps1`
- `node .\e2e\run-playwright.mjs inventory-settings-smoke.spec.ts`
- `node .\e2e\run-playwright.mjs inventory-employees-users-smoke.spec.ts`

Следующий кандидат после Settings: Issue/Documents, чтобы довести выдачу и документы до такого же dedicated-flow.


## Inventory.Issue/Documents integration

Дата: 2026-05-23.

Статус: подготовлен модуль выдачи документов для isolated/dedicated flow.

Сделано:
- Добавлен endpoint `GET /api/v1/inventory/issues/options` для сотрудников, активной номенклатуры, настроек и остатков.
- `InventoryIssueScreen.tsx` переписан чистым UTF-8 и переведен на self-fetch: `/issues` + `/issues/options`.
- `InventoryScreen.tsx` больше не делает тяжелый preload `employees/items/settings/stock` для экрана выдачи.
- Сохранено создание выдачи через `POST /api/v1/inventory/documents` с типом `issue`.
- Добавлен smoke `inventory-issue-smoke.spec.ts`: проверяет dedicated options, отсутствие старых preload-запросов и создание issue-документа.

Проверки:
- `dotnet build Patrol360.slnx`
- `npm run build`
- `powershell -ExecutionPolicy Bypass -File .\\tools\\Verify-TextEncoding.ps1`
- `node .\\e2e\\run-playwright.mjs inventory-issue-smoke.spec.ts`

Следующий кандидат после Issue/Documents: Operations, чтобы привести поступления, возвраты и списания к такому же isolated options/detail flow.


## Inventory.PPE stabilization

Дата: 2026-05-27.

Статус: модуль СИЗ доведен до полноценного dedicated-flow в Patrol360 без клиентской фильтрации первых 100 карточек.

Сделано:
- `GET /api/v1/inventory/ppe/cards` расширен серверными фильтрами: `department`, `position`, `item`, `cardNo`, `dateFrom`, `dateTo`, `sort`, `direction`, `includeLines`.
- Список СИЗ больше не делает `Include(card => card.Lines)` для журнала; строки догружаются через detail endpoint.
- Ответ журнала возвращает `summary` и `filteredSummary`, чтобы KPI считались по серверному набору данных.
- `InventoryPpeScreen.tsx` переведен на self-fetch, debounce поиска, серверную пагинацию, сортировку и фильтры.
- Открытие карточки больше не падает, если пользователю недоступна audit history: detail открывается отдельно, история догружается best-effort.
- Редактирование карточки обновляет существующие строки и добавляет новые через repository actions.
- PPE smoke усилен: wizard, поиск сотрудника, наборы, detail preview и DOCX endpoint.
- Очищены оставшиеся mojibake-литералы в backend/test коде, которые могли отдавать старую кодировку.
- Исправлен release-gate по окончаниям строк через `dotnet format`.

Проверки:
- `powershell -ExecutionPolicy Bypass -File .\tools\Test-All.ps1`
- `npx playwright test --config playwright.config.ts inventory-ppe-smoke.spec.ts inventory-ppe-migration-smoke.spec.ts`

Ограничения:
- Smoke по PDF/DOCX проверяет endpoint flow через mock/download, но финальную приемку реальных файлов нужно выполнить на стенде с импортированной рабочей БД.
- Полное удаление существующих строк СИЗ из карточки не добавлялось: текущий безопасный этап обновляет существующие строки и добавляет новые.

Дополнение от 2026-05-27:
- Повторно проверены PPE-файлы на mojibake; очищены строки интерфейса в `InventoryPpeScreen.tsx`, `ppeWizard.tsx`, `usePpeRepositoryActions.ts`.
- `openCard` разделен на обязательную загрузку detail и best-effort загрузку history, поэтому отсутствие audit-доступа не ломает просмотр карточки СИЗ.
- `saveWizard` теперь обновляет саму карточку через `PUT /ppe/cards/{id}`, обновляет существующие строки через `PUT /ppe/cards/{id}/lines/{lineId}` и добавляет новые строки через `POST`.
- Для новых строк статус выдачи проводится через lifecycle endpoint, чтобы складские движения создавались корректно.
- Для уже выданных строк добавлен backend guard: нельзя менять позицию, склад или количество без возврата строки.
- В мастере СИЗ склад и количество у уже выданной строки заблокированы; удаление сохраненной строки из UI не имитируется, пока нет отдельного безопасного server-side действия.

Проверки дополнения:
- `dotnet build Patrol360.slnx`
- `npm run typecheck`
- `npx playwright test --config playwright.config.ts inventory-ppe-smoke.spec.ts inventory-ppe-migration-smoke.spec.ts`
- `powershell -ExecutionPolicy Bypass -File .\tools\Test-All.ps1`

Дополнение 2 от 2026-05-27:
- Добавлен dedicated endpoint `PATCH /api/v1/inventory/ppe/cards/{id}/lines/{lineId}/archive`.
- Архивация строки СИЗ не удаляет данные физически: строка переводится в статус `archived`, пишется событие строки и system log.
- Выданную строку нельзя архивировать напрямую; сначала требуется возврат или списание, чтобы не нарушить складские движения.
- Архивные строки исключены из detail карточки, счетчиков строк, `filteredSummary`, печати/PDF/DOCX и PPE report.
- В drawer карточки СИЗ добавлена кнопка `Архив` для строки; для выданной строки кнопка заблокирована с подсказкой.

Проверки дополнения 2:
- `dotnet build Patrol360.slnx`
- `npm run typecheck`
- `npx playwright test --config playwright.config.ts inventory-ppe-smoke.spec.ts inventory-ppe-migration-smoke.spec.ts`
- `powershell -ExecutionPolicy Bypass -File .\tools\Test-All.ps1`

Дополнение 3 от 2026-05-27:
- Lifecycle строк СИЗ дополнительно закрыт от некорректных переходов статусов: после `issued` разрешены только возврат, списание или утрата; финальные статусы нельзя переоткрывать через generic status endpoint.
- Редактирование существующей строки теперь блокирует изменение позиции, склада и количества для любой строки, которая уже участвовала в жизненном цикле выдачи, а не только для статуса `issued`.
- Мастер СИЗ блокирует склад, количество и статус у сохраненных строк с lifecycle-статусом, чтобы UI не предлагал действие, которое backend справедливо отклонит.
- PPE smoke прогнан через внешний preview-server flow, потому что прямой `npx playwright test` в этой среде проходил тесты, но зависал на остановке встроенного webServer.
- Полный `Test-All.ps1` пройден после разрешенного сетевого `dotnet restore`; предыдущая попытка была заблокирована sandbox-доступом к `nuget.org`, а не ошибкой кода.

Проверки дополнения 3:
- `npm run typecheck`
- `npm run build`
- `npx playwright test --config playwright.config.ts inventory-ppe-smoke.spec.ts inventory-ppe-migration-smoke.spec.ts` через external preview
- `powershell -ExecutionPolicy Bypass -File .\tools\Test-All.ps1`
