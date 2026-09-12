-- ============================================================
-- 迁移名称: department ↔ hse_org_unit 主数据映射
-- 版本: v110
-- 日期: 2026-08-01
-- 说明: 在 department 表增加 org_unit_id 外键列，建立 ID 级关联
-- 依赖: hse_employee_master_v59_migration.sql (department 表)
--        hse_org_center_v68_migration.sql (hse_org_unit 表)
-- ============================================================

BEGIN;

-- Step 1: 添加 org_unit_id 列（允许 NULL，因为班组级部门无对应 org_unit）
ALTER TABLE department ADD COLUMN IF NOT EXISTS org_unit_id BIGINT;

-- Step 2: 创建外键约束
ALTER TABLE department 
  ADD CONSTRAINT fk_department_org_unit 
  FOREIGN KEY (org_unit_id) REFERENCES hse_org_unit(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 3: 创建索引
CREATE INDEX IF NOT EXISTS idx_department_org_unit_id 
  ON department(org_unit_id) WHERE is_deleted = false;

-- Step 4: 填充初始映射 — 精确匹配
UPDATE department d
SET org_unit_id = ou.id
FROM hse_org_unit ou
WHERE ou.org_name = d.name 
  AND ou.is_deleted = false 
  AND d.is_deleted = false
  AND d.org_unit_id IS NULL;

-- Step 5: 填充初始映射 — 前缀匹配（兜底未命中的）
UPDATE department d
SET org_unit_id = ou.id
FROM hse_org_unit ou
WHERE ou.org_name LIKE d.name || '%' 
  AND ou.is_deleted = false 
  AND d.is_deleted = false
  AND d.org_unit_id IS NULL;

-- Step 6: 验证映射结果
DO $$
DECLARE
  total_depts INT;
  mapped_depts INT;
  unmapped_depts INT;
BEGIN
  SELECT COUNT(*) INTO total_depts FROM department WHERE is_deleted = false;
  SELECT COUNT(*) INTO mapped_depts FROM department WHERE is_deleted = false AND org_unit_id IS NOT NULL;
  SELECT COUNT(*) INTO unmapped_depts FROM department WHERE is_deleted = false AND org_unit_id IS NULL;
  
  RAISE NOTICE '部门总数: %, 已映射: %, 未映射: %', total_depts, mapped_depts, unmapped_depts;
  
  -- 预期: 77 个部门中 24 个可映射（有对应 hse_org_unit 的作业中心级部门），53 个班组级部门不可映射
  IF mapped_depts < 20 THEN
    RAISE WARNING '映射数(%)低于预期(≥20)，请检查映射质量', mapped_depts;
  END IF;
END $$;

COMMIT;

-- ============================================================
-- 回滚脚本（如需回滚，执行以下 SQL）:
-- BEGIN;
-- ALTER TABLE department DROP CONSTRAINT IF EXISTS fk_department_org_unit;
-- DROP INDEX IF EXISTS idx_department_org_unit_id;
-- ALTER TABLE department DROP COLUMN IF EXISTS org_unit_id;
-- COMMIT;
-- ============================================================
