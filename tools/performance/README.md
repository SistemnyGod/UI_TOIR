# Производительный контур Patrol360

Набор не запускается обычным `Test-All.ps1` и не изменяет рабочую базу случайно. Он рассчитан на отдельную обезличенную PostgreSQL 17 с именем `patrol360_perf_*`, уже подготовленную миграциями приложения.

```powershell
.\tools\Seed-PerformanceDataset.ps1 -ConnectionString "Host=localhost;Port=5432;Database=patrol360_perf_local;Username=patrol360;Password=patrol360_dev"
.\tools\Run-PerformanceExplain.ps1 -ConnectionString "Host=localhost;Port=5432;Database=patrol360_perf_local;Username=patrol360;Password=patrol360_dev" -Query "бот"
```

Сидер создаёт синтетические объёмы: 50 000 номенклатур, 500 000 движений склада, 100 000 заявок/назначений/результатов и 100 000 рабочих сессий ЭМУ с участниками, паузами и аудитом. Он также добавляет 1 000 сотрудников PERCo, их сопоставления и 1 000 000 проходов. Повторный запуск идемпотентен для строк с префиксом `perf-`.

`Run-PerformanceExplain.ps1` сохраняет пять результатов `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` в JSONL-файл в `TestResults/performance`. Сравнение медиан и контроль отсутствия seq scan выполняются по сохранённым JSON отдельно, чтобы не включать нагрузочный набор в обычный CI.

Для изолированных API и worker подготовьте 50 разных web- и 50 разных mobile-аккаунтов, сохраните их краткоживущие токены в файл вне Git на основе `load-config.example.json`, затем запустите:

```powershell
.\tools\Run-PerformanceLoad.ps1 -ConfigurationPath .\secrets\patrol360-perf-load.json -RepeatThreeTimes
```

Создайте фото ровно 1 MiB вне репозитория через `New-PerformancePhotoFixture.ps1`; перенесите его SHA-256 в конфигурацию. Для каждого mobile actor укажите две стабильные идентичности файлов и 20 валидных идемпотентных outbox-команд, связывающих эти файлы с назначенной ему работой. Сценарий k6 делает web-поиск/таблицы/детали и mobile bootstrap/outbox с паузами 3–8 секунд, ступенями 10/25/50/100 активных клиентов и 30 минутами на 100. На первой итерации каждого mobile actor загружаются две фотографии, после чего его пакет outbox проверяет повторную отправку. Конфигурация не содержит секретов в репозитории. Перед запуском подключите контролируемые тестовые PERCo и push-провайдеры к изолированному API; рабочий адрес использовать запрещено.

Во втором окне одновременно запустите `Collect-PerformanceMetrics.ps1` с тем же `patrol360_perf_*` и именами тестовых контейнеров API, worker и PostgreSQL. Скрипт сохраняет JSONL со временем, CPU/RAM контейнеров, активными соединениями, ожиданиями блокировок и размером БД. k6 сохраняет p50/p95/p99, запросы, ошибки и пропускную способность в собственном summary JSON. Снимите `Run-PerformanceExplain.ps1` до и после каждого из трёх итоговых прогонов.
