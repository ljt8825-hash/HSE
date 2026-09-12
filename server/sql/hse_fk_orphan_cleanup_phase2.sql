-- ============================================================
-- FK Phase 2 遗留孤儿清洗脚本（实勘修正版）
-- 日期：2026-07-30
-- 实勘修正（相对提示词原文，关键）：
--   1) hse_deduction_adjustment / hse_assessment_audit_log 两张表【均无 is_deleted 列】。
--      → 提示词"软删除孤儿置 NULL"分支无可匹配行（无软删除机制），原 UPDATE 语句
--        既引用了不存在的 is_deleted 列（会报错），又对 NOT NULL 列执行 SET NULL（违反约束）。
--   2) adjusted_by / operator_id 均为 NOT NULL。
--      → 按红线【NOT NULL 活跃孤儿不得强制 SET NULL，必须标记人工介入】。
--   3) 因此本脚本【不执行任何数据修改】，仅做门控核查并输出人工介入提示。
--      若确需清洗，须业务方决策二选一（均属 schema/数据变更，须单独评审，不在本脚本自动执行）：
--        (a) 恢复被引用的 employee 记录（使引用重新有效，重建 FK 即可）；
--        (b) 先 ALTER TABLE ... ALTER COLUMN <col> DROP NOT NULL，再 UPDATE <col>=NULL 置空；
--      上述二者均不在本轮自动执行，避免盲洗与违反红线。
-- 前置：hse_fk_orphan_detail_phase2.sql 探查完成 + pg_dump 全库备份。
-- ============================================================

DO $$
DECLARE
    v_adj INTEGER;
    v_op  INTEGER;
BEGIN
    SELECT count(*) INTO v_adj
    FROM hse_deduction_adjustment a
    LEFT JOIN employee e ON a.adjusted_by = e.id AND e.is_deleted = false
    WHERE a.adjusted_by IS NOT NULL AND e.id IS NULL;

    SELECT count(*) INTO v_op
    FROM hse_assessment_audit_log l
    LEFT JOIN employee e ON l.operator_id = e.id AND e.is_deleted = false
    WHERE l.operator_id IS NOT NULL AND e.id IS NULL;

    RAISE NOTICE '=== 清洗门控结果（两表均无 is_deleted 列，所有孤儿均为活跃 NOT NULL）===';
    RAISE NOTICE 'hse_deduction_adjustment.adjusted_by 活跃孤儿数 = %（NOT NULL，需人工介入，未修改数据）', v_adj;
    RAISE NOTICE 'hse_assessment_audit_log.operator_id 活跃孤儿数 = %（NOT NULL，需人工介入，未修改数据）', v_op;
    RAISE NOTICE '本脚本未执行任何 UPDATE：NOT NULL 活跃孤儿不得强制 SET NULL（红线约束）。';
    RAISE NOTICE 'FK 补建（fk_deduction_adjust_adjusted_by / fk_assessment_audit_operator）本轮跳过，待人工决策后执行。';
END $$;
