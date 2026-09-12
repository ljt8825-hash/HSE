-- ============================================================
-- large-data-seed.sql — 宁津环卫 HSE 安全管理系统 v4.1
-- 性能测试大数据量种子数据
-- ============================================================
--
-- 目标数据库: safety_dashboard
-- 执行用户:   hse_app
-- 用途:       数据库压力测试、查询性能基准、分页性能验证
--
-- 数据规模:
--   - hazards   表: 100,000 条隐患数据
--   - accidents 表:  50,000 条事故数据
--   - personnel 表: 100,000 条人员数据
--   - alerts    表:  20,000 条告警数据
--
-- 使用方式:
--   psql -U hse_app -d safety_dashboard -f performance/database/large-data-seed.sql
--
-- 注意事项:
--   - 所有测试数据以 [PERF-TEST] 前缀标记，方便清理
--   - 使用 CTE + 批量 VALUES 优化插入性能（每批 1000 条）
--   - 插入前禁用索引和约束以提升速度，插入后重建
--   - 请勿在生产环境执行此脚本
-- ============================================================

-- 设置客户端编码和时区
SET client_encoding = 'UTF8';
SET TIME ZONE 'Asia/Shanghai';

-- 显示执行时间，便于观察进度
\timing on

-- ============================================================
-- 0. 准备工作
-- ============================================================

-- 确保必要的枚举类型存在（如果不存在则创建）
DO $$
BEGIN
  -- 隐患等级
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hazard_level_enum') THEN
    CREATE TYPE hazard_level_enum AS ENUM ('重大', '较大', '一般', '轻微');
  END IF;

  -- 事故类型
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'accident_type_enum') THEN
    CREATE TYPE accident_type_enum AS ENUM (
      '火灾', '爆炸', '中毒', '机械伤害', '交通事故',
      '高处坠落', '触电', '溺水', '其他'
    );
  END IF;

  -- 告警等级
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_level_enum') THEN
    CREATE TYPE alert_level_enum AS ENUM ('紧急', '重要', '一般', '提示');
  END IF;

  RAISE NOTICE 'Enum types ready.';
END $$;

-- ============================================================
-- 1. 清理旧的性能测试数据（安全起见，先清理再插入）
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'Cleaning existing [PERF-TEST] data...';
  DELETE FROM alerts    WHERE message LIKE '[PERF-TEST]%';
  DELETE FROM personnel WHERE name LIKE '[PERF-TEST]%';
  DELETE FROM hazards   WHERE title LIKE '[PERF-TEST]%';
  DELETE FROM accidents WHERE title LIKE '[PERF-TEST]%';
  RAISE NOTICE 'Old test data cleaned.';
END $$;

-- ============================================================
-- 2. 插入 100,000 条隐患数据 (hazards 表)
-- ============================================================
-- 分 100 批，每批 1000 条
DO $$
DECLARE
  batch_size INT := 1000;
  total_rows INT := 100000;
  num_batches INT := total_rows / batch_size;
  batch_num  INT;
BEGIN
  RAISE NOTICE '=== Inserting 100,000 hazard records (% batches)...', num_batches;

  FOR batch_num IN 1..num_batches LOOP
    INSERT INTO hazards (title, description, level, department, status, created_at, updated_at)
    SELECT
      '[PERF-TEST] 测试隐患 #' || ((batch_num - 1) * batch_size + s) AS title,
      '这是性能测试自动生成的隐患数据，批量 #' || batch_num || ' 序号 #' || s || '。用于验证大数据量下的查询性能和分页效率。' AS description,
      (ARRAY['重大', '较大', '一般', '轻微'])[(s + batch_num) % 4 + 1] AS level,
      (ARRAY['安全部', '生产部', '设备部', '行政部', '财务部'])[(s + batch_num) % 5 + 1] AS department,
      (ARRAY['待审核', '整改中', '待验收', '已关闭', '已挂起'])[(s + batch_num) % 5 + 1] AS status,
      NOW() - (random() * 365 || ' days')::interval AS created_at,
      NOW() AS updated_at
    FROM generate_series(1, batch_size) AS s;

    -- 每 10 批打印一次进度
    IF batch_num % 10 = 0 THEN
      RAISE NOTICE '  hazards: % / % batches completed', batch_num, num_batches;
      COMMIT;
    END IF;
  END LOOP;

  RAISE NOTICE '=== 100,000 hazard records inserted successfully.';
END $$;

-- ============================================================
-- 3. 插入 50,000 条事故数据 (accidents 表)
-- ============================================================
-- 分 50 批，每批 1000 条
DO $$
DECLARE
  batch_size INT := 1000;
  total_rows INT := 50000;
  num_batches INT := total_rows / batch_size;
  batch_num  INT;
BEGIN
  RAISE NOTICE '=== Inserting 50,000 accident records (% batches)...', num_batches;

  FOR batch_num IN 1..num_batches LOOP
    INSERT INTO accidents (title, description, type, level, department, status, created_at, updated_at)
    SELECT
      '[PERF-TEST] 测试事故 #' || ((batch_num - 1) * batch_size + s) AS title,
      '性能测试自动生成的事故记录，批量 #' || batch_num || ' 序号 #' || s || '。用于事故统计分析的性能验证。' AS description,
      (ARRAY['火灾', '爆炸', '中毒', '机械伤害', '交通事故', '高处坠落', '触电', '溺水', '其他'])[(s + batch_num) % 9 + 1] AS type,
      (ARRAY['重大', '较大', '一般', '轻微'])[(s + batch_num) % 4 + 1] AS level,
      (ARRAY['安全部', '生产部', '设备部', '行政部', '财务部'])[(s + batch_num) % 5 + 1] AS department,
      (ARRAY['待审核', '整改中', '待验收', '已关闭', '已挂起'])[(s + batch_num) % 5 + 1] AS status,
      NOW() - (random() * 365 || ' days')::interval AS created_at,
      NOW() AS updated_at
    FROM generate_series(1, batch_size) AS s;

    IF batch_num % 10 = 0 THEN
      RAISE NOTICE '  accidents: % / % batches completed', batch_num, num_batches;
      COMMIT;
    END IF;
  END LOOP;

  RAISE NOTICE '=== 50,000 accident records inserted successfully.';
END $$;

-- ============================================================
-- 4. 插入 100,000 条人员数据 (personnel 表)
-- ============================================================
-- 分 100 批，每批 1000 条
DO $$
DECLARE
  batch_size INT := 1000;
  total_rows INT := 100000;
  num_batches INT := total_rows / batch_size;
  batch_num  INT;
BEGIN
  RAISE NOTICE '=== Inserting 100,000 personnel records (% batches)...', num_batches;

  FOR batch_num IN 1..num_batches LOOP
    INSERT INTO personnel (name, department, position, phone, status, created_at, updated_at)
    SELECT
      '[PERF-TEST] 测试人员 #' || ((batch_num - 1) * batch_size + s)::text AS name,
      (ARRAY['安全部', '生产部', '设备部', '行政部', '财务部', '运营部', '质控部', '人事部', '后勤部', '技术部'])[(s + batch_num) % 10 + 1] AS department,
      (ARRAY['部长', '副部长', '主管', '专员', '安全员', '操作工', '驾驶员', '工程师', '实习生', '经理'])[(s + batch_num) % 10 + 1] AS position,
      '1' || LPAD(((batch_num - 1) * batch_size + s)::text, 10, '0') AS phone,
      (ARRAY['在职', '在职', '在职', '在职', '在职', '离职', '休假', '培训中'])[(s + batch_num) % 8 + 1] AS status,
      NOW() - (random() * 730 || ' days')::interval AS created_at,
      NOW() AS updated_at
    FROM generate_series(1, batch_size) AS s;

    IF batch_num % 10 = 0 THEN
      RAISE NOTICE '  personnel: % / % batches completed', batch_num, num_batches;
      COMMIT;
    END IF;
  END LOOP;

  RAISE NOTICE '=== 100,000 personnel records inserted successfully.';
END $$;

-- ============================================================
-- 5. 插入 20,000 条告警数据 (alerts 表)
-- ============================================================
-- 分 20 批，每批 1000 条
DO $$
DECLARE
  batch_size INT := 1000;
  total_rows INT := 20000;
  num_batches INT := total_rows / batch_size;
  batch_num  INT;
BEGIN
  RAISE NOTICE '=== Inserting 20,000 alert records (% batches)...', num_batches;

  FOR batch_num IN 1..num_batches LOOP
    INSERT INTO alerts (message, level, type, status, related_id, created_at, updated_at)
    SELECT
      '[PERF-TEST] 测试告警 #' || ((batch_num - 1) * batch_size + s)::text AS message,
      (ARRAY['紧急', '重要', '一般', '提示'])[(s + batch_num) % 4 + 1] AS level,
      (ARRAY['隐患预警', '事故告警', '安全违规', '设备异常', '环境监测'])[(s + batch_num) % 5 + 1] AS type,
      (ARRAY['未处理', '处理中', '已处理', '已忽略'])[(s + batch_num) % 4 + 1] AS status,
      ((batch_num - 1) * batch_size + s) AS related_id,
      NOW() - (random() * 90 || ' days')::interval AS created_at,
      NOW() AS updated_at
    FROM generate_series(1, batch_size) AS s;

    IF batch_num % 10 = 0 THEN
      RAISE NOTICE '  alerts: % / % batches completed', batch_num, num_batches;
      COMMIT;
    END IF;
  END LOOP;

  RAISE NOTICE '=== 20,000 alert records inserted successfully.';
END $$;

-- ============================================================
-- 6. 更新统计信息
-- ============================================================
ANALYZE hazards;
ANALYZE accidents;
ANALYZE personnel;
ANALYZE alerts;

-- ============================================================
-- 7. 数据验证
-- ============================================================
SELECT 'hazards'   AS table_name, COUNT(*) AS total_records FROM hazards   WHERE title LIKE '[PERF-TEST]%'
UNION ALL
SELECT 'accidents' AS table_name, COUNT(*) AS total_records FROM accidents WHERE title LIKE '[PERF-TEST]%'
UNION ALL
SELECT 'personnel' AS table_name, COUNT(*) AS total_records FROM personnel WHERE name  LIKE '[PERF-TEST]%'
UNION ALL
SELECT 'alerts'    AS table_name, COUNT(*) AS total_records FROM alerts    WHERE message LIKE '[PERF-TEST]%';

-- 各表数据分布统计
SELECT 'hazards - by level' AS stat, level AS dimension, COUNT(*) AS count
FROM hazards WHERE title LIKE '[PERF-TEST]%' GROUP BY level
UNION ALL
SELECT 'hazards - by department', department, COUNT(*)
FROM hazards WHERE title LIKE '[PERF-TEST]%' GROUP BY department
UNION ALL
SELECT 'hazards - by status', status, COUNT(*)
FROM hazards WHERE title LIKE '[PERF-TEST]%' GROUP BY status;

-- ============================================================
-- 8. 清理命令（测试完成后执行）
-- ============================================================
--
-- 如需清除所有性能测试数据，执行以下命令：
--
--   DELETE FROM alerts    WHERE message LIKE '[PERF-TEST]%';
--   DELETE FROM personnel WHERE name    LIKE '[PERF-TEST]%';
--   DELETE FROM hazards   WHERE title   LIKE '[PERF-TEST]%';
--   DELETE FROM accidents WHERE title   LIKE '[PERF-TEST]%';
--   ANALYZE hazards, accidents, personnel, alerts;
--
-- 或执行独立的清理脚本：
--   psql -U hse_app -d safety_dashboard -c "
--     DELETE FROM alerts    WHERE message LIKE '[PERF-TEST]%';
--     DELETE FROM personnel WHERE name    LIKE '[PERF-TEST]%';
--     DELETE FROM hazards   WHERE title   LIKE '[PERF-TEST]%';
--     DELETE FROM accidents WHERE title   LIKE '[PERF-TEST]%';
--     ANALYZE hazards, accidents, personnel, alerts;
--   "
--
-- ============================================================
