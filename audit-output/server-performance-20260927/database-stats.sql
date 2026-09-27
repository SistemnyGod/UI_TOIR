BEGIN READ ONLY;
SET LOCAL statement_timeout = '8s';
SELECT now() AS sampled_at, stats_reset, numbackends, xact_commit, xact_rollback,
       blks_read, blks_hit, tup_returned, tup_fetched, tup_inserted, tup_updated,
       temp_files, temp_bytes, deadlocks
FROM pg_stat_database WHERE datname = current_database();
SELECT state, wait_event_type, wait_event, count(*) AS connections
FROM pg_stat_activity WHERE datname=current_database()
GROUP BY state, wait_event_type, wait_event ORDER BY connections DESC;
SELECT relname, n_live_tup, n_dead_tup, seq_scan, seq_tup_read, idx_scan,
       pg_size_pretty(pg_total_relation_size(relid)) AS size, last_autovacuum
FROM pg_stat_user_tables ORDER BY seq_tup_read DESC LIMIT 25;
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size,
       n_live_tup, n_dead_tup
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 12;
COMMIT;
