-- ============================================================
-- 考核周期测试数据物理清理
-- 日期：2026-08-27
-- 清理对象（均为联调/复现产生的测试周期及其子表数据）：
--   第一轮：id 15-18（2026-08~11，软删测试周期）→ score 992 + target 124 + cycle 4
--   第二轮：id 21（2027-01 软删测试）、id 22（2026-08 软删测试，62 targets+496 scores）、
--           cycle 5/9 历史 score 残留（2026-07-24，440*2）→ score 1376 + target 62 + cycle 2
-- 保留：id 24（2026-08 活跃 in_progress 周期，用户数据，含 62 targets）
-- 注意：物理删除不可回滚，执行前已确认目标均为测试数据。
-- ============================================================

-- 第一轮（15-18）
-- DELETE FROM hse_assessment_score  WHERE cycle_id IN (15,16,17,18);
-- DELETE FROM hse_assessment_target WHERE cycle_id IN (15,16,17,18);
-- DELETE FROM hse_assessment_cycle WHERE id IN (15,16,17,18);

-- 第二轮（21/22 + 历史残留 5/9）
-- DELETE FROM hse_assessment_deduction WHERE cycle_id IN (21,22,5,9);
-- DELETE FROM hse_assessment_score    WHERE cycle_id IN (21,22,5,9);
-- DELETE FROM hse_assessment_target   WHERE cycle_id IN (21,22);
-- DELETE FROM hse_assessment_cycle    WHERE id IN (21,22);

-- 最终状态（期望）：
--   cycle: 仅 id 24（活跃）；target: 仅 cycle 24 (62)；score/deduction/adjustment: 空
