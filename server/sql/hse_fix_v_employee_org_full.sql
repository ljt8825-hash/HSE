-- ============================================================
-- v_employee_org_full 视图修复：任职数据源改为 employee_assignment
-- 日期：2026-08-27
-- 问题：视图原引用 hse_employee_relation（Sprint6.0 验证数据，employee_id 为旧 ID，
--       1304 条全部在 employee 表中不存在 → 视图 relation_status='active' 结果恒为 0）
--       → 考核周期启动 targetCount=0、评分/冻结空转。
--       当前正式任职表为 employee_assignment（1313 条，employee_id 与 employee 全匹配）。
-- 修复：DROP 后重建视图，LEFT JOIN employee_assignment（字段结构一致）。
-- 回滚：将下方"旧定义"重新 CREATE OR REPLACE VIEW 即可。
-- ============================================================

-- ============ 旧定义（回滚用，勿执行） ============
-- SELECT e.id AS employee_id, e.employee_code, e.name, e.gender, e.birth_date, e.phone,
--   e.person_category, e.person_type, EXTRACT(year FROM age(e.birth_date::timestamp with time zone))::integer AS age,
--   er.id AS relation_id, er.org_unit_id, ou.org_name, ou.org_type, ou.org_code, ou.org_path,
--   er.operation_unit_id, opu.unit_name, opu.unit_type, opu.unit_code,
--   er.position_id, p.name AS position_name, p.position_code, p.risk_level, p.is_safety_critical, p.job_category,
--   er.supervisor_id, sup.name AS supervisor_name,
--   er.status AS relation_status, er.start_date, er.end_date, er.is_current, er.is_primary, er.created_at,
--   e.is_deleted
-- FROM employee e
--   LEFT JOIN hse_employee_relation er ON er.employee_id = e.id AND er.is_current = true AND er.is_deleted = false AND er.is_primary = true
--   LEFT JOIN hse_org_unit ou ON ou.id = er.org_unit_id AND ou.is_deleted = false
--   LEFT JOIN hse_operation_unit opu ON opu.id = er.operation_unit_id AND opu.is_deleted = false
--   LEFT JOIN "position" p ON p.id = er.position_id AND p.is_deleted = false
--   LEFT JOIN employee sup ON sup.id = er.supervisor_id AND sup.is_deleted = false;
-- ==================================================

DROP VIEW IF EXISTS v_employee_org_full;

CREATE VIEW v_employee_org_full AS
SELECT e.id AS employee_id,
  e.employee_code,
  e.name,
  e.gender,
  e.birth_date,
  e.phone,
  e.person_category,
  e.person_type,
  EXTRACT(year FROM age(e.birth_date::timestamp with time zone))::integer AS age,
  ea.id AS relation_id,
  ea.org_unit_id,
  ou.org_name,
  ou.org_type,
  ou.org_code,
  ou.org_path,
  ea.operation_unit_id,
  opu.unit_name,
  opu.unit_type,
  opu.unit_code,
  ea.position_id,
  p.name AS position_name,
  p.position_code,
  p.risk_level,
  p.is_safety_critical,
  p.job_category,
  ea.supervisor_id,
  sup.name AS supervisor_name,
  ea.status AS relation_status,
  ea.start_date,
  ea.end_date,
  ea.is_current,
  ea.is_primary,
  ea.created_at,
  e.is_deleted
FROM employee e
  LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false AND ea.is_primary = true
  LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
  LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
  LEFT JOIN "position" p ON p.id = ea.position_id AND p.is_deleted = false
  LEFT JOIN employee sup ON sup.id = ea.supervisor_id AND sup.is_deleted = false;

-- 验证：
-- SELECT count(*) FROM v_employee_org_full WHERE relation_status='active';  -- 期望 ~1311
-- SELECT position_name, count(*) FROM v_employee_org_full WHERE relation_status='active' AND position_name IN ('乡镇作业中心经理','管理员') GROUP BY position_name;
