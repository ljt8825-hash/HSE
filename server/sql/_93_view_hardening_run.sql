-- 提示词-93 Task1: 加固 v_employee_current，确保每位员工仅返回一行（取最新主任职）
-- 由于线上视图列顺序与规范源不一致，CREATE OR REPLACE 报列名冲突，故采用 DROP + CREATE。
-- 依赖检查已确认：无任何对象依赖该视图（pg_depend 与视图文本检索均为空），DROP 安全。

DROP VIEW IF EXISTS v_employee_current;

CREATE VIEW v_employee_current AS
SELECT DISTINCT ON (e.id)
    e.id AS employee_id,
    e.employee_code,
    e.name,
    e.gender,
    e.birth_date,
    e.phone,
    e.person_category,
    e.person_type,
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

COMMENT ON VIEW v_employee_current IS '当前员工全景视图（Sprint5.6，基于 employee_assignment，每位员工一行）';

-- 验证
SELECT COUNT(*) AS v_employee_current_count FROM v_employee_current;
