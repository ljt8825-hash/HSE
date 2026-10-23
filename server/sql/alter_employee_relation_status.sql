-- ============================================================
-- 目标责任书台账支撑 · 新增「用工关系状态」列
-- 版本: 增量变更（在 sprint5_6_employee_master_migration.sql 之后执行）
-- 目标库: safety_dashboard_dev（2026-10-23 已执行）+ safety_dashboard 生产（2026-10-23 用户授权后已执行）
-- 作用: employee 人员主表新增 employment_relationship_status；
--       同步重建 v_employee_current 视图暴露该列。
-- 可重复执行（IF NOT EXISTS + DROP/CREATE 视图）。
-- ============================================================

BEGIN;

-- 一、employee 人员主表新增列
ALTER TABLE employee ADD COLUMN IF NOT EXISTS employment_relationship_status VARCHAR(50);

COMMENT ON COLUMN employee.employment_relationship_status IS
  '用工关系状态：正式工/劳务派遣/业务外包/实习/退休返聘/临时用工/其他（NULL=未登记）';

-- 二、重建 v_employee_current 视图（PostgreSQL 不允许用 OR REPLACE 改变视图列集合，须 DROP 后 CREATE）
-- 注意：已确认该视图无其它依赖对象（pg_depend deptype=n 为空），DROP 不会级联破坏。
DROP VIEW IF EXISTS v_employee_current;

CREATE VIEW v_employee_current AS
SELECT DISTINCT ON (e.id)
    e.id AS employee_id,
    e.employee_code,
    e.name,
    e.gender,
    e.birth_date,
    e.phone,
    e.id_card,
    e.person_category,
    e.person_type,
    e.is_public_welfare,
    e.id_address,
    e.employment_relationship_status,
    CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(e.birth_date))::INT ELSE NULL END AS age,
    a.id AS assignment_id,
    a.org_unit_id,
    ou.org_name,
    ou.org_type,
    ou.org_code,
    ou.org_path,
    a.operation_unit_id,
    opu.unit_name,
    opu.unit_type,
    opu.unit_code,
    a.position_id,
    p.name AS position_name,
    p.position_code,
    p.job_category AS position_type,
    p.risk_level,
    p.is_safety_critical,
    a.supervisor_id,
    sup.name AS supervisor_name,
    a.status AS assignment_status,
    a.is_current,
    a.is_primary,
    a.start_date,
    a.end_date,
    a.remark,
    a.created_at AS assigned_at,
    e.is_deleted AS employee_deleted
FROM employee e
LEFT JOIN employee_assignment a
    ON a.employee_id = e.id
    AND a.is_current = true
    AND a.is_primary = true
    AND a.is_deleted = false
LEFT JOIN hse_org_unit ou ON ou.id = a.org_unit_id AND ou.is_deleted = false
LEFT JOIN hse_operation_unit opu ON opu.id = a.operation_unit_id AND opu.is_deleted = false
LEFT JOIN position p ON p.id = a.position_id AND p.is_deleted = false
LEFT JOIN employee sup ON sup.id = a.supervisor_id AND sup.is_deleted = false
WHERE e.is_deleted = false
ORDER BY e.id, a.start_date DESC NULLS LAST;

COMMENT ON VIEW v_employee_current IS '当前员工全景视图（Sprint5.6，基于 employee_assignment；含用工关系状态）';

COMMIT;
