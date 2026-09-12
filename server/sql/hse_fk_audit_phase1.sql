-- ============================================================
-- FK 审计 Phase 1：培训 + 三违 + 目标责任模块
-- 目的：检查孤儿引用，为 FK 创建做准备
-- 执行方式：只读查询，不修改任何数据
-- 日期：2026-07-30
-- 孤儿定义（精确，对应 FK 实际阻断条件）：
--   引用列的值在父表主键中【完全不存在】（任意 is_deleted 状态均视为存在）。
--   注：相较 Phase 2 的 is_deleted=false 过滤，此处改为"id 不存在即孤儿"，
--       可避免把指向已软删除员工的【合法引用】误判为孤儿而错误 SET NULL。
--       这直接对应 ADD CONSTRAINT 时 FK 引擎的校验逻辑。
-- ============================================================

-- ========================
-- 1. 培训模块 (8 个 FK)
-- ========================

-- 1.1 training_record.employee_id
SELECT 'training_record.employee_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM training_record t
LEFT JOIN employee e ON t.employee_id = e.id
WHERE t.employee_id IS NOT NULL AND e.id IS NULL;

-- 1.2 training_record.position_id
SELECT 'training_record.position_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM training_record t
LEFT JOIN position p ON t.position_id = p.id
WHERE t.position_id IS NOT NULL AND p.id IS NULL;

-- 1.3 employee_induction_training.employee_id
SELECT 'employee_induction_training.employee_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM employee_induction_training t
LEFT JOIN employee e ON t.employee_id = e.id
WHERE t.employee_id IS NOT NULL AND e.id IS NULL;

-- 1.4 employee_induction_training.position_id
SELECT 'employee_induction_training.position_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM employee_induction_training t
LEFT JOIN position p ON t.position_id = p.id
WHERE t.position_id IS NOT NULL AND p.id IS NULL;

-- 1.5 employee_training_status.employee_id
SELECT 'employee_training_status.employee_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM employee_training_status t
LEFT JOIN employee e ON t.employee_id = e.id
WHERE t.employee_id IS NOT NULL AND e.id IS NULL;

-- 1.6 employee_training_status.position_id
SELECT 'employee_training_status.position_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM employee_training_status t
LEFT JOIN position p ON t.position_id = p.id
WHERE t.position_id IS NOT NULL AND p.id IS NULL;

-- 1.7 position_training_requirement.position_id
SELECT 'position_training_requirement.position_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM position_training_requirement t
LEFT JOIN position p ON t.position_id = p.id
WHERE t.position_id IS NOT NULL AND p.id IS NULL;

-- 1.8 position_safety_profile.position_id
SELECT 'position_safety_profile.position_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM position_safety_profile t
LEFT JOIN position p ON t.position_id = p.id
WHERE t.position_id IS NOT NULL AND p.id IS NULL;

-- ========================
-- 2. 三违模块 (4 个 FK)
-- ========================

-- 2.1 violation_records.violator_id
SELECT 'violation_records.violator_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM violation_records t
LEFT JOIN employee e ON t.violator_id = e.id
WHERE t.violator_id IS NOT NULL AND e.id IS NULL;

-- 2.2 violation_records.inspector_id
SELECT 'violation_records.inspector_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM violation_records t
LEFT JOIN employee e ON t.inspector_id = e.id
WHERE t.inspector_id IS NOT NULL AND e.id IS NULL;

-- 2.3 violation_records.handler_id
SELECT 'violation_records.handler_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM violation_records t
LEFT JOIN employee e ON t.handler_id = e.id
WHERE t.handler_id IS NOT NULL AND e.id IS NULL;

-- 2.4 violation_records.punisher_id
SELECT 'violation_records.punisher_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM violation_records t
LEFT JOIN employee e ON t.punisher_id = e.id
WHERE t.punisher_id IS NOT NULL AND e.id IS NULL;

-- ========================
-- 3. 目标责任模块 (10 个 FK)
-- ========================

-- 3.1 safety_goals.responsible_person_id
SELECT 'safety_goals.responsible_person_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM safety_goals t
LEFT JOIN employee e ON t.responsible_person_id = e.id
WHERE t.responsible_person_id IS NOT NULL AND e.id IS NULL;

-- 3.2 hse_target_contracts.signer_employee_id
SELECT 'hse_target_contracts.signer_employee_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_target_contracts t
LEFT JOIN employee e ON t.signer_employee_id = e.id
WHERE t.signer_employee_id IS NOT NULL AND e.id IS NULL;

-- 3.3 hse_target_contracts.signee_employee_id
SELECT 'hse_target_contracts.signee_employee_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_target_contracts t
LEFT JOIN employee e ON t.signee_employee_id = e.id
WHERE t.signee_employee_id IS NOT NULL AND e.id IS NULL;

-- 3.4 hse_target_contracts.org_unit_id
SELECT 'hse_target_contracts.org_unit_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_target_contracts t
LEFT JOIN hse_org_unit o ON t.org_unit_id = o.id
WHERE t.org_unit_id IS NOT NULL AND o.id IS NULL;

-- 3.5 hse_safety_committee.employee_id
SELECT 'hse_safety_committee.employee_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_safety_committee t
LEFT JOIN employee e ON t.employee_id = e.id
WHERE t.employee_id IS NOT NULL AND e.id IS NULL;

-- 3.6 hse_safety_committee.org_unit_id
SELECT 'hse_safety_committee.org_unit_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_safety_committee t
LEFT JOIN hse_org_unit o ON t.org_unit_id = o.id
WHERE t.org_unit_id IS NOT NULL AND o.id IS NULL;

-- 3.7 hse_responsibility_assessment.employee_id
SELECT 'hse_responsibility_assessment.employee_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_responsibility_assessment t
LEFT JOIN employee e ON t.employee_id = e.id
WHERE t.employee_id IS NOT NULL AND e.id IS NULL;

-- 3.8 hse_responsibility_assessment.org_unit_id
SELECT 'hse_responsibility_assessment.org_unit_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_responsibility_assessment t
LEFT JOIN hse_org_unit o ON t.org_unit_id = o.id
WHERE t.org_unit_id IS NOT NULL AND o.id IS NULL;

-- 3.9 hse_safety_budget.org_unit_id
SELECT 'hse_safety_budget.org_unit_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_safety_budget t
LEFT JOIN hse_org_unit o ON t.org_unit_id = o.id
WHERE t.org_unit_id IS NOT NULL AND o.id IS NULL;

-- 3.10 hse_safety_budget.responsible_employee_id
SELECT 'hse_safety_budget.responsible_employee_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_safety_budget t
LEFT JOIN employee e ON t.responsible_employee_id = e.id
WHERE t.responsible_employee_id IS NOT NULL AND e.id IS NULL;

-- ========================
-- 4. 汇总
-- ========================

SELECT 'TOTAL_ORPHAN' AS summary,
       (
         (SELECT COUNT(*) FROM training_record t LEFT JOIN employee e ON t.employee_id=e.id WHERE t.employee_id IS NOT NULL AND e.id IS NULL)
       + (SELECT COUNT(*) FROM training_record t LEFT JOIN position p ON t.position_id=p.id WHERE t.position_id IS NOT NULL AND p.id IS NULL)
       + (SELECT COUNT(*) FROM employee_induction_training t LEFT JOIN employee e ON t.employee_id=e.id WHERE t.employee_id IS NOT NULL AND e.id IS NULL)
       + (SELECT COUNT(*) FROM employee_induction_training t LEFT JOIN position p ON t.position_id=p.id WHERE t.position_id IS NOT NULL AND p.id IS NULL)
       + (SELECT COUNT(*) FROM employee_training_status t LEFT JOIN employee e ON t.employee_id=e.id WHERE t.employee_id IS NOT NULL AND e.id IS NULL)
       + (SELECT COUNT(*) FROM employee_training_status t LEFT JOIN position p ON t.position_id=p.id WHERE t.position_id IS NOT NULL AND p.id IS NULL)
       + (SELECT COUNT(*) FROM position_training_requirement t LEFT JOIN position p ON t.position_id=p.id WHERE t.position_id IS NOT NULL AND p.id IS NULL)
       + (SELECT COUNT(*) FROM position_safety_profile t LEFT JOIN position p ON t.position_id=p.id WHERE t.position_id IS NOT NULL AND p.id IS NULL)
       + (SELECT COUNT(*) FROM violation_records t LEFT JOIN employee e ON t.violator_id=e.id WHERE t.violator_id IS NOT NULL AND e.id IS NULL)
       + (SELECT COUNT(*) FROM violation_records t LEFT JOIN employee e ON t.inspector_id=e.id WHERE t.inspector_id IS NOT NULL AND e.id IS NULL)
       + (SELECT COUNT(*) FROM violation_records t LEFT JOIN employee e ON t.handler_id=e.id WHERE t.handler_id IS NOT NULL AND e.id IS NULL)
       + (SELECT COUNT(*) FROM violation_records t LEFT JOIN employee e ON t.punisher_id=e.id WHERE t.punisher_id IS NOT NULL AND e.id IS NULL)
       + (SELECT COUNT(*) FROM safety_goals t LEFT JOIN employee e ON t.responsible_person_id=e.id WHERE t.responsible_person_id IS NOT NULL AND e.id IS NULL)
       + (SELECT COUNT(*) FROM hse_target_contracts t LEFT JOIN employee e ON t.signer_employee_id=e.id WHERE t.signer_employee_id IS NOT NULL AND e.id IS NULL)
       + (SELECT COUNT(*) FROM hse_target_contracts t LEFT JOIN employee e ON t.signee_employee_id=e.id WHERE t.signee_employee_id IS NOT NULL AND e.id IS NULL)
       + (SELECT COUNT(*) FROM hse_target_contracts t LEFT JOIN hse_org_unit o ON t.org_unit_id=o.id WHERE t.org_unit_id IS NOT NULL AND o.id IS NULL)
       + (SELECT COUNT(*) FROM hse_safety_committee t LEFT JOIN employee e ON t.employee_id=e.id WHERE t.employee_id IS NOT NULL AND e.id IS NULL)
       + (SELECT COUNT(*) FROM hse_safety_committee t LEFT JOIN hse_org_unit o ON t.org_unit_id=o.id WHERE t.org_unit_id IS NOT NULL AND o.id IS NULL)
       + (SELECT COUNT(*) FROM hse_responsibility_assessment t LEFT JOIN employee e ON t.employee_id=e.id WHERE t.employee_id IS NOT NULL AND e.id IS NULL)
       + (SELECT COUNT(*) FROM hse_responsibility_assessment t LEFT JOIN hse_org_unit o ON t.org_unit_id=o.id WHERE t.org_unit_id IS NOT NULL AND o.id IS NULL)
       + (SELECT COUNT(*) FROM hse_safety_budget t LEFT JOIN hse_org_unit o ON t.org_unit_id=o.id WHERE t.org_unit_id IS NOT NULL AND o.id IS NULL)
       + (SELECT COUNT(*) FROM hse_safety_budget t LEFT JOIN employee e ON t.responsible_employee_id=e.id WHERE t.responsible_employee_id IS NOT NULL AND e.id IS NULL)
       ) AS orphan_count;
