# Аудит мобильного приложения и сервера Patrol360

Дата: 2026-07-20

Область: Android-приложение `mobiel proekt`, ASP.NET Core API, worker, PostgreSQL и Docker-контур. Web-клиент проверялся только как часть общей сборки и контура аутентификации.

## Итог

Проект имеет хорошую базовую инженерную дисциплину: разделение на domain/application/contracts/infrastructure, строгую компиляцию, fallback-авторизацию API, хеширование паролей и непрозрачных токенов, ротацию refresh-токенов, владелец-зависимый outbox, проверку размера и SHA-256 загружаемых файлов, WAL/foreign keys в мобильной SQLite, CI и заметный набор unit/contract/integration-тестов.

Основной риск перед промышленной эксплуатацией находится в конфигурации и release-процессе. В текущем виде стандартный Docker-контур публикует инфраструктурные сервисы на все интерфейсы с тестовыми учётными данными, а новая БД получает администратора с известным паролем. Release APK при отсутствии внешней переменной собирается для `local-enterprise` и разрешает HTTP к фиксированному LAN-адресу. Эти пункты требуют устранения до использования вне изолированного тестового стенда.

## Критические и высокие замечания

### P0. Docker-контур публикует БД и инфраструктуру с небезопасными значениями по умолчанию

`infra/docker/compose.yaml` публикует PostgreSQL `5432`, Redis `6379`, RabbitMQ management `15672` и MinIO `9000/9001` на host без привязки к loopback. При этом PostgreSQL и MinIO получают предсказуемые fallback-пароли (`patrol360_dev`, `patrol360_dev_password`), а Redis запускается без аутентификации. На рабочей станции или сервере в общей LAN это создаёт прямой путь к данным и служебным интерфейсам в обход API.

Рекомендация: в поддерживаемом app-профиле не публиковать инфраструктурные порты вообще; для локальной диагностики создать отдельный override с `127.0.0.1:...`. Удалить fallback-секреты из production-пути и останавливать запуск при отсутствии обязательных secret values. Защитить Redis ACL/паролем, MinIO — уникальными credentials, RabbitMQ — отдельным пользователем без default guest.

### P0. Новая БД получает известную административную учётную запись

`Patrol360DbSeeder.SeedAsync` вызывает `SeedAuth`, если таблица пользователей пуста (`libs/infrastructure/Persistence/Patrol360DbSeeder.cs:81`). Администратор создаётся с логином `admin` и паролем `Patrol360!` (`Patrol360DbSeeder.cs:803-812`). Миграционный контейнер запускает seeder и по умолчанию работает в `Development`.

Рекомендация: получать bootstrap-пароль только из обязательного секрета, разрешать seed администратора лишь явным одноразовым флагом, требовать смену пароля при первом входе и завершать production-инициализацию ошибкой при шаблонном/отсутствующем секрете. Для уже созданных БД немедленно проверить и заменить пароль.

### P1. Release APK по умолчанию собирается для LAN/HTTP, а не production

`app.config.js:9-11` выбирает `local-enterprise`, если `PATROL360_ENVIRONMENT`/`EXPO_PUBLIC_PATROL360_ENVIRONMENT` не заданы. Это окружение использует `http://192.168.2.194:5173`; для него генерируется исключение cleartext policy. `scripts/build-apk.ps1` для Release задаёт только `NODE_ENV=production` (`build-apk.ps1:228`), но не задаёт и не проверяет `PATROL360_ENVIRONMENT`. В `eas.json` production-профиль также не фиксирует окружение.

Следствие: корректно подписанный release APK может обращаться по HTTP к тестовому серверу. Это создаёт риск перехвата bearer/refresh-токенов и отправки производственных данных не в тот контур.

Рекомендация: для Release требовать `PATROL360_ENVIRONMENT=production`, запрещать HTTP и placeholder-домен, валидировать итоговый Expo config/Android manifest в CI и добавить smoke-тест base URL в собранном артефакте. Для внутреннего LAN-релиза использовать отдельный явно названный профиль.

### P1. Worker не изолирует ошибки отдельных фоновых операций

Вся работа выполняется внутри одного цикла `Worker.ExecuteAsync` (`apps/worker/Worker.cs:21-74`). Вызовы carry-over, refresh notifications, PERCo sync и push delivery не имеют локального `try/catch`; исключение одной интеграции завершает `BackgroundService`. Docker перезапустит процесс, но постоянная ошибка одной операции может создать restart loop и остановить все остальные задачи. Healthcheck проверяет только процесс и наличие Firebase-файла (`infra/docker/compose.yaml:96-97`), поэтому деградация задач не видна.

Рекомендация: изолировать каждую задачу, логировать structured failure, применять bounded exponential backoff и хранить last-success/last-error. Liveness не должна зависеть от внешней интеграции, readiness/metrics должны показывать свежесть каждой фоновой задачи. Добавить тест «ошибка одной задачи не останавливает остальные».

### P1. Исправлено 2026-07-20: единая авторизация мобильных endpoints

Добавлена отдельная схема `MobileBearer` и policy `MobileSession`. `MobileController` и `MobileV2Controller` защищены на уровне класса; `[AllowAnonymous]` оставлен только для health/login/refresh. Проверка active/expired/revoked выполняется до вызова action через `IMobileSessionAuthenticationService`, поэтому невалидная сессия получает единообразный `401` и больше не превращается в `200 []`.

Проверено API-тестами для отсутствующего, invalid, expired и revoked token, проверкой policy всех мобильных endpoints и PostgreSQL integration-тестом реального жизненного цикла сессии.

## Средние замечания

### P2. Исправлено 2026-07-20: локальные рабочие данные защищены SQLCipher и исключены из backup

`expo-sqlite` собирается с `useSQLCipher=true`. База открывается только через `openProtectedDatabase`: для неё создаётся случайный 256-битный ключ, который хранится в `expo-secure-store` с доступностью `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. Существующая plaintext-база переносится через `sqlcipher_export`; исходный файл удаляется только после `cipher_integrity_check` и сверки количества строк в защищаемых таблицах. Если процесс был прерван между экспортом и удалением старой БД, следующий запуск повторно сравнивает обе копии и пересоздаёт encrypted-копию при расхождении. Отсутствующий или повреждённый ключ не приводит к созданию новой пустой базы поверх существующих данных, поэтому отчёты не теряются молча.

Android manifest задаёт `allowBackup=false`, а `backup_rules.xml` и `data_extraction_rules.xml` исключают root/files/databases/shared preferences/external data как из cloud backup, так и из device transfer. Диагностические сообщения дополнительно очищаются от bearer/refresh-токенов, паролей, API keys, cookies и секретов в URL. Retention журналов и локальных media, а также owner isolation остаются включены.

Проверено unit-тестами политики ключа/PRAGMA/экранирования путей и diagnostics, сгенерированным native-проектом и собранным arm64 debug APK. В APK присутствуют `libexpo-sqlite.so`, `libcrypto.so`, символы `cipher_version`/`sqlcipher_export`/`OpenSSL`, запрет backup и обе data-extraction policy. Остаётся обязательный device smoke-test обновления поверх версии с plaintext-БД: создать несинхронизированный отчёт, обновить приложение, проверить миграцию и успешную отправку после перезапуска.

### P2. Исправлено 2026-07-20: forwarded headers принимаются только от доверенного proxy

API использует fail-closed конфигурацию `ForwardedHeaders:KnownProxies`, ограничивает цепочку `ForwardLimit=1` и не доверяет подсетям целиком. При пустом списке ни один внешний proxy не может изменить `RemoteIpAddress`. Docker-контур выделяет Caddy фиксированный внутренний адрес `172.30.0.10` в отдельной подсети и передаёт этот же адрес API через environment.

Добавлены middleware-тесты: прямой запрос с поддельным `X-Forwarded-For` сохраняет исходный IP/rate-limit partition; запрос от доверенного Caddy получает клиентский IP; некорректный IP в конфигурации останавливает запуск с явной ошибкой.

### P2. Dependency vulnerability audit не дал результата в локальном прогоне

`npm audit` для web/mobile и NuGet audit не смогли обратиться к registry. .NET restore завершился с `NU1900`; `Directory.Build.props` сознательно не делает `NU1900` ошибкой, хотя CI отдельно ищет этот код. Поэтому текущий аудит не подтверждает отсутствие известных CVE.

Рекомендация: сохранить CI-проверку `NU1900`, добавить обязательный `npm audit`/OSV или Dependabot для обоих lock-файлов и публиковать SBOM для API/worker/APK. Не считать сборку проверенной по CVE, если advisory source недоступен.

### P2. Production-профиль Docker по умолчанию запускается как Development

API, migrate и worker используют `${ASPNETCORE_ENVIRONMENT:-Development}` (`infra/docker/compose.yaml:17`, `37`, `89`). Ошибочно не заданная переменная тем самым переводит рабочий запуск в development semantics.

Рекомендация: production compose должен по умолчанию задавать `Production` либо требовать явное значение; development-настройки следует вынести в override.

## Проверки

- `dotnet test Patrol360.slnx --configuration Release`: успешно; API 54, domain 2, application 3, worker 1, infrastructure 30 unit-тестов. DB-тесты в обычном режиме были пропущены по design.
- PostgreSQL integration с `PATROL360_RUN_DB_INTEGRATION=true`: 93/93 успешно, 0 пропущено.
- Мобильный `npm run verify`: 55/55 тестов, TypeScript и Expo ESLint успешно.
- Native Android prebuild: SQLCipher включён, NDK выровнен для всех library-модулей, cleartext разрешён только для `192.168.2.194`, localhost и `127.0.0.1`.
- Arm64 debug APK собран и проверен `apksigner`/`aapt2`: подпись v2 валидна, backup выключен, SQLCipher/OpenSSL присутствуют. Release APK требует отдельной сборки с производственным профилем и release-keystore.
- Web `npm run verify`: TypeScript и production Vite build успешно.
- `tools/Verify-TextEncoding.ps1`: успешно.
- Git worktree до создания отчёта был чистым.
- NuGet/npm vulnerability feeds: не проверены из-за недоступности registry; это открытый пункт, а не успешная проверка.

## Рекомендуемый порядок работ

1. Немедленно закрыть host-порты инфраструктуры и заменить bootstrap/default credentials.
2. Сделать release environment fail-closed и пересобрать/проверить APK.
3. Унифицировать мобильную authentication scheme и ответы 401.
4. Изолировать фоновые задачи worker и добавить operational health/metrics.
5. Выполнить device smoke-test миграции plaintext → SQLCipher и отправки сохранённого отчёта.
6. Включить воспроизводимый dependency/SBOM audit.
