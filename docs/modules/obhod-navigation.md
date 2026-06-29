# Обход: навигация и связи модуля

## Назначение
Модуль `Обход` управляет маршрутами обходов территории, заявками, назначениями сотрудников, результатами сканирования точек и мобильными аккаунтами.

## Где находится
- Sidebar: `Обход`.
- Основные маршруты: `/#dashboard`, `/#results`, `/#assign`, `/#employees`, `/#schedule`, `/#accounts`, `/#routes`.
- Основные frontend-файлы: `DashboardScreen.tsx`, `ResultsScreen.tsx`, `AssignmentScreen.tsx`, `EmployeesScreen.tsx`, `ScheduleScreen.tsx`, `MobileAccountsScreen.tsx`, `RoutesScreen.tsx`.

## Вкладки и действия
- `Дашборд`: оперативная сводка по обходам, активные назначения, последние результаты, качество данных.
- `Результаты обходов`: журнал результатов, детали заявки, точки обхода, фото, замечания, создание заявки по результату.
- `Назначения`: выбор сотрудника, маршрута, смены и создание заявки/назначения.
- `Сотрудники`: справочник сотрудников обхода и связь с мобильными аккаунтами.
- `Плановый обход`: календарь и планирование обходов.
- `Мобильные аккаунты`: аккаунты мобильного приложения и привязки.
- `Маршруты и точки`: маршруты, точки, NFC/метки, история изменений маршрута.

## Backend и данные
- API namespace: `/api/v1`.
- Контроллеры: `DashboardController`, `RoutesController`, `EmployeesController`, `PatrolRequestsController`, `AssignmentsController`, `ResultsController`, `MobileAccountsController`.
- Основные таблицы: `routes`, `route_points`, `employees`, `patrol_requests`, `assignments`, `patrol_results`, `patrol_result_issues`, `patrol_result_attachments`, `mobile_accounts`.

## Права доступа
- Просмотр: `dashboard.read`, `routes.read`, `employees.read`, `requests.read`, `assignments.read`, `results.read`.
- Действия: `routes.write`, `employees.write`, `requests.write`, `assignments.write`, `schedule.write`, `mobile_accounts.write`.
- Администрирование пользователей: `site_users.write`.

## Связи с другими модулями
- `PERCo-Web`: дает факты присутствия сотрудников на территории, но не заменяет результаты обходов.
- `Управление пользователями`: определяет права на чтение и действия.
- `Бухгалтерия/Inventory`: использует общий справочник сотрудников как источник персональных данных.

## Приемочные проверки
- Без прав чтения API возвращает `401/403`.
- Заявка может быть назначена сотруднику.
- Завершение назначения создает результат обхода.
- В результате доступны точки, время сканирования, комментарии, фото и замечания.
