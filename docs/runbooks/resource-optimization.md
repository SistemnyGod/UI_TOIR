# Оптимизация ресурсов Patrol360

Основной запуск не включает Redis, RabbitMQ и MinIO:

```powershell
.\tools\Start-Patrol360.ps1
```

Для совместимого запуска необязательных сервисов используйте:

```powershell
.\tools\Start-Patrol360.ps1 -IncludeOptionalServices
```

Перед остановкой ранее запущенных сервисов проверьте Redis, RabbitMQ и MinIO, а также отсутствие внешних потребителей. Останавливайте только точные имена контейнеров; тома, сети и контейнеры других проектов не удаляйте.

Локальные PostgreSQL-интеграции запускаются безопасно:

```powershell
.\tools\Test-All.ps1 -IncludeDbIntegration
```

Скрипт создаёт временный PostgreSQL 17 на случайном loopback-порту, сохраняет журнал в `TestResults/dotnet/db/isolated-postgres.log` и удаляет только этот контейнер. Для заранее подготовленного изолированного стенда передайте явное подключение:

```powershell
.\tools\Test-All.ps1 -IncludeDbIntegration -DbIntegrationAdminConnectionString "Host=127.0.0.1;Port=55439;Database=postgres;Username=patrol360;Password=..."
```

Не указывайте рабочую БД. Прямой запуск DB-интеграций с `PATROL360_RUN_DB_INTEGRATION=true` требует `PATROL360_DB_INTEGRATION_ADMIN_CONNECTION_STRING` и завершается понятной ошибкой, если строка не задана.

После каждого изменения снимайте до/после три одинаковых десятиминутных прогона через `tools/measure-server-resources.ps1`. Память Windows NVRM измеряйте отдельно: она не входит в память контейнеров Patrol360.
