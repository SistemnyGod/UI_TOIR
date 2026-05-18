# Стабилизация проекта

## Цель

Стабилизация фиксирует минимальные инженерные правила, которые должны выполняться перед развитием логики, API-интеграции и persistence. Сейчас проект находится на этапе UI + .NET skeleton, поэтому главный риск — разъезд контрактов, неявное состояние во фронтенде и отсутствие единого проверочного контура.

## Текущий baseline

- Backend собирается через `Patrol360.slnx`.
- Frontend живет в `apps/web` и использует React + TypeScript + Vite.
- UI пока работает без backend-данных: экраны показывают пустые состояния и локальные UI-черновики.
- Hash-навигация, toast-уведомления и создание UI-черновика заявки вынесены из `App.tsx` в отдельные модули.
- Shell интерфейса вынесен из `App.tsx` в `Sidebar`, `Topbar`, `WorkspaceHeader` и `ScreenRouter`.
- Frontend имеет typed data-source слой в `apps/web/src/api`: mock-клиент, API-клиент и маппинг DTO в UI-модель.
- Режимы вкладок и фильтров фронтенда централизованы в `apps/web/src/types.ts`.

## Обязательные проверки перед продолжением

Backend:

```powershell
dotnet build .\Patrol360.slnx
```

Если локально уже запущен `Patrol360.Api` или открыт Visual Studio debug-session, обычная Debug-сборка может упереться в lock файлов `bin/Debug`. В этом случае нужно остановить запущенный API/отладку и повторить сборку, либо выполнять проверочную сборку в отдельный artifacts-каталог:

```powershell
dotnet build .\Patrol360.slnx --artifacts-path .\output\stabilization-dotnet-build
```

Frontend:

```powershell
cd .\apps\web
npm run typecheck
npm run build
```

Для быстрого локального подтверждения фронтенда можно использовать:

```powershell
cd .\apps\web
npm run verify
```

Кодировка текстовых файлов:

```powershell
.\tools\Verify-TextEncoding.ps1
```

## Правила стабилизации frontend

- Не добавлять новые screen mode union-типы внутри экранов; общие режимы хранить в `apps/web/src/types.ts`.
- Не держать доменную сборку объектов в JSX-компонентах, если ее можно вынести в `apps/web/src/domain`.
- Не заводить новые глобальные browser side effects прямо в `App.tsx`; использовать хуки в `apps/web/src/hooks`.
- Локальные UI-черновики хранить через версионированный `localStorage`-слой, а не напрямую в компонентах.
- Для временных действий без backend использовать понятные toast-сообщения, а не молчащие кнопки.
- Пустые состояния должны иметь либо объяснение, либо следующий безопасный шаг.
- После каждой крупной UI-правки проверять хотя бы: загрузку dashboard, переход по вкладке, toast и модалку заявки.

## Следующие стабилизационные шаги

1. Расширить typed API client на результаты обходов, сотрудников, мобильные аккаунты и пользователей сайта.
2. После утверждения OpenAPI заменить временные DTO на generated/shared contracts.
3. Добавить frontend smoke/e2e тесты после выбора тестового раннера.
4. Добавить backend unit/integration тестовые проекты после фиксации первых use cases.
5. Ввести CI gate: `dotnet build`, `npm run verify`, затем smoke-тесты.
