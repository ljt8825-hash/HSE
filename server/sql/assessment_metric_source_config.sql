-- ============================================================================
-- HSE 月度安全履职考核 · 指标取数配置表
-- ----------------------------------------------------------------------------
-- 目的：把 assessmentScoringEngine.js 中硬编码的 FILL_SOURCES 对象抽出为配置，
--       使「评分需要从各业务模块取数」这一耦合从「写死在代码里」变成「插一行配置」。
--       新增评分数据源（保险 / 转运站 / 隐患 …）只 INSERT 一行，无需改动引擎。
--
-- 关联：hse_assessment_metric(metric_code)
-- 生效库：safety_dashboard_dev（严禁在生产库直跑，生产需走计划任务 + 显式授权）
-- 幂等：建表 IF NOT EXISTS；seed 用 WHERE NOT EXISTS 避免重复
-- 现有语义：seed 仅 training 一行 = 代码中原 FILL_SOURCES.training 的逐字节口径。
--           事故否决（一票否决）已于 2026-10-13 口径清理移出本配置表：自 2026-09-05 起由规则引擎
--           accidentVetoAdapter（METRIC_CODE=HSE-KPI-NEG-004）独家承担，生产零 NEG-001/002/003 数据，
--           故本表不再 seed accident 源，从根本上杜绝「config/legacy 与规则引擎并存 → 同事故双扣」陷阱。
-- ============================================================================

CREATE TABLE IF NOT EXISTS hse_assessment_metric_source (
  id            BIGSERIAL PRIMARY KEY,
  metric_code   VARCHAR(64)  NOT NULL,                       -- 关联 hse_assessment_metric.metric_code（默认/兜底指标）
  source_name   VARCHAR(64)  NOT NULL UNIQUE,                -- 唯一键，如 'training' / 'accident'
  source_type   VARCHAR(16)  NOT NULL DEFAULT 'sql',         -- sql(直查业务表) | service(调某 service 函数,预留)
  source_table  VARCHAR(64),                                 -- sql 类型：业务表名
  filter_expr   TEXT,                                        -- sql 类型：WHERE 片段，占位 $1=employeeId $2=start $3=end
  agg_type      VARCHAR(16)  NOT NULL DEFAULT 'row',         -- row(逐行生成明细) | count | sum
  value_column  VARCHAR(64),                                 -- sum 类型时取值列
  fixed_score   NUMERIC(10,2),                               -- row 类型时每行固定扣分
  is_veto       BOOLEAN      NOT NULL DEFAULT FALSE,         -- 是否否决项（命中则总分归 0）
  map_column    VARCHAR(64),                                 -- 否决项：按该列值映射到 metric_code
  veto_metric_map JSONB,                                     -- 否决项：{ 列值: metric_code, "default": metric_code }
  item_template VARCHAR(128),                                -- 扣分明细文案模板，支持 {列名} 占位替换
  enabled       BOOLEAN      NOT NULL DEFAULT TRUE,          -- 开关，对应原 LEGACY_FILL_ENABLED（env 可最终覆盖）
  sort_order    INT          NOT NULL DEFAULT 0,
  is_deleted    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metric_source_code
  ON hse_assessment_metric_source (metric_code);
CREATE INDEX IF NOT EXISTS idx_metric_source_enabled
  ON hse_assessment_metric_source (enabled) WHERE enabled AND NOT is_deleted;

-- ----------------------------------------------------------------------------
-- Seed 1：培训不合格（原 FILL_SOURCES.training）
--   来源表 training_records，条件 result='不合格'，每行固定扣 3 分，指标 HSE-KPI-TRN-002
-- ----------------------------------------------------------------------------
INSERT INTO hse_assessment_metric_source
  (metric_code, source_name, source_type, source_table, filter_expr,
   agg_type, fixed_score, is_veto, item_template, enabled, sort_order)
SELECT
  'HSE-KPI-TRN-002', 'training', 'sql', 'training_records',
  'employee_id = $1 AND result = ''不合格'' AND training_date >= $2 AND training_date <= $3 AND is_deleted = FALSE',
  'row', 3, FALSE, '培训不合格1次', TRUE, 10
WHERE NOT EXISTS (
  SELECT 1 FROM hse_assessment_metric_source WHERE source_name = 'training'
);

-- ----------------------------------------------------------------------------
-- Seed 2（已移除，2026-10-13 口径清理）：事故否决源不再 seed 到本配置表。
--   原因：事故否决（一票否决 100 分）自 2026-09-05 起由规则引擎 accidentVetoAdapter
--         （METRIC_CODE=HSE-KPI-NEG-004）独家承担；生产 18 行事故否决记录全部为 NEG-004，
--         本表声称的 NEG-001/002/003 在生产零数据。保留 accident 源会埋下
--         「config/legacy 与规则引擎并存 → 同事故双扣」的陷阱，故彻底移出。
--   既有库（dev/prod）中已存在的 accident 源：用配套迁移 SQL
--         server/sql/assessment_metric_source_remove_accident.sql 将其 is_deleted=TRUE。
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 注：本配置表仅承载「评分需跨模块取数」的数据源（当前仅 training）。
--     事故否决（NEG-004）由规则引擎 accidentVetoAdapter 独家承担，不属于本表职责。
--     引擎 getMetricSources 已对 source_name='accident' 做硬排除，即便本表误 seed 也不会双扣。
--     LEGACY_TRAINING_FILL 环境变量仍控制 training 源（设 false 即停用），LEGACY_ACCIDENT_VETO 已无作用。
-- ----------------------------------------------------------------------------
