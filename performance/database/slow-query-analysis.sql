-- ============================================================
-- slow-query-analysis.sql — 宁津环卫 HSE 安全管理系统 v4.1
-- 慢查询分析与数据库诊断工具集
-- ============================================================
--
-- 目标数据库: safety_dashboard
-- 执行用户:   hse_app (部分查询需要 superuser 权限)
-- 用途:       定位性能瓶颈、监控查询状态、优化数据库配置
--
-- 使用方式:
--   psql -U hse_app -d safety_dashboard -f performance/database/slow-query-analysis.sql
--
-- 注意事项:
--   - pg_stat_statements 需要超级用户权限启用
--   - 部分查询仅超级用户可执行（已在注释中标明）
--   - 建议在非高峰期执行诊断
--   - 所有查询均为只读，不会修改数据
-- ============================================================

\timing on
\pset pager off

-- ============================================================
-- 1. 查看当前活跃连接及持续时间
-- ============================================================
-- 用途: 排查连接泄漏、长时间运行的查询、阻塞会话
-- 权限: 普通用户可查看自己的连接，superuser 可查看所有连接
-- ============================================================
SELECT
  pid,
  usename,
  datname,
  client_addr::text,
  state,
  wait_event_type,
  wait_event,
  EXTRACT(EPOCH FROM (now() - query_start)) AS duration_seconds,
  LEFT(query, 100) AS query_preview
FROM pg_stat_activity
WHERE state != 'idle'
  AND datname = current_database()
ORDER BY query_start;

-- ============================================================
-- 2. 查看 TOP 20 最慢查询（pg_stat_statements）
-- ============================================================
-- 用途: 识别消耗最多时间的 SQL 查询，指导优化方向
-- 前置条件: 需要 CREATE EXTENSION pg_stat_statements
-- 权限: 需要 superuser 或 pg_read_all_stats 角色
-- ============================================================

-- 启用扩展（需要 superuser 权限）
-- 如果当前用户不是 superuser，请以 postgres 用户执行以下语句：
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

DO $$
BEGIN
  -- 尝试创建扩展（可能因权限不足而失败，不影响后续执行）
  BEGIN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements';
    RAISE NOTICE 'pg_stat_statements extension is available.';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'NOTE: Cannot create pg_stat_statements extension. Skipping slow query analysis. Run as superuser.';
    RETURN;
  END;

  -- 查询 TOP 20 最慢的 SQL
  RAISE NOTICE '=== TOP 20 Slowest Queries (by total_time) ===';
END $$;

-- 仅在扩展可用时执行
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
    -- 这里不能直接执行 SELECT 返回结果集给客户端
    -- 使用 RAISE NOTICE 代替
    RAISE NOTICE 'Run the following query manually to see TOP 20 slow queries:';
    RAISE NOTICE '
      SELECT
        calls,
        ROUND(total_exec_time::numeric, 2)  AS total_time_ms,
        ROUND(mean_exec_time::numeric, 2)   AS mean_time_ms,
        ROUND((100 * total_exec_time / NULLIF(SUM(total_exec_time) OVER (), 0))::numeric, 2) AS pct_total,
        rows,
        dbid,
        LEFT(query, 200) AS query_preview
      FROM pg_stat_statements
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      ORDER BY total_exec_time DESC
      LIMIT 20;';
  END IF;
END $$;

-- 可直接执行的降级查询（不需要 pg_stat_statements）
-- 查看当前正在执行的最慢查询
SELECT
  pid,
  EXTRACT(EPOCH FROM (now() - query_start)) AS duration_seconds,
  state,
  LEFT(query, 200) AS query_preview,
  backend_start
FROM pg_stat_activity
WHERE state = 'active'
  AND datname = current_database()
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY query_start;

-- ============================================================
-- 3. 查看表大小排行 TOP 20
-- ============================================================
-- 用途: 识别占用空间最大的表，评估是否需要分区或归档
-- 权限: 普通用户可执行
-- ============================================================
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total_size,
  pg_total_relation_size(schemaname || '.' || tablename) AS total_bytes,
  pg_size_pretty(pg_relation_size(schemaname || '.' || tablename)) AS table_size,
  pg_size_pretty(pg_indexes_size(schemaname || '.' || tablename)) AS index_size,
  pg_stat_get_tuples_returned(c.oid) AS tuple_returns,
  pg_stat_get_tuples_fetched(c.oid) AS tuple_fetches,
  pg_stat_get_tuples_hot_updated(c.oid) AS hot_updates
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
LIMIT 20;

-- ============================================================
-- 4. 查看索引使用率（找出未使用的索引）
-- ============================================================
-- 用途: 发现冗余索引，减少写入开销和存储空间
-- 权限: 普通用户可执行
-- ============================================================
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS index_scans,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  CASE
    WHEN idx_scan = 0 THEN 'UNUSED - Consider dropping'
    WHEN idx_scan < 100 THEN 'LOW_USAGE - Review necessity'
    ELSE 'IN_USE'
  END AS usage_status
FROM pg_stat_user_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;

-- 生成删除未使用索引的建议 SQL
SELECT
  'DROP INDEX IF EXISTS ' || schemaname || '.' || indexname || ';' AS drop_statement,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS freed_space
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================================
-- 5. 查看表扫描 vs 索引扫描比例
-- ============================================================
-- 用途: 识别缺失索引的表，seq_scan 过高意味着需要优化查询或添加索引
-- 权限: 普通用户可执行
-- ============================================================
SELECT
  schemaname,
  tablename,
  seq_scan,
  idx_scan,
  CASE
    WHEN seq_scan + idx_scan = 0 THEN 'N/A'
    ELSE ROUND((100.0 * idx_scan / NULLIF(seq_scan + idx_scan, 0))::numeric, 2)
  END AS idx_scan_pct,
  seq_tup_read,
  idx_tup_fetch,
  n_live_tup,
  n_dead_tup,
  CASE
    WHEN n_live_tup + n_dead_tup = 0 THEN 'N/A'
    ELSE ROUND((100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0))::numeric, 2)
  END AS dead_tuple_pct,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY seq_scan DESC, (seq_tup_read / NULLIF(seq_scan, 1)) DESC;

-- 索引扫描率低于 80% 的表（可能需要优化）
SELECT
  schemaname,
  tablename,
  seq_scan,
  idx_scan,
  ROUND((100.0 * idx_scan / NULLIF(seq_scan + idx_scan, 0))::numeric, 2) AS idx_scan_pct,
  'Low index usage - consider adding indexes or reviewing queries' AS suggestion
FROM pg_stat_user_tables
WHERE (seq_scan + idx_scan) > 100
  AND (100.0 * idx_scan / NULLIF(seq_scan + idx_scan, 0)) < 80
  AND schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY idx_scan_pct ASC;

-- ============================================================
-- 6. VACUUM 统计和碎片化检测
-- ============================================================
-- 用途: 评估是否需要手动 VACUUM，检测表膨胀
-- 权限: 普通用户可执行
-- ============================================================
-- 基本 Vacuum 统计
SELECT
  schemaname,
  tablename,
  n_live_tup AS live_tuples,
  n_dead_tup AS dead_tuples,
  CASE
    WHEN n_live_tup = 0 THEN '0.00%'
    ELSE ROUND((100.0 * n_dead_tup / n_live_tup)::numeric, 2)
  END AS dead_ratio,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze,
  vacuum_count,
  autovacuum_count,
  analyze_count,
  autoanalyze_count
FROM pg_stat_user_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n_dead_tup DESC NULLS LAST;

-- 表膨胀检测（需要 pgstattuple 扩展，可选）
-- CREATE EXTENSION IF NOT EXISTS pgstattuple;
-- SELECT * FROM pgstattuple('public.hazards');

-- 死元组比例超过 20% 的表（建议手动 VACUUM）
SELECT
  schemaname || '.' || tablename AS bloated_table,
  n_live_tup,
  n_dead_tup,
  ROUND((100.0 * n_dead_tup / NULLIF(n_live_tup, 0))::numeric, 2) AS dead_pct,
  'VACUUM ANALYZE ' || schemaname || '.' || tablename || ';' AS recommend
FROM pg_stat_user_tables
WHERE n_live_tup > 0
  AND n_dead_tup > n_live_tup * 0.20
  AND schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY dead_pct DESC;

-- ============================================================
-- 7. 锁等待分析
-- ============================================================
-- 用途: 排查死锁、长时间锁等待、阻塞问题
-- 权限: 普通用户可执行
-- ============================================================
-- 当前锁等待
SELECT
  blocked.pid     AS blocked_pid,
  blocked.usename AS blocked_user,
  blocking.pid    AS blocking_pid,
  blocking.usename AS blocking_user,
  blocked.query   AS blocked_query_preview,
  blocking.query  AS blocking_query_preview,
  EXTRACT(EPOCH FROM (now() - blocked.query_start)) AS blocked_duration_seconds
FROM pg_stat_activity blocked
JOIN pg_locks blocked_locks ON blocked.pid = blocked_locks.pid
JOIN pg_locks blocking_locks
  ON blocked_locks.locktype = blocking_locks.locktype
  AND blocked_locks.database IS NOT DISTINCT FROM blocking_locks.database
  AND blocked_locks.relation IS NOT DISTINCT FROM blocking_locks.relation
  AND blocked_locks.page IS NOT DISTINCT FROM blocking_locks.page
  AND blocked_locks.tuple IS NOT DISTINCT FROM blocking_locks.tuple
  AND blocked_locks.pid != blocking_locks.pid
JOIN pg_stat_activity blocking
  ON blocking_locks.pid = blocking.pid
WHERE NOT blocked_locks.granted
  AND blocking_locks.granted;

-- 所有锁的概览
SELECT
  locktype,
  mode,
  COUNT(*) AS lock_count,
  COUNT(*) FILTER (WHERE NOT granted) AS waiting_count
FROM pg_locks
WHERE pid IN (SELECT pid FROM pg_stat_activity WHERE datname = current_database())
GROUP BY locktype, mode
ORDER BY waiting_count DESC, lock_count DESC;

-- ============================================================
-- 8. 连接池状态
-- ============================================================
-- 用途: 监控数据库连接数，评估是否需要调整 max_connections
-- 权限: 普通用户可执行
-- ============================================================
-- 当前连接概览
SELECT
  COUNT(*) AS total_connections,
  COUNT(*) FILTER (WHERE state = 'active')  AS active,
  COUNT(*) FILTER (WHERE state = 'idle')     AS idle,
  COUNT(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_transaction,
  COUNT(*) FILTER (WHERE state = 'idle in transaction (aborted)') AS idle_aborted,
  COUNT(*) FILTER (WHERE wait_event_type = 'Lock') AS waiting_for_lock,
  current_setting('max_connections')::int AS max_connections_setting,
  ROUND(100.0 * COUNT(*) / current_setting('max_connections')::int, 2) AS usage_pct
FROM pg_stat_activity
WHERE datname = current_database();

-- 按用户分组连接数
SELECT
  usename,
  COUNT(*) AS connection_count,
  COUNT(*) FILTER (WHERE state = 'active') AS active_count,
  STRING_AGG(DISTINCT client_addr::text, ', ') AS client_addresses
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY usename
ORDER BY connection_count DESC;

-- ============================================================
-- 9. 临时文件使用（排序/哈希溢出）
-- ============================================================
-- 用途: 检测 work_mem 不足导致的磁盘排序，指导内存配置优化
-- 权限: 需要 pg_read_all_stats 或 superuser
-- ============================================================
-- 临时文件使用统计
SELECT
  datname,
  temp_files,
  pg_size_pretty(temp_bytes) AS temp_file_size,
  ROUND(100.0 * temp_files / NULLIF(SUM(temp_files) OVER (), 0), 2) AS pct_of_total
FROM pg_stat_database
WHERE datname NOT IN ('template0', 'template1')
  AND temp_files > 0
ORDER BY temp_bytes DESC;

-- 语句级别的临时文件使用
-- 需要 pg_stat_statements 扩展
DO $$
BEGIN
  RAISE NOTICE '=== Queries using temporary files (disk spill) ===';
  RAISE NOTICE 'Requires pg_stat_statements extension and superuser privileges.';
  RAISE NOTICE 'Query: SELECT query, calls, temp_files, pg_size_pretty(temp_bytes) AS temp_size FROM pg_stat_statements WHERE temp_files > 0 ORDER BY temp_bytes DESC LIMIT 20;';
END $$;

-- ============================================================
-- 10. 自定义慢查询阈值报告（> 500ms）
-- ============================================================
-- 用途: 自定义慢查询阈值，快速定位超过 500ms 的查询
-- 权限: 普通用户可执行（仅限当前活跃查询）
-- 配置: log_min_duration_statement = 500 (postgresql.conf)
-- ============================================================

-- 当前活跃查询中执行时间超过 500ms 的
SELECT
  pid,
  usename,
  datname,
  EXTRACT(EPOCH FROM (now() - query_start)) * 1000 AS duration_ms,
  wait_event_type,
  wait_event,
  state,
  LEFT(query, 200) AS query_preview
FROM pg_stat_activity
WHERE state = 'active'
  AND datname = current_database()
  AND (now() - query_start) > INTERVAL '500 milliseconds'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration_ms DESC;

-- 配置建议
DO $$
BEGIN
  RAISE NOTICE '=== Slow Query Configuration Recommendations ===';
  RAISE NOTICE '';
  RAISE NOTICE 'To enable automatic slow query logging in postgresql.conf:';
  RAISE NOTICE '  log_min_duration_statement = 500';
  RAISE NOTICE '  log_statement = ''none''';
  RAISE NOTICE '  log_destination = ''stderr, csvlog''';
  RAISE NOTICE '  logging_collector = on';
  RAISE NOTICE '';
  RAISE NOTICE 'To enable pg_stat_statements for historical query analysis:';
  RAISE NOTICE '  shared_preload_libraries = ''pg_stat_statements''';
  RAISE NOTICE '  pg_stat_statements.track = all';
  RAISE NOTICE '  pg_stat_statements.max = 10000';
  RAISE NOTICE '';
  RAISE NOTICE 'Work memory optimization (reduce temp file spills):';
  RAISE NOTICE '  work_mem = 64MB  (default 4MB)';
  RAISE NOTICE '  maintenance_work_mem = 256MB  (default 64MB)';
END $$;

-- ============================================================
-- 输出汇总
-- ============================================================
SELECT 'Diagnosis Complete' AS status,
       current_database() AS database,
       current_user AS current_user,
       NOW() AS check_time;
