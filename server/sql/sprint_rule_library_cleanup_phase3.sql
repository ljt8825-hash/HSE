-- ============================================================
-- 阶段3 · 规则库测试/演示残留清理迁移
-- 文件：server/sql/sprint_rule_library_cleanup_phase3.sql
-- 日期：2026-08-31（提示词-06 任务 B）
-- 目标：软删 hse_assessment_rule 中两条测试/演示残留规则
--        E2E-TEST-001（「E2E测试规则删除我」） / DEMO-SHOW-001（「演示规则-DEMO」）
-- 约束：可重复执行、先备份后软删、有引用断言回滚、不物理删除。
--
-- 执行现状（2026-08-31 实测）：两条残留规则在执行前已 is_deleted=TRUE
--   （疑似此前已手动清理），故本脚本重复执行时 UPDATE 影响 0 行；
--   active（is_deleted=FALSE）规则共 13 条，执行后仍为 13 条（清理目标已达成）。
--   脚本保留「若残留仍为 active 时软删」的语义，确保可重复、幂等、安全。
-- ============================================================

BEGIN;

-- ── 步骤 0：引用断言（有扣分/评分/规则明细引用则报错回滚）────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM hse_assessment_deduction
       WHERE source_detail->>'ruleCode' IN ('E2E-TEST-001','DEMO-SHOW-001')
         AND is_deleted = FALSE) > 0 THEN
    RAISE EXCEPTION '阻断：hse_assessment_deduction 存在两条残留规则的扣分引用，禁止清理';
  END IF;
  IF (SELECT count(*) FROM hse_assessment_score_detail
       WHERE rule_id IN (SELECT id FROM hse_assessment_rule
                         WHERE rule_code IN ('E2E-TEST-001','DEMO-SHOW-001'))) > 0 THEN
    RAISE EXCEPTION '阻断：hse_assessment_score_detail 存在两条残留规则的评分引用，禁止清理';
  END IF;
  IF (SELECT count(*) FROM hse_rule_detail
       WHERE rule_id IN (SELECT id FROM hse_assessment_rule
                         WHERE rule_code IN ('E2E-TEST-001','DEMO-SHOW-001'))) > 0 THEN
    RAISE EXCEPTION '阻断：hse_rule_detail 存在两条残留规则的明细引用，禁止清理';
  END IF;
  IF (SELECT count(*) FROM hse_rule_condition
       WHERE rule_id IN (SELECT id FROM hse_assessment_rule
                         WHERE rule_code IN ('E2E-TEST-001','DEMO-SHOW-001'))) > 0 THEN
    RAISE EXCEPTION '阻断：hse_rule_condition 存在两条残留规则的条件引用，禁止清理';
  END IF;
END $$;

-- ── 步骤 1：备份（幂等：每次重建备份表）──────────────────────────────
DROP TABLE IF EXISTS hse_assessment_rule_bak_phase3_20260831;
CREATE TABLE hse_assessment_rule_bak_phase3_20260831 AS
  SELECT * FROM hse_assessment_rule
   WHERE rule_code IN ('E2E-TEST-001','DEMO-SHOW-001');

-- ── 步骤 2：软删（沿用系统 is_deleted 软删约定；仅对仍为 active 的行生效）──
UPDATE hse_assessment_rule
   SET is_deleted = TRUE,
       status = 'disabled',
       updated_at = NOW()
 WHERE rule_code IN ('E2E-TEST-001','DEMO-SHOW-001')
   AND is_deleted = FALSE;   -- 已软删的行不影响，确保幂等

-- ── 步骤 3：核验（输出执行后 active 计数与备份行）────────────────────
-- SELECT count(*) AS active_total FROM hse_assessment_rule WHERE is_deleted = FALSE;
-- SELECT rule_code, rule_name, status, is_deleted FROM hse_assessment_rule_bak_phase3_20260831;

COMMIT;
