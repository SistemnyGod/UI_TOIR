# Производительный контур Patrol360

Набор не запускается обычным `Test-All.ps1` и не изменяет рабочую базу случайно. Он рассчитан на отдельную обезличенную PostgreSQL 17 с именем `patrol360_perf_*`, уже подготовленную миграциями приложения.

```powershell
.\tools\Seed-PerformanceDataset.ps1 -ConnectionString "Host=localhost;Port=5432;Database=patrol360_perf_local;Username=patrol360;Password=patrol360_dev"
.\tools\Run-PerformanceExplain.ps1 -ConnectionString "Host=localhost;Port=5432;Database=patrol360_perf_local;Username=patrol360;Password=patrol360_dev" -Query "бот"
```

Сидер создаёт синтетические объёмы: 50 000 номенклатур, 500 000 движений склада, 100 000 заявок/назначений/результатов и 100 000 рабочих сессий ЭМУ с участниками, паузами и аудитом. Повторный запуск идемпотентен для строк с префиксом `perf-`.

`Run-PerformanceExplain.ps1` сохраняет пять результатов `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` в JSONL-файл в `TestResults/performance`. Сравнение медиан и контроль отсутствия seq scan выполняются по сохранённым JSON отдельно, чтобы не включать нагрузочный набор в обычный CI.
