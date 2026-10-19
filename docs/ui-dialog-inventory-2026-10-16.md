# Инвентаризация окон интерфейса — 17.10.2026

Автоматический перечень текущих исходников, дополненный планом ручной проверки. Наличие общей оболочки само по себе не доказывает защиту черновика и pending: это проверяется отдельно для каждого сценария. Разметка без role могла не попасть в начальный автоматический список: в частности, прежние окна выдачи под запись и добавления предмета. Теперь они используют общую оболочку и включены в список.

| Файл | Механизм в JSX | Строки |
| --- | --- | --- |
| `apps/web/src/app/shell/MobileSearch.tsx` | ModalShell × 1 | 12 |
| `apps/web/src/app/shell/UserAccountPanel.tsx` | ModalShell × 2 | 26, 55 |
| `apps/web/src/features/emu/EmuDashboardScreen.tsx` | ModalShell × 1 | 527 |
| `apps/web/src/features/emu/history/EmuHistoryFilters.tsx` | DateRangePicker × 1 | 118 |
| `apps/web/src/features/emu/history/EmuWorkHistoryWorkspace.tsx` | ModalShell × 1 | 940 |
| `apps/web/src/features/emu/shift-reports/components/EmployeeDirectoryPopover.tsx` | ModalShell × 1 | 185 |
| `apps/web/src/features/emu/shift-reports/components/ShiftReportDateRangePicker.tsx` | DateRangePicker × 1 | 4 |
| `apps/web/src/features/emu/shift-reports/components/ShiftReportEntryScreen.tsx` | ModalShell × 2 | 579, 581 |
| `apps/web/src/features/emu/shift-reports/components/ShiftReportReminder.tsx` | ModalShell × 1 | 26 |
| `apps/web/src/features/emu/work-accounting/components/ModalFrame.tsx` | ModalShell × 1 | 26 |
| `apps/web/src/features/emu/work-accounting/modals/CatalogsModal.tsx` | ModalFrame × 1 | 37 |
| `apps/web/src/features/emu/work-accounting/modals/CreateEditWorkModals.tsx` | ModalFrame × 2 | 127, 261 |
| `apps/web/src/features/emu/work-accounting/modals/EmployeeParticipationModals.tsx` | ModalFrame × 3 | 51, 106, 143 |
| `apps/web/src/features/emu/work-accounting/modals/FavoritesModal.tsx` | ModalFrame × 2 | 42, 71 |
| `apps/web/src/features/emu/work-accounting/modals/PlanBoardModal.tsx` | ModalFrame × 1 | 59 |
| `apps/web/src/features/emu/work-accounting/modals/WorkDetailsModal.tsx` | ModalFrame × 1 | 26 |
| `apps/web/src/features/emu/work-accounting/modals/WorkLifecycleModals.tsx` | ModalFrame × 5 | 27, 95, 150, 204, 227 |
| `apps/web/src/features/emu/work-accounting/plan/PlanTaskDialogs.tsx` | ModalFrame × 3 | 18, 35, 47 |
| `apps/web/src/features/emu/work-accounting/plan/PlanTaskEditor.tsx` | ModalFrame × 1 | 41 |
| `apps/web/src/features/emu/work-accounting/side/DecisionPanels.tsx` | ModalFrame × 1 | 124 |
| `apps/web/src/features/emu/work-accounting/side/ShiftPanels.tsx` | ModalFrame × 1 | 174 |
| `apps/web/src/features/inventory/custody/CustodyActionDialog.tsx` | ModalShell × 1 | 26 |
| `apps/web/src/features/inventory/custody/custodyDrawer.tsx` | ModalShell × 1 | 52 |
| `apps/web/src/features/inventory/custody/CustodyIssueDialog.tsx` | ModalShell × 1 | 38 |
| `apps/web/src/features/inventory/custody/CustodyItemDialog.tsx` | ModalShell × 1 | 22 |
| `apps/web/src/features/inventory/employees/EmployeeFormDialog.tsx` | ModalShell × 1 | 24 |
| `apps/web/src/features/inventory/employees/EmployeeImportDialogs.tsx` | ModalShell × 3 | 21, 42, 52 |
| `apps/web/src/features/inventory/employees/EmployeePpeHistoryDialog.tsx` | ModalShell × 1 | 6 |
| `apps/web/src/features/inventory/items/ItemFormDialog.tsx` | ModalShell × 1 | 50 |
| `apps/web/src/features/inventory/items/ItemReadDialogs.tsx` | ModalShell × 2 | 20, 66 |
| `apps/web/src/features/inventory/ppe/DocumentActions.tsx` | ModalShell × 1 | 24 |
| `apps/web/src/features/inventory/ppe/DocumentConfirmation.tsx` | ModalShell × 1 | 11 |
| `apps/web/src/features/inventory/ppe/DocumentPrintDialog.tsx` | ModalShell × 1 | 9 |
| `apps/web/src/features/inventory/ppe/journal/JournalDocumentModal.tsx` | ModalShell × 1 | 13 |
| `apps/web/src/features/inventory/ppe/JournalPeriodPicker.tsx` | ModalShell × 1 | 21 |
| `apps/web/src/features/inventory/ppe/KitLineActions.tsx` | ModalShell × 1 | 23 |
| `apps/web/src/features/inventory/ppe/KitPicker.tsx` | ModalShell × 1 | 34 |
| `apps/web/src/features/inventory/ppe/KitTemplates.tsx` | ModalShell × 2 | 85, 102 |
| `apps/web/src/features/inventory/ppe/LegacyPrintFields.tsx` | ModalShell × 1 | 17 |
| `apps/web/src/features/inventory/ppe/LegacyPrintPreview.tsx` | ModalShell × 1 | 25 |
| `apps/web/src/features/inventory/ppe/LegacyTemplateDialog.tsx` | ModalShell × 1 | 37 |
| `apps/web/src/features/inventory/ppe/NormChangeDialog.tsx` | DocumentConfirmation × 1 | 5 |
| `apps/web/src/features/inventory/ppe/norms/NormCatalogSelector.tsx` | ModalShell × 1 | 28 |
| `apps/web/src/features/inventory/ppe/norms/NormEditorDialog.tsx` | ModalShell × 1 | 20 |
| `apps/web/src/features/inventory/ppe/PpeHistoryEventDialog.tsx` | ModalShell × 1 | 10 |
| `apps/web/src/features/inventory/ppe/PpeIssueJournal.tsx` | ModalShell × 1 | 98 |
| `apps/web/src/features/inventory/ppe/PpeLineActionModal.tsx` | ModalShell × 1 | 40 |
| `apps/web/src/features/inventory/settings/SettingsModals.tsx` | ModalShell × 1 | 406 |
| `apps/web/src/features/mobileAccounts/components/AccountDialogHost.tsx` | dialog × 1 | 9 |
| `apps/web/src/features/mobileAccounts/components/AccountEditConfirmation.tsx` | ModalShell × 1 | 8 |
| `apps/web/src/features/mobileAccounts/components/MobileAccountDetail.tsx` | ModalShell × 1 | 39 |
| `apps/web/src/features/mobileAccounts/components/MobileAccountEditPanel.tsx` | AccountEditConfirmation × 1 | 259 |
| `apps/web/src/features/mobileAccounts/components/TemporaryPasswordPanel.tsx` | region (немодальная панель) × 1 | 59 |
| `apps/web/src/features/patrol/assignments/AssignmentCancellationDialog.tsx` | ModalShell × 1 | 47 |
| `apps/web/src/features/patrol/assignments/AssignmentDraftPreview.tsx` | ModalShell × 1 | 5 |
| `apps/web/src/features/patrol/assignments/AssignmentDraftRecoveryEditor.tsx` | ModalShell × 1 | 31 |
| `apps/web/src/features/patrol/assignments/AssignmentEmployeePickerModal.tsx` | ModalShell × 1 | 39 |
| `apps/web/src/features/patrol/assignments/AssignmentRequestModal.tsx` | ModalShell × 1 | 69 |
| `apps/web/src/features/patrol/assignments/CompleteAssignmentModal.tsx` | ModalShell × 1 | 130 |
| `apps/web/src/features/patrol/assignments/LegacyDraftRecoveryModal.tsx` | ModalShell × 1 | 21 |
| `apps/web/src/features/patrol/assignments/ShiftSettingsModal.tsx` | ModalShell × 1 | 28 |
| `apps/web/src/features/patrol/AssignmentScreen.tsx` | ModalShell × 1 | 719 |
| `apps/web/src/features/patrol/components/employees/EmployeeFormModal.tsx` | ModalShell × 1 | 90 |
| `apps/web/src/features/patrol/components/employees/EmployeeMobileAccessPanel.tsx` | ModalShell × 1 | 23 |
| `apps/web/src/features/patrol/components/employees/EmployeeProfileDrawer.tsx` | ModalShell × 1 | 101 |
| `apps/web/src/features/patrol/components/employees/PatrolEmployeePickerModal.tsx` | ModalShell × 1 | 71 |
| `apps/web/src/features/patrol/components/requests/RequestCreateModal.tsx` | ModalShell × 1 | 119 |
| `apps/web/src/features/patrol/components/requests/RequestModals.tsx` | ModalShell × 1 | 46 |
| `apps/web/src/features/patrol/components/requests/RequestViewModal.tsx` | ModalShell × 1 | 23 |
| `apps/web/src/features/patrol/components/routes/RouteCreateModal.tsx` | ModalShell × 1 | 174 |
| `apps/web/src/features/patrol/components/routes/RouteEditModal.tsx` | ModalShell × 1 | 41 |
| `apps/web/src/features/patrol/components/routes/RoutePointDrawer.tsx` | ModalShell × 1 | 66 |
| `apps/web/src/features/patrol/components/schedule/ScheduleEditPanel.tsx` | ModalShell × 1 | 298 |
| `apps/web/src/features/patrol/results/PatrolResultDetails.tsx` | ModalShell × 1 | 75 |
| `apps/web/src/features/patrol/results/ResultMediaViewer.tsx` | ModalShell × 1 | 95 |
| `apps/web/src/features/perco/percoScreenSupport.tsx` | ModalShell × 2 | 208, 228 |
| `apps/web/src/features/users/components/SiteUserFormPanel.tsx` | ModalShell × 1 | 114 |
| `apps/web/src/shared/navigation/usePageLeaveGuard.tsx` | ModalShell × 1 | 43 |
| `apps/web/src/shared/ui/AnchoredPopover.tsx` | dialog × 1 | 83 |
| `apps/web/src/shared/ui/DateRangePicker.tsx` | AnchoredPopover × 1 | 70 |
| `apps/web/src/shared/ui/ModalShell.tsx` | dialog × 1 | 51 |
| `apps/web/src/shared/ui/useDialogCloseGuard.tsx` | ModalShell × 1 | 16 |

Всего: 82 файлов механизмов и обёрток, включая немодальную панель пароля. Это не число пользовательских окон. Перечень актуализирован 17.10.2026 через AST TypeScript; текстовые поиски `[role="dialog"]` не считаются разметкой. Подтверждение аккаунта теперь использует общую оболочку, добавлены восстановление и чтение черновиков. [Исходная выборка](../output/playwright/ui-unification-2026-10-16/dialog-source-inventory.json).

## Проверено на текущем этапе

- Календари истории/отчётов ЭМУ и немодальная панель пароля: шесть ширин, высота 420 px, настоящий zoom 200%, Escape/Tab/стрелки, переход ПК→телефон, отказ/pending копирования и поздний ответ. Общая оболочка модальных форм остаётся отдельным механизмом.

- Аккаунты, пользователи, маршруты/точки и настройки учёта: выполненные сценарии перечислены в `ui-unification-progress-2026-10-16.md`.
- Сотрудник и создание заявки/плана: защита ввода, pending, поздние ответы и доступные действия.
- Назначения: создание/завершение/отмена, общий диалог отмены с расписанием, избранные сотрудники, смены, подготовка фотографий. Старые `assignmentOverlays`/`AssignmentPanels` содержат обёртки/экспорты, формы выделены по ответственности.
- Учёт сотрудников: редактор, архивирование, предпросмотр/результат импорта, общая история СИЗ для двух разделов. Пагинация 120 строк импорта, отказы записи, повтор и возврат фокуса проверены отдельно.

- Под запись: выдача, добавление предмета, передача/возврат/списание/архивирование и общий просмотр акта. Проверены dirty/pending, ошибки, поздние ответы, сохранение ввода при обновлении и шесть ширин. История СИЗ использует общий просмотр события.
- Подбор СИЗ, шаблоны и ручной контроль: вложенные окна, сохранение выбора/цены, пагинация, pending/ошибки/поздние ответы, явное переименование и серверная проверка шаблона; шесть ширин, уменьшенная высота и реальный zoom 200%.
- Действия конструктора СИЗ: новая выдача, отмена/перенос, подтверждение, защита перехода к журналу и смены сотрудника, непрерывный ввод при автосохранении. Печатный просмотр обеих форм проверен на 54 позиции; исправлено растягивание таблиц за границы листа. Общий фокус восстановлен при отключении кнопок в pending.
- Смена нормы СИЗ: атомарное применение состава, перечень 49 удаляемых позиций, сохранение ввода при отмене/ошибке, независимые повторные загрузки и поздние ответы. Проверены шесть ширин, высота 420 px и настоящий zoom 200%.
- Фактическая выдача СИЗ: возврат, списание, неисправность, dirty/pending и поздние ответы. Успешная запись не повторяется при сбое обновления карточки; таблица сохраняется, следующие операции ожидают актуальной версии. Шесть ширин, высота 420 px, настоящий zoom 200%.
- Подготовка норм СИЗ: область применения, правила строки, утверждение соответствия, явная смена основного товара. Выбор редактора хранится вне фильтруемых строк, данные и версия фиксируются при открытии. Привязка наследованных шаблонов сохраняет ввод и защищает смену нормы. Каталог показывает все страницы, сохраняет поиск при ошибке записи; утверждение товаров выполняется отдельно.

- Прежняя карточка СИЗ: серверный поиск по 50 сотрудников, восстановление по ID и изоляция выбора по пользователю. Предпросмотр/локальные правки используют общие окна; переключение форм и фоновые данные сохраняют правки, все 54 строки доступны на шести ширинах.

- PDF конструктора: отдельное ожидание/ошибка/повтор, сохранение предыдущего файла, нативный Chromium и скачивание; поздние ответы принадлежат версии/составу/сеансу, подтверждённый снимок сотрудника не меняется.

- Проверены 17.10.2026: уход конструктора через общую навигацию/Back/Forward/ссылки/выход, несохранённый ввод и прокрутка 54 строк; отказ обновления после принятой публикации, неизвестный результат и восстановление чтением без повторного POST. Подтверждённые документы не изменялись.

- Проверены 17.10.2026: 12 редакторов работ/смен/решений ЭМУ, сохранение ввода, pending, версии и поздние ответы. Подтверждение игнорирования PERCo сохраняется до результата; повторное чтение после принятой записи не повторяет действие. Оформление модалок PERCo очищено от прежних конфликтующих правил.
- Проверены 17.10.2026: справочники и избранное ЭМУ, четыре независимых черновика, сохранение/отказ/повтор, изоляция старого владельца, вложенное подтверждение и возврат фокуса. Шесть ширин, высота 420 px, настоящий zoom 200%; одна основная область прокрутки и доступные действия.

- Проверены 17.10.2026: доска задач/недельный план ЭМУ и шесть дочерних сценариев — создание, изменение, просмотр, отклонение, перенос и согласование недели. Сохранение открытой версии, независимость ввода от обновления списка, полный выбор сотрудников, dirty/pending/ошибки/повтор, шесть ширин и низкий экран.

Галерея результатов дополнительно проверена 17.10.2026 на шести ширинах и настоящем zoom 200%: исходные JPEG до 20,7 МП, видео с воспроизведением/перемоткой, 30 точек и комментарий из 65 строк. Проверены отмена загрузки, декодирование/повтор, скачивание готового Blob, сенсорные жесты, остановка фонового видео и возврат фокуса. Физические мобильные браузеры этим не проверены.

Номенклатура проверена 17.10.2026: общая оболочка, вложенный редактор с возвратом к карточке, доступное скрытие на ПК, pending/dirty/ошибки и повтор, замена пользователя, сохранение строк при обновлении, серверный поиск с задержкой 300 мс. Шесть ширин, высота 420 px и настоящий zoom 200%. Прежний `PpeModalShell` больше не используется и удалён; проверки фокуса перенесены на общую оболочку. Число файлов в перечне остаётся 70.

## Следующие проверки

- Остаётся окончательная сверка остальных окон по матрице.
- Календари ЭМУ и панель временного пароля проверены отдельным этапом; см. актуальный отчёт. Подтверждение изменений аккаунта и черновики проверены следующим этапом.
- Восстановление старых черновиков реализовано: явное действие администратора, ручной выбор текущих сотрудника/маршрута, новая локальная копия, исходный файл сохраняется.
- Всплывающие календари и одноразовый пароль имеют иной сценарий; не превращать их механически в полноэкранные диалоги.
