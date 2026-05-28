# Patrol360 MVP-ready implementation status

Дата обновления: 2026-05-19

## Выполнено

1. Auth API: добавлены `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`.
2. DB-схема RBAC: добавлены пользователи сайта, роли, разрешения, связи ролей и сессии.
3. Backend permission guard: write endpoints закрыты через `RequirePermissionAttribute`.
4. Login UI: добавлена страница входа, хранение Bearer token, `/auth/me`, logout и session expired flow.
5. Mobile Accounts baseline: edit/block/unblock/detach/sessions/security-events работают через API/workspace hook.
6. Site Users API: добавлены list/create/update/block/unblock/reset password и роли.
7. Site Users UI: экран переведен на API repository/hook, временный пароль показывается только как backend result.
8. Permission-driven UI: основной action header, Mobile Accounts и Site Users учитывают permissions текущего пользователя.
9. Тесты permission filter: добавлены проверки 401/403/allowed для backend authorization guard.
10. Permission-driven UI расширен на Employees, Routes, Schedule, Assignments и Results: ключевые write-действия отключаются без нужного permission.
11. Results end-to-end baseline: добавлены DB-таблицы `patrol_results`, `patrol_result_issues`, `patrol_result_attachments`, API `GET /api/v1/results`, `GET /api/v1/results/{id}` и frontend `useResultsWorkspace`.
12. Заявки из результатов: `sourceResultId` сохраняется в `patrol_requests` и передается через frontend API repository.
13. Assignments end-to-end baseline: добавлены contracts `CreateAssignmentDto` и `AssignmentCommandResultDto`, API `GET/POST /api/v1/assignments`, команды `start/cancel/complete`, `RequirePermission("assignments.write")`, backend validation через ProblemDetails и мягкие повторные команды `changed=false`.
14. Assignments UI: добавлены `assignmentsRepository`, `useAssignmentsWorkspace`, API-backed список назначений, выбор существующей заявки, field-level ошибки в drawer, row-level saving state и refresh dashboard после mutation.
15. Assignments DB integration: добавлен сценарий `request -> assignment create -> duplicate validation -> start -> complete -> reload`, плюс свободная seed-заявка для ручного назначения.

## В работе

1. Перенести оставшиеся feature mutation workflows из `App.tsx` в feature hooks.
2. Расширить DB integration scenarios для Schedule и Core MVP flows.
3. Добавить отдельные UI-тесты на permission-driven rendering для всех модулей.

## Далее по ТЗ

1. OpenAPI generation и frontend DTO codegen.
2. Contract sync check в CI.
3. Schedule rules/exceptions/conflicts через DB/API.
4. Полный E2E MVP сценарий: login -> dashboard -> request -> assignment -> result/detail.
