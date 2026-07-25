# Контрольная точка мобильного приложения Patrol360 — 25.07.2026

## Исходный код

- Ветка: `codex/patrol-stabilization`
- HEAD на момент фиксации: `d7b32aa061a816626f89be684a0c7868aa15bf46`
- Рабочие изменения мобильного проекта на момент фиксации:
  - `mobiel proekt/src/db/repositories/outboxRepository.ts`
  - `mobiel proekt/src/sync/syncEngine.ts`
  - `mobiel proekt/src/sync/syncTriggers.ts`
  - `mobiel proekt/tests/mobileAuditRegression.test.ts`
- Web-проект в эту контрольную точку не включался и не изменялся.

## Проверки

- `npm install --no-audit --no-fund`: не проходит из-за конфликта peer-зависимостей `react@19.2.3` и `react-dom@19.2.7`.
- `npm ci --no-audit --no-fund`: воспроизводит тот же конфликт.
- `npm install --legacy-peer-deps --no-audit --no-fund`: проходит; `package.json` и `package-lock.json` после проверки восстановлены без изменений.
- `npm run typecheck`: проходит.
- `npm run lint`: не проходит на существующей ошибке `src/features/patrol/PointFillScreen.tsx:51` (`latestDraftRef.current` изменяется во время render); также есть два warning по зависимостям `useCallback`.
- `node --test --experimental-strip-types tests/mobileAuditRegression.test.ts`: 4/4 теста пройдено.

## Debug APK

- Файл: `mobiel proekt/build-output/patrol360-mobile-debug.apk`
- Package: `ru.patrol360.mobile`
- Version: `0.1.24` / versionCode `25`
- Размер: `109132055` байт
- SHA-256: `03986944B0690297776C7E9D4AD3CA1B7C04BAA0C170EBAE5491148BBACFA21A`
- Сборка Gradle: `BUILD SUCCESSFUL`.

## API endpoint

- Основной endpoint: `http://192.168.2.194:5173`
- Mobile health: `http://192.168.2.194:5173/api/v1/mobile/health`
- Ответ на момент фиксации: `status=ok`, `syncProtocolVersion=1.0`, `contourId=patrol360-local-enterprise`.
- Резервный адрес приложения: `http://31.173.110.118`; его доступность отдельно не подтверждалась.

## SQLite

Копия рабочей SQLite не сохранена: база `patrol360-mobile-encrypted.db` создаётся внутри sandbox Android-приложения. На момент фиксации Android-устройство не подключено, `adb` отсутствует, а SQLite-файла в репозитории и build-каталогах нет.

## Тестовые данные

На локальном сервере уже существует контрольный набор, новые записи не создавались:

- мобильный аккаунт `test1`, ID `6c61fba6-01ee-438c-b4ff-2d0ed1f1186b`, статус `Активен`;
- маршрут `Обход печей`, ID `e5444446-5726-18de-986b-6d1548f26c39`, статус `Активен`, версия `2`;
- заявка `REQ-20260725-0001`, ID `97b3680c-eff1-441d-8e26-1d7cbdd37724`, маршрут `Обход печей`, сотрудник `Костарев Илья Сергеевич`, статус `Назначена`, assignment ID `bf300b11-1920-4dfb-b830-d37e0860976c`.

Пароль аккаунта `test1` в baseline-файл не записывался. Контрольный набор получен чтением локального API под существующей административной сессией; серверные данные не изменялись.

Эта запись является базовой точкой сравнения для следующих исправлений мобильного приложения.

## Этап 1. Минимальный тестовый контур

- Добавлен `vitest@4.1.10` только в `devDependencies`; Expo runtime и production-зависимости не затрагиваются.
- Добавлены команды `npm run test` и `npm run test:file -- tests/smoke.vitest.test.ts`.
- Добавлен `vitest.config.ts` с Node-окружением и alias `@` → `src`; SQLite-мок не добавлялся, потому что smoke-тест не обращается к базе.
- Добавлен `tests/smoke.vitest.test.ts`: 1 тест проходит без загрузки Expo runtime.
- `npm run test`: 1 файл, 1 тест — успешно.
- `npm run test:file -- tests/smoke.vitest.test.ts`: успешно.
- `npm run typecheck`: успешно.
- `npm run lint`: остаётся заблокирован существующей ошибкой `src/features/patrol/PointFillScreen.tsx:51` (`latestDraftRef.current` изменяется во время render) и двумя предупреждениями; тестовый контур эту ошибку не создаёт.

## Аудит базовой стабильности — 25.07.2026

Исправлены подтверждённые дефекты мобильного контура:

- частичный refresh уведомлений и рабочих заданий больше не считается успешным; причина записывается в диагностику;
- handoff разрешён только для обхода со статусом `inProgress`, проверка выполняется до транзакции и внутри неё;
- финализация отчёта блокируется, если локальная запись вложения или физический файл отсутствуют;
- очередь, заявки, активный обход, точка и диагностика показывают ошибку чтения SQLite отдельно от пустого состояния и предлагают повтор;
- черновик точки обновляет ref в `useEffect`, ошибки сохранения черновика записываются в диагностику;
- при ошибке загрузки карточки заявки/обхода старые данные не очищаются автоматически.

Проверки:

- `npm run typecheck` — успешно;
- `npm run lint` — успешно, остались только два прежних warning в `AllPointsScreen.tsx` и `SubmitReportScreen.tsx`;
- `npm run build:android:debug` — `BUILD SUCCESSFUL`, APK обновлён в `mobiel proekt/build-output/patrol360-mobile-debug.apk`.

Не проверено на физическом телефоне: восстановление сети, реальная отправка отчёта с вложением и миграция существующей SQLite-базы.
## Финальная проверка после исправлений — 25.07.2026

- `npm run typecheck` — успешно.
- `npm run lint` — 0 ошибок; остались только два прежних warning в `AllPointsScreen.tsx` и `SubmitReportScreen.tsx`.
- `npm run build:android:debug` — `BUILD SUCCESSFUL`.
- APK: `mobiel proekt/build-output/patrol360-mobile-debug.apk`.
- SHA-256: `A62DEF404CEDEBD21427E4C3C46AA723EF9C610C18E2FCEC50E18E3DE4CC4F61`.
- Размер: `109135659` байт.