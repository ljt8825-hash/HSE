-- ================================================================
-- Sprint-B v2.1 Production Migration
-- Script 03: B-1 Organization Verify
-- ================================================================
-- 执行顺序: 第 3 个执行（B-0 恢复验证通过后）
-- 依赖: 02_B0_Employee_Recover.sql 已执行成功
-- 风险等级: Low (只读检查)
-- 阻断级别: P0 (任一失败禁止进入 B-2)
-- ================================================================
-- 注意: 本脚本为只读验证，不修改任何数据
-- ================================================================

-- ================================================================
-- Step 1: employee_relation -> employee 关联检查
-- ================================================================
SELECT COUNT(*) AS missing_refs
FROM hse_employee_relation her
LEFT JOIN employee e ON her.employee_id = e.id AND e.is_deleted = false
WHERE her.is_deleted = false;

-- 目标: missing_refs = 0
-- 若失败: 说明 B-0 恢复不完整，需排查并回滚

-- ================================================================
-- Step 2: position_id 有效性检查
-- ================================================================
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN p.id IS NOT NULL THEN 1 END) AS valid_positions,
    COUNT(CASE WHEN p.id IS NULL THEN 1 END) AS invalid_positions
FROM hse_employee_relation her
LEFT JOIN position p ON her.position_id = p.id AND p.is_deleted = false
WHERE her.is_deleted = false;

-- 目标: invalid_positions = 0
-- 若失败: 存在无效岗位引用，需先清洗数据

-- ================================================================
-- Step 3: org_unit_id 有效性检查
-- ================================================================
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN ou.id IS NOT NULL THEN 1 END) AS valid_org_units,
    COUNT(CASE WHEN ou.id IS NULL THEN 1 END) AS invalid_org_units
FROM hse_employee_relation her
LEFT JOIN hse_org_unit ou ON her.org_unit_id = ou.id AND ou.is_deleted = false
WHERE her.is_deleted = false;

-- 目标: invalid_org_units = 0
-- 若失败: 存在无效组织单元引用，需先清洗数据

-- ================================================================
-- Step 4: operation_unit_id 有效性检查
-- ================================================================
SELECT
    COUNT(*) AS total_records,
    COUNT(CASE WHEN her.operation_unit_id IS NULL THEN 1 END) AS null_op_units,
    COUNT(CASE WHEN her.operation_unit_id IS NOT NULL AND opu.id IS NOT NULL THEN 1 END) AS valid_op_units,
    COUNT(CASE WHEN her.operation_unit_id IS NOT NULL AND opu.id IS NULL THEN 1 END) AS invalid_op_units
FROM hse_employee_relation her
LEFT JOIN hse_operation_unit opu ON her.operation_unit_id = opu.id AND opu.is_deleted = false
WHERE her.is_deleted = false;

-- 目标: invalid_op_units = 0 (允许 NULL)
-- 若失败: 存在无效运营单元引用，需先清洗数据

-- ================================================================
-- B-1 完成确认
-- ================================================================
-- 上述 4 项检查全部通过后，继续执行 04_B2_Assignment_Migration.sql
-- 若任何检查失败，暂停迁移，排查数据问题
-- ================================================================
