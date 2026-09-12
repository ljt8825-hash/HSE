-- ============================================================
-- HSE 三违管理 · 阶段2a 数据治理地基：新增「查处来源」字段
-- 版本：v1.0
-- 日期：2026-08-30
-- 数据库：PostgreSQL（safety_dashboard）
-- 依据：docs/rule-engine-design/提示词-02-阶段1.5收口加固与三违数据治理地基.md 第 4 节 B1
--
-- 背景（2026-08-30 连库实测，violation_records 有效数据 2506 行）：
--   * 现有字段中**没有**任何可表达「查处来源/检查层级」的列：
--       - violation_level / punishment_type / violation_type_result 全为空值；
--       - grid_level（三级/二级/一级/总网格长）、position（管理员/乡镇作业中心经理…）
--         描述的是**违规人**的属性，而非**查处方**的属性，不可复用；
--       - inspector_name 有数据（王春海/于会枝…）但 inspector_id 全部为 NULL，
--         无法程序化判定该检查人代表公司还是乡镇，不能作为可靠依据。
--   * 因此三违「公司查处 5 分/次、其余 1 分/次」的计分口径无法落地，必须新增本字段。
--
-- 设计：
--   check_source VARCHAR(20)，字典值见下方 COMMENT。
--   **不批量回填历史数据**（无可靠推断依据），历史行保持 NULL，
--   由阶段3 适配器按业务约定对 NULL 做保守处理（见 COMMENT 与执行报告）。
--
-- 约束：
--   * 可重复执行（ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS）
--   * 全程事务包裹，失败自动回滚
--   * 零评分行为变化：不写 hse_assessment_deduction，不触发任何扣分
--
-- 执行前务必备份：
--   pg_dump -h 127.0.0.1 -p 5432 -U hse_app -d safety_dashboard -Fc -f <时间戳>.dump
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 新增「查处来源」列
-- ============================================================
ALTER TABLE violation_records ADD COLUMN IF NOT EXISTS check_source VARCHAR(20);

COMMENT ON COLUMN violation_records.check_source IS
  '查处来源（阶段2a 新增，用于阶段3 三违扣分分级计分）。字典值：'
  'company=公司查处（阶段3 计 5 分/次）；'
  'township=乡镇/管理区及以下查处（计 1 分/次）；'
  'self=自查自纠（计 1 分/次）；'
  'NULL=未标注（历史数据默认，阶段3 按 1 分保守处理或不计，待业务确认）。'
  '本轮不批量回填历史值。';

-- ============================================================
-- 2. 部分索引：只索引有效行，便于按来源筛选与统计
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_violation_check_source
    ON violation_records (check_source)
    WHERE is_deleted IS NOT TRUE;

-- ============================================================
-- 3. 规则库：追加三违治理进度备注
--    仅更新 integration_note；integration_status 保持 pending_data 不变
--    —— 查处来源字段虽已就绪，但违规人关联率仅 84.86%（< 90% 门槛），
--       阶段3 适配器仍需等待人员关联修复（详见执行报告-02 第 3 节）。
-- ============================================================
UPDATE hse_assessment_rule
   SET integration_note = '已增查处来源字段（violation_records.check_source：公司查处/乡镇查处/自查自纠），待人员关联修复后阶段3 接入',
       updated_at = NOW()
 WHERE rule_code IN ('VIOLATION001', 'VIOLATION002', 'VIOLATION003')
   AND is_deleted = FALSE;

COMMIT;

-- ============================================================
-- 3. 自检（人工执行核对用，非事务内）
-- ============================================================
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'violation_records' AND column_name = 'check_source';
-- 期望：check_source | character varying | YES
--
-- SELECT count(*) AS total,
--        count(*) FILTER (WHERE check_source IS NULL) AS null_cnt
--   FROM violation_records WHERE is_deleted IS NOT TRUE;
-- 期望：total=2506 且 null_cnt=2506（历史数据未被污染）
