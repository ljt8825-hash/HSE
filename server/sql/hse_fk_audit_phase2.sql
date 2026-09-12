-- ============================================================
-- FK 审计 Phase 2：考核 + HSE 核心事件 + employee_assignment
-- 目的：检查孤儿引用，为 FK 创建做准备
-- 执行方式：只读查询，不修改任何数据
-- 日期：2026-07-30
-- ============================================================

-- ========================
-- 1. 考核核心表
-- ========================

-- 1.1 hse_assessment_cycle
SELECT 'hse_assessment_cycle.created_by' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_assessment_cycle c
LEFT JOIN employee e ON c.created_by = e.id AND e.is_deleted = false
WHERE c.created_by IS NOT NULL AND e.id IS NULL;

SELECT 'hse_assessment_cycle.frozen_by' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_assessment_cycle c
LEFT JOIN employee e ON c.frozen_by = e.id AND e.is_deleted = false
WHERE c.frozen_by IS NOT NULL AND e.id IS NULL;

-- 1.2 hse_assessment_target
SELECT 'hse_assessment_target.employee_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_assessment_target t
LEFT JOIN employee e ON t.employee_id = e.id AND e.is_deleted = false
WHERE t.employee_id IS NOT NULL AND e.id IS NULL;

-- 1.3 hse_assessment_deduction
SELECT 'hse_assessment_deduction.violator_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_assessment_deduction d
LEFT JOIN employee e ON d.violator_id = e.id AND e.is_deleted = false
WHERE d.violator_id IS NOT NULL AND e.id IS NULL;

-- 1.4 hse_deduction_adjustment
SELECT 'hse_deduction_adjustment.adjusted_by' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_deduction_adjustment a
LEFT JOIN employee e ON a.adjusted_by = e.id AND e.is_deleted = false
WHERE a.adjusted_by IS NOT NULL AND e.id IS NULL;

SELECT 'hse_deduction_adjustment.reviewed_by' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_deduction_adjustment a
LEFT JOIN employee e ON a.reviewed_by = e.id AND e.is_deleted = false
WHERE a.reviewed_by IS NOT NULL AND e.id IS NULL;

-- 1.5 hse_responsibility_chain
SELECT 'hse_responsibility_chain.subordinate_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_responsibility_chain c
LEFT JOIN employee e ON c.subordinate_id = e.id AND e.is_deleted = false
WHERE c.subordinate_id IS NOT NULL AND e.id IS NULL;

SELECT 'hse_responsibility_chain.manager_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_responsibility_chain c
LEFT JOIN employee e ON c.manager_id = e.id AND e.is_deleted = false
WHERE c.manager_id IS NOT NULL AND e.id IS NULL;

-- 1.6 hse_assessment_audit_log
SELECT 'hse_assessment_audit_log.operator_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_assessment_audit_log l
LEFT JOIN employee e ON l.operator_id = e.id AND e.is_deleted = false
WHERE l.operator_id IS NOT NULL AND e.id IS NULL;

-- ========================
-- 2. HSE 核心事件表
-- ========================

-- 2.1 hse_events
SELECT 'hse_events.personnel_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_events ev
LEFT JOIN employee e ON ev.personnel_id = e.id AND e.is_deleted = false
WHERE ev.personnel_id IS NOT NULL AND e.id IS NULL;

SELECT 'hse_events.department_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_events ev
LEFT JOIN hse_org_unit o ON ev.department_id = o.id
WHERE ev.department_id IS NOT NULL AND o.id IS NULL;

-- 2.2 hse_event_timeline
SELECT 'hse_event_timeline.actor_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_event_timeline t
LEFT JOIN employee e ON t.actor_id = e.id AND e.is_deleted = false
WHERE t.actor_id IS NOT NULL AND e.id IS NULL;

-- 2.3 hse_control_measures
SELECT 'hse_control_measures.responsible_person_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_control_measures m
LEFT JOIN employee e ON m.responsible_person_id = e.id AND e.is_deleted = false
WHERE m.responsible_person_id IS NOT NULL AND e.id IS NULL;

SELECT 'hse_control_measures.department_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_control_measures m
LEFT JOIN hse_org_unit o ON m.department_id = o.id
WHERE m.department_id IS NOT NULL AND o.id IS NULL;

-- 2.4 hse_rectifications
SELECT 'hse_rectifications.responsible_person_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_rectifications r
LEFT JOIN employee e ON r.responsible_person_id = e.id AND e.is_deleted = false
WHERE r.responsible_person_id IS NOT NULL AND e.id IS NULL;

SELECT 'hse_rectifications.department_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_rectifications r
LEFT JOIN hse_org_unit o ON r.department_id = o.id
WHERE r.department_id IS NOT NULL AND o.id IS NULL;

-- 2.5 hse_reviews
SELECT 'hse_reviews.reviewer_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM hse_reviews r
LEFT JOIN employee e ON r.reviewer_id = e.id AND e.is_deleted = false
WHERE r.reviewer_id IS NOT NULL AND e.id IS NULL;

-- ========================
-- 3. employee_assignment（基础设施表）
-- ========================

SELECT 'employee_assignment.employee_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM employee_assignment ea
LEFT JOIN employee e ON ea.employee_id = e.id AND e.is_deleted = false
WHERE ea.employee_id IS NOT NULL AND e.id IS NULL;

SELECT 'employee_assignment.supervisor_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM employee_assignment ea
LEFT JOIN employee e ON ea.supervisor_id = e.id AND e.is_deleted = false
WHERE ea.supervisor_id IS NOT NULL AND e.id IS NULL;

SELECT 'employee_assignment.position_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM employee_assignment ea
LEFT JOIN position p ON ea.position_id = p.id
WHERE ea.position_id IS NOT NULL AND p.id IS NULL;

SELECT 'employee_assignment.org_unit_id' AS tbl_col,
       COUNT(*) AS orphan_count
FROM employee_assignment ea
LEFT JOIN hse_org_unit o ON ea.org_unit_id = o.id
WHERE ea.org_unit_id IS NOT NULL AND o.id IS NULL;
