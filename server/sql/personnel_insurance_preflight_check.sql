-- ============================================================================
-- 预发验证：personnel_insurance 迁移前只读检查
-- 文件：personnel_insurance_preflight_check.sql
-- 用途：在执行 personnel_insurance_employee_id_migration.sql 前，
--       在预发/生产库的只读副本上运行本文件，确认数据质量满足迁移门槛。
-- 本文件全部为 SELECT 查询，不修改任何数据，可安全重复执行。
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 检查项 1：总记录数与关联状态概览
-- 门槛：unlinked_active = 0（未关联在职记录清零），或已全部进入待人工匹配清单
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  '【1】总览' AS check_item,
  COUNT(*) AS total_records,
  COUNT(*) FILTER (WHERE is_deleted = false) AS active_records,
  COUNT(*) FILTER (WHERE employee_id IS NOT NULL) AS linked_records,
  COUNT(*) FILTER (WHERE employee_id IS NULL AND is_deleted = false) AS unlinked_active,
  CASE
    WHEN COUNT(*) FILTER (WHERE employee_id IS NULL AND is_deleted = false) = 0
    THEN 'PASS: 无未关联在职记录'
    ELSE 'WARN: 存在未关联在职记录，需人工确认后回填或进入待匹配清单'
  END AS status
FROM personnel_insurance;

-- ────────────────────────────────────────────────────────────────────────────
-- 检查项 2：无效 employee_id（孤儿记录）
-- 门槛：返回 0 行。若有结果，说明 employee_id 指向不存在的员工，需人工修正。
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  '【2】无效employee_id（孤儿记录）' AS check_item,
  p.id, p.employee_id, p.person_name, p.insurance_type, p.personnel_id
FROM personnel_insurance p
LEFT JOIN employee e ON e.id = p.employee_id
WHERE p.employee_id IS NOT NULL AND e.id IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 检查项 3：重复 active 保单（创建唯一索引前必须清理）
-- 门槛：返回 0 行。若有结果，说明同一员工+险种已有多条 is_current=true 记录，
--       必须人工保留最新/有效的一条，其余置为 is_current=false 或软删除。
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  '【3】重复active保单（阻塞唯一索引）' AS check_item,
  employee_id,
  insurance_type,
  COUNT(*) AS duplicate_count,
  array_agg(id ORDER BY id) AS duplicate_record_ids,
  array_agg(person_name ORDER BY id) AS person_names
FROM personnel_insurance
WHERE employee_id IS NOT NULL
  AND is_current = true
  AND is_deleted = false
GROUP BY employee_id, insurance_type
HAVING COUNT(*) > 1;

-- ────────────────────────────────────────────────────────────────────────────
-- 检查项 4：同名多候选（仅供人工核验，禁止按姓名自动回填）
-- 门槛：仅供参考。结果显示有多少同名员工，回填时需用身份证/工号等稳定标识。
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  '【4】同名多候选（禁止按姓名回填）' AS check_item,
  e.name,
  COUNT(*) AS candidate_count,
  array_agg(e.employee_id ORDER BY e.employee_id) AS candidate_employee_ids
FROM v_employee_current e
GROUP BY e.name
HAVING COUNT(*) > 1
ORDER BY candidate_count DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 检查项 5：personnel_id 指向多个人名（可能的脏数据）
-- 门槛：仅供参考。同一 personnel_id 对应多个人名可能是历史数据问题，需人工核验。
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  '【5】personnel_id关联多个人名' AS check_item,
  personnel_id,
  COUNT(DISTINCT person_name) AS name_variant_count,
  COUNT(*) AS record_count,
  array_agg(DISTINCT person_name) AS variant_names
FROM personnel_insurance
WHERE personnel_id IS NOT NULL AND is_deleted = false
GROUP BY personnel_id
HAVING COUNT(DISTINCT person_name) > 1
ORDER BY name_variant_count DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 检查项 6：险种字典分布（确认 data 完整性）
-- 门槛：无异常险种值。雇主险/工伤险应为主要类型。
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  '【6】险种分布' AS check_item,
  insurance_type,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE is_current = true AND is_deleted = false) AS active_count,
  COUNT(*) FILTER (WHERE employee_id IS NULL AND is_deleted = false) AS unlinked_active
FROM personnel_insurance
GROUP BY insurance_type
ORDER BY active_count DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- 检查项 7：employee 表主键与 v_employee_current 视图状态
-- 门槛：确认 v_employee_current 可用，employee.id 是主键/BIGINT。
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  '【7】员工主数据状态' AS check_item,
  (SELECT COUNT(*) FROM employee) AS employee_total,
  (SELECT COUNT(*) FROM v_employee_current) AS current_employee_count,
  CASE
    WHEN (SELECT COUNT(*) FROM v_employee_current) > 0
    THEN 'PASS: v_employee_current 视图有数据'
    ELSE 'ERROR: v_employee_current 无数据，请检查员工主数据迁移'
  END AS status;

-- ────────────────────────────────────────────────────────────────────────────
-- 检查项 8：现有索引检查（确认无冲突）
-- 门槛：确认 idx_personnel_insurance_unique_active 不存在（迁移脚本会创建）。
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  '【8】现有索引状态' AS check_item,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'personnel_insurance'
  AND indexname LIKE '%personnel_insurance%'
ORDER BY indexname;

-- ============================================================================
-- 验证结论判定规则：
--   ✅ PASS：检查项1无unlinked_active、检查项2返回0行、检查项3返回0行
--   ⚠️ WARN：检查项1有unlinked_active但已人工确认进入待匹配清单
--   ❌ BLOCK：检查项2或检查项3返回非空结果，必须修正后才能继续迁移
-- ============================================================================
