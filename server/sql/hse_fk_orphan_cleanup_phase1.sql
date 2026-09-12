-- ============================================================
-- FK Phase 1 孤儿清洗脚本（门控核查版）
-- 日期：2026-07-30
-- 前置：hse_fk_audit_phase1.sql 审计完成 + pg_dump 全库备份
-- 实勘结论：
--   审计发现 5 个列存在孤儿（共 88 行），经 information_schema 核验这 5 列
--   【全部为 NOT NULL】：
--     - employee_induction_training.employee_id   (16 行)
--     - employee_induction_training.position_id   (16 行)
--     - employee_training_status.employee_id     (16 行)
--     - employee_training_status.position_id      (16 行)
--     - position_safety_profile.position_id       (24 行)
--   孤儿取值为 employee 106~181(步长5)/position 35~81(奇数)，均为指向不存在
--   主键的种子/demo 数据（真实 employee id 已为 ~5000+）。
--   按红线【NOT NULL 活跃孤儿不得强制 SET NULL，必须标记人工介入】：
--   本脚本【不执行任何数据修改】，仅做门控核查与人工介入提示。
--   其余 17 个候选列审计孤儿=0，无需清洗。
-- 修复路径（均属数据变更，须业务方单独评审，不在本脚本自动执行）：
--   (a) 业务方补录被引用 employee/position（使引用重新有效）；或
--   (b) 业务方确认这些种子行可废弃后，DELETE 或先 DROP NOT NULL 再 SET NULL；
--   之后重跑 hse_fk_phase1_training_violations_goals.sql 即可建立对应 FK（脚本幂等）。
-- ============================================================

DO $$
DECLARE
    v_it_emp   INTEGER;
    v_it_pos   INTEGER;
    v_ts_emp   INTEGER;
    v_ts_pos   INTEGER;
    v_sp_pos   INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_it_emp FROM employee_induction_training t
      LEFT JOIN employee e ON t.employee_id = e.id
      WHERE t.employee_id IS NOT NULL AND e.id IS NULL;

    SELECT COUNT(*) INTO v_it_pos FROM employee_induction_training t
      LEFT JOIN position p ON t.position_id = p.id
      WHERE t.position_id IS NOT NULL AND p.id IS NULL;

    SELECT COUNT(*) INTO v_ts_emp FROM employee_training_status t
      LEFT JOIN employee e ON t.employee_id = e.id
      WHERE t.employee_id IS NOT NULL AND e.id IS NULL;

    SELECT COUNT(*) INTO v_ts_pos FROM employee_training_status t
      LEFT JOIN position p ON t.position_id = p.id
      WHERE t.position_id IS NOT NULL AND p.id IS NULL;

    SELECT COUNT(*) INTO v_sp_pos FROM position_safety_profile t
      LEFT JOIN position p ON t.position_id = p.id
      WHERE t.position_id IS NOT NULL AND p.id IS NULL;

    RAISE NOTICE '=== Phase 1 清洗门控结果（5 个孤儿列均为 NOT NULL，未修改任何数据）===';
    RAISE NOTICE 'employee_induction_training.employee_id   孤儿数 = % (NOT NULL，需人工介入)', v_it_emp;
    RAISE NOTICE 'employee_induction_training.position_id   孤儿数 = % (NOT NULL，需人工介入)', v_it_pos;
    RAISE NOTICE 'employee_training_status.employee_id     孤儿数 = % (NOT NULL，需人工介入)', v_ts_emp;
    RAISE NOTICE 'employee_training_status.position_id     孤儿数 = % (NOT NULL，需人工介入)', v_ts_pos;
    RAISE NOTICE 'position_safety_profile.position_id      孤儿数 = % (NOT NULL，需人工介入)', v_sp_pos;
    RAISE NOTICE '其余 17 个候选列孤儿=0，无需清洗。';
    RAISE NOTICE '5 条 FK（fk_induction_training_employee / fk_induction_training_position /';
    RAISE NOTICE '  fk_training_status_employee / fk_training_status_position / fk_safety_profile_position）';
    RAISE NOTICE '本轮跳过，待人工决策修复数据后重跑迁移脚本建立。';
END $$;
