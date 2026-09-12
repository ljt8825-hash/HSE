-- 网格未巡查扣分 · web-naive 上线验收 测试数据清理（round5）
-- 清理范围：仅本轮 web-naive 实测产生的测试痕迹
-- 1) 扣分96(李忠胜) approved→pending
-- 2) 扣分97/98 current_version 回1
-- 3) 目标454 解除 frozen
-- 4) 删除测试调整记录 id 20/21

BEGIN;

-- 1. 扣分96 回 pending（确认分清空、版本回1）
UPDATE hse_assessment_deduction
   SET review_status = 'pending', confirmed_score = NULL, current_version = 1, updated_at = NOW()
 WHERE id = 96;

-- 2. 扣分97/98 版本号回1（已是 pending）
UPDATE hse_assessment_deduction
   SET current_version = 1, updated_at = NOW()
 WHERE id IN (97, 98);

-- 3. 目标454 解除冻结（临时禁用冻结保护触发器）
ALTER TABLE hse_assessment_target DISABLE TRIGGER trg_prevent_frozen_target;
UPDATE hse_assessment_target SET status = 'scored' WHERE id = 454;
ALTER TABLE hse_assessment_target ENABLE TRIGGER trg_prevent_frozen_target;

-- 4. 删除测试调整记录 id 20/21（临时禁用版本链触发器）
ALTER TABLE hse_deduction_adjustment DISABLE TRIGGER trg_prevent_adjustment_update;
DELETE FROM hse_deduction_adjustment WHERE id IN (20, 21);
ALTER TABLE hse_deduction_adjustment ENABLE TRIGGER trg_prevent_adjustment_update;

COMMIT;

-- 校验
SELECT 'deduction96' AS chk, review_status, confirmed_score, current_version FROM hse_assessment_deduction WHERE id = 96
UNION ALL
SELECT 'deduction97', review_status, confirmed_score, current_version FROM hse_assessment_deduction WHERE id = 97
UNION ALL
SELECT 'deduction98', review_status, confirmed_score, current_version FROM hse_assessment_deduction WHERE id = 98;
SELECT id, employee_name, status FROM hse_assessment_target WHERE id = 454;
SELECT count(*) AS adj_remaining FROM hse_deduction_adjustment;
