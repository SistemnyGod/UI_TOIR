# ЭМУ: навигация и связи модуля

## Назначение
Модуль `ЭМУ` ведет учет работ Энерго-Механического отдела: карточки работ, сотрудники, паузы, завершения, плановые задачи, история и анализ времени.

## Где находится
- Sidebar: `ЭМУ`.
- Основные маршруты: `/#emu-dashboard`, `/#emu-work-accounting`, `/#emu-completed-work-history`.
- Основные frontend-файлы: `EmuScreen.tsx`, `EmuDashboardScreen.tsx`, `EmuWorkAccountingScreen.tsx`, `EmuCompletedWorkHistoryScreen.tsx`, `emu.css`.

## Вкладки и действия
- `Дашборд`: активные работы, паузы, завершения, события, план недели, блоки внимания.
- `Учет работ`: создание карточки, назначение сотрудников, пауза, продолжение, завершение, редактирование, удаление, справочники и избранные сотрудники.
- `История выполненных работ`: фильтры, сводка по сотрудникам/участкам, таймлайн, аудит, персональная история сотрудника.

## Backend и данные
- API namespace: `/api/v1/emu`.
- Контроллер: `EmuController`.
- Сервисы: `IEmuCatalogService`, `IEmuWorkService`, `IEmuShiftService`, `IEmuPlanService`.
- Основные таблицы: `emu_work_sessions`, `emu_work_session_employees`, `emu_work_participation_intervals`, `emu_work_sections`, `emu_employee_shifts`, `emu_work_plan_tasks`, `emu_work_audit_events`, `employee_presence_intervals`.

## Права доступа
- Просмотр: `emu.view`, `emu.dashboard.view`, `emu.work-accounting.view`, `emu.history.view`.
- Работы: `emu.work.create`, `emu.work.update`, `emu.work.pause`, `emu.work.complete`, `emu.work.delete`, `emu.completed.delete`.
- Справочники и план: `emu.directories.manage`, `emu.favorite-employees.manage`, `emu.plan.view`, `emu.plan.manage`, `emu.plan.approve`, `emu.plan.override-approval`, `emu.plan.recurrence.manage`.
- Отчеты и аудит: `emu.reports.view`, `emu.reports.export`, `emu.audit.view`, `emu.time.override`, `emu.shift.adjust`, `emu.decision.resolve`.

## Scope-доступ по участкам
- Для операторов учета работ используется scope `emu_section`.
- Пользователь с `emu_section` видит только работы, историю, план и дашборд выбранных участков.
- Администратор и руководитель видят все участки.

## Связи с другими модулями
- `PERCo-Web`: факты присутствия и интервалы на территории участвуют в расчете смен и простоя.
- `Бухгалтерия/Inventory`: общий справочник сотрудников, должности и подразделения.
- `Управление пользователями`: права и ограничения по участкам.

## Приемочные проверки
- Оператор участка не видит чужие участки.
- Завершенные карточки уходят в историю.
- История сотрудника показывает работу, паузы, простой, смены и ручные корректировки.
