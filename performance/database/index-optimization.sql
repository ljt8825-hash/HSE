-- ============================================================
-- index-optimization.sql — 宁津环卫 HSE 安全管理系统 v4.1
-- 索引优化建议与创建脚本
-- ============================================================
--
-- 目标数据库: safety_dashboard
-- 执行用户:   hse_app（需要对应表的 CREATE INDEX 权限）
-- 用途:       提升高频查询性能、减少全表扫描
--
-- 使用方式:
--   psql -U hse_app -d safety_dashboard -f performance/database/index-optimization.sql
--
-- 策略:
--   1. 复合索引: 覆盖 WHERE + ORDER BY 组合查询
--   2. 部分索引: 仅索引常用过滤条件的子集，减少索引体积
--   3. 表达式索引: 支持大小写不敏感搜索、函数查询
--   4. GIN 索引: 加速全文搜索（ts_vector）
--   5. BRIN 索引: 适合时间序列大表的范围查询
--
-- 注意事项:
--   - 所有索引使用 IF NOT EXISTS 避免重复创建
--   - 索引创建可能需要较长时间（大表场景）
--   - 建议在非高峰期执行
--   - 每个索引附有说明，请根据实际查询模式选择性创建
-- ============================================================

\timing on
\pset pager off

-- ============================================================
-- 1. 复合索引 (Composite Indexes)
-- ============================================================
-- 用途: 覆盖常见的 WHERE + ORDER BY 组合查询
-- 原则: 最常用的等值条件列在前，范围/排序列在后
-- ============================================================

-- 1.1 hazards 表：按部门 + 状态筛选，按创建时间倒序
-- 场景: 部门隐患管理页面，筛选某部门某状态的隐患并按时间排序
CREATE INDEX IF NOT EXISTS idx_hazards_dept_status_created
  ON hazards (department, status, created_at DESC);
-- 查询示例:
--   SELECT * FROM hazards WHERE department = '安全部' AND status = '待审核' ORDER BY created_at DESC LIMIT 20;

-- 1.2 hazards 表：按等级 + 状态筛选
-- 场景: 按隐患等级过滤待处理项
CREATE INDEX IF NOT EXISTS idx_hazards_level_status
  ON hazards (level, status);
-- 查询示例:
--   SELECT * FROM hazards WHERE level = '重大' AND status = '整改中';

-- 1.3 hazards 表：按状态筛选，按创建时间倒序
-- 场景: 全局待处理隐患列表（最常见的首页查询）
CREATE INDEX IF NOT EXISTS idx_hazards_status_created
  ON hazards (status, created_at DESC);
-- 查询示例:
--   SELECT * FROM hazards WHERE status IN ('待审核', '整改中') ORDER BY created_at DESC LIMIT 20;

-- 1.4 accidents 表：按类型 + 等级筛选，按创建时间倒序
-- 场景: 事故统计分析，按类型和等级筛选
CREATE INDEX IF NOT EXISTS idx_accidents_type_level_created
  ON accidents (type, level, created_at DESC);
-- 查询示例:
--   SELECT * FROM accidents WHERE type = '火灾' AND level = '重大' ORDER BY created_at DESC;

-- 1.5 accidents 表：按部门 + 创建时间倒序
-- 场景: 部门事故记录查询
CREATE INDEX IF NOT EXISTS idx_accidents_dept_created
  ON accidents (department, created_at DESC);
-- 查询示例:
--   SELECT * FROM accidents WHERE department = '生产部' ORDER BY created_at DESC LIMIT 50;

-- 1.6 personnel 表：按部门 + 职位
-- 场景: 人员花名册，按部门和职位筛选
CREATE INDEX IF NOT EXISTS idx_personnel_dept_position
  ON personnel (department, position);
-- 查询示例:
--   SELECT * FROM personnel WHERE department = '安全部' AND position = '安全员';

-- 1.7 personnel 表：按部门 + 状态
-- 场景: 查询某部门所有在职人员
CREATE INDEX IF NOT EXISTS idx_personnel_dept_status
  ON personnel (department, status);
-- 查询示例:
--   SELECT * FROM personnel WHERE department = '生产部' AND status = '在职';

-- 1.8 alerts 表：按等级 + 状态筛选，按创建时间倒序
-- 场景: 告警中心，查看某等级某状态的最新告警
CREATE INDEX IF NOT EXISTS idx_alerts_level_status_created
  ON alerts (level, status, created_at DESC);
-- 查询示例:
--   SELECT * FROM alerts WHERE level = '紧急' AND status = '未处理' ORDER BY created_at DESC;

-- 1.9 alerts 表：按状态 + 创建时间
-- 场景: 查看所有未处理告警
CREATE INDEX IF NOT EXISTS idx_alerts_status_created
  ON alerts (status, created_at DESC);
-- 查询示例:
--   SELECT * FROM alerts WHERE status = '未处理' ORDER BY created_at DESC LIMIT 20;

-- ============================================================
-- 2. 部分索引 (Partial Indexes)
-- ============================================================
-- 用途: 仅索引满足过滤条件的行，大幅减少索引体积
-- 优势: 查询条件匹配时效率极高，且不增加不常用数据的写入开销
-- ============================================================

-- 2.1 仅索引活跃（未关闭）的隐患
-- 场景: 首页待处理面板通常只关心未关闭的隐患
CREATE INDEX IF NOT EXISTS idx_hazards_active_status
  ON hazards (status, created_at DESC)
  WHERE status IN ('待审核', '整改中', '待验收');
-- 查询示例:
--   SELECT * FROM hazards WHERE status IN ('待审核', '整改中', '待验收') ORDER BY created_at DESC;
-- 效果: 索引体积仅为全量索引的约 60%（假设 40% 已关闭）

-- 2.2 仅索引未处理的告警
-- 场景: 实时告警面板只显示未处理的告警
CREATE INDEX IF NOT EXISTS idx_alerts_unprocessed
  ON alerts (level, created_at DESC)
  WHERE status = '未处理';
-- 查询示例:
--   SELECT * FROM alerts WHERE status = '未处理' ORDER BY level, created_at DESC;
-- 效果: 索引体积随告警处理进度自动缩小

-- 2.3 仅索引在职人员
-- 场景: 人员选择器默认只显示在职人员
CREATE INDEX IF NOT EXISTS idx_personnel_active
  ON personnel (department, position)
  WHERE status = '在职';
-- 查询示例:
--   SELECT * FROM personnel WHERE status = '在职' AND department = '安全部';
-- 效果: 避免为离职/休假人员维护不必要的索引条目

-- 2.4 仅索引重大/较大的隐患
-- 场景: 重大隐患监控面板
CREATE INDEX IF NOT EXISTS idx_hazards_critical
  ON hazards (department, status, created_at DESC)
  WHERE level IN ('重大', '较大');
-- 查询示例:
--   SELECT * FROM hazards WHERE level IN ('重大', '较大') AND department = '生产部';

-- ============================================================
-- 3. 表达式索引 (Expression Indexes)
-- ============================================================
-- 用途: 支持函数变换后的高效查询
-- 场景: 大小写不敏感搜索、模糊匹配
-- ============================================================

-- 3.1 hazards 表标题的小写索引
-- 场景: 用户输入搜索时忽略大小写
CREATE INDEX IF NOT EXISTS idx_hazards_title_lower
  ON hazards (LOWER(title));
-- 查询示例:
--   SELECT * FROM hazards WHERE LOWER(title) LIKE '%消防%';

-- 3.2 hazards 表描述的全文搜索向量（见 GIN 索引部分）

-- 3.3 personnel 表姓名的小写索引
-- 场景: 人员搜索时忽略大小写
CREATE INDEX IF NOT EXISTS idx_personnel_name_lower
  ON personnel (LOWER(name));
-- 查询示例:
--   SELECT * FROM personnel WHERE LOWER(name) LIKE '%张%';

-- 3.4 personnel 表电话号码索引
-- 场景: 按电话号码快速查找人员
CREATE INDEX IF NOT EXISTS idx_personnel_phone
  ON personnel (phone);
-- 查询示例:
--   SELECT * FROM personnel WHERE phone = '13800138000';

-- 3.5 accidents 表标题的小写索引
CREATE INDEX IF NOT EXISTS idx_accidents_title_lower
  ON accidents (LOWER(title));
-- 查询示例:
--   SELECT * FROM accidents WHERE LOWER(title) LIKE '%火灾%';

-- 3.6 alerts 表消息的小写索引
CREATE INDEX IF NOT EXISTS idx_alerts_message_lower
  ON alerts (LOWER(message));
-- 查询示例:
--   SELECT * FROM alerts WHERE LOWER(message) LIKE '%超压%';

-- ============================================================
-- 4. GIN 索引 (Generalized Inverted Index)
-- ============================================================
-- 用途: 全文搜索（ts_vector）和 JSON/JSONB 数据的高效查询
-- 优势: 支持全文检索、包含查询、前缀匹配
-- ============================================================

-- 4.1 hazards 表的全文搜索索引
-- 场景: 在隐患标题和描述中进行全文搜索
-- 注意: 需要先添加 ts_vector 列或使用表达式索引
CREATE INDEX IF NOT EXISTS idx_hazards_fts
  ON hazards USING gin (
    to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(description, ''))
  );
-- 查询示例:
--   SELECT * FROM hazards
--   WHERE to_tsvector('simple', title || ' ' || description) @@ to_tsquery('simple', '消防 & 隐患');
-- 替代方案（更灵活，支持中文）:
--   SELECT * FROM hazards
--   WHERE title || ' ' || description LIKE '%消防%';

-- 4.2 accidents 表的全文搜索索引
CREATE INDEX IF NOT EXISTS idx_accidents_fts
  ON accidents USING gin (
    to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(description, ''))
  );
-- 查询示例:
--   SELECT * FROM accidents
--   WHERE to_tsvector('simple', title || ' ' || description) @@ to_tsquery('simple', '爆炸');

-- ============================================================
-- 5. BRIN 索引 (Block Range Index)
-- ============================================================
-- 用途: 大表的时间范围查询，索引体积极小
-- 适用条件: 数据按时间物理排序（即 created_at 与表的物理顺序相关）
-- 优势: 索引大小通常只有 B-tree 的 1/100 到 1/1000
-- ============================================================

-- 5.1 hazards 表按创建时间的 BRIN 索引
-- 场景: 按时间范围查询隐患（如月度统计、年度报告）
-- 条件: 数据按 created_at 近似排序
CREATE INDEX IF NOT EXISTS idx_hazards_created_brin
  ON hazards USING brin (created_at)
  WITH (pages_per_range = 32);
-- 查询示例:
--   SELECT * FROM hazards WHERE created_at BETWEEN '2026-01-01' AND '2026-06-30';
-- 说明: pages_per_range=32 表示每个 BRIN 块覆盖 32 个数据页（默认 128）
--       较小的值提供更精确的范围过滤，但索引稍大

-- 5.2 accidents 表按创建时间的 BRIN 索引
CREATE INDEX IF NOT EXISTS idx_accidents_created_brin
  ON accidents USING brin (created_at)
  WITH (pages_per_range = 32);
-- 查询示例:
--   SELECT * FROM accidents WHERE created_at >= NOW() - INTERVAL '30 days';

-- 5.3 alerts 表按创建时间的 BRIN 索引
CREATE INDEX IF NOT EXISTS idx_alerts_created_brin
  ON alerts USING brin (created_at)
  WITH (pages_per_range = 32);
-- 查询示例:
--   SELECT * FROM alerts WHERE created_at >= NOW() - INTERVAL '7 days';

-- ============================================================
-- 6. 更新统计信息
-- ============================================================
-- 索引创建后必须 ANALYZE，让查询规划器了解新的索引分布
ANALYZE hazards;
ANALYZE accidents;
ANALYZE personnel;
ANALYZE alerts;

-- ============================================================
-- 7. 索引效果验证
-- ============================================================

-- 7.1 查看所有用户索引及其大小
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  idx_scan AS times_used,
  CASE index_type
    WHEN 'btree' THEN 'B-Tree'
    WHEN 'gin' THEN 'GIN'
    WHEN 'brin' THEN 'BRIN'
    ELSE index_type
  END AS index_type
FROM pg_stat_user_indexes si
JOIN pg_index pi ON pi.indexrelid = si.indexrelid
JOIN pg_am am ON am.oid = pi.relam
WHERE si.schemaname = 'public'
  AND si.tablename IN ('hazards', 'accidents', 'personnel', 'alerts')
ORDER BY si.tablename, pg_relation_size(si.indexrelid) DESC;

-- 7.2 验证复合索引是否被查询计划使用
-- EXPLAIN ANALYZE 以下查询，确认使用了预期的索引
--（请手动执行，验证索引效果）

-- 验证 hazards 部门+状态+时间索引
-- EXPLAIN ANALYZE
--   SELECT * FROM hazards
--   WHERE department = '安全部' AND status = '待审核'
--   ORDER BY created_at DESC LIMIT 20;

-- 验证 alerts 等级+状态+时间索引
-- EXPLAIN ANALYZE
--   SELECT * FROM alerts
--   WHERE level = '紧急' AND status = '未处理'
--   ORDER BY created_at DESC LIMIT 20;

-- 验证部分索引（仅活跃隐患）
-- EXPLAIN ANALYZE
--   SELECT * FROM hazards
--   WHERE status IN ('待审核', '整改中', '待验收')
--   ORDER BY created_at DESC LIMIT 20;

-- 验证 BRIN 索引（时间范围查询）
-- EXPLAIN ANALYZE
--   SELECT * FROM hazards
--   WHERE created_at BETWEEN '2026-01-01' AND '2026-06-30';

-- 验证表达式索引（大小写不敏感搜索）
-- EXPLAIN ANALYZE
--   SELECT * FROM hazards
--   WHERE LOWER(title) LIKE '%消防%';

-- ============================================================
-- 索引效果汇总
-- ============================================================
SELECT
  'Index Optimization Complete' AS status,
  COUNT(*) AS total_indexes,
  pg_size_pretty(SUM(pg_relation_size(indexrelid))) AS total_index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('hazards', 'accidents', 'personnel', 'alerts');
