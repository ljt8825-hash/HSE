-- =====================================================================
-- HSE 人员主数据中心 v67 扩展迁移脚本
-- 版本: v67 (花名册表头对齐扩展)
-- 内容: employee 表新增 id_address (身份证地址) 字段
-- 依据: 花名册 Excel 表头对齐需求
-- 方式: 增量迁移，可重复执行
-- =====================================================================

BEGIN;

-- ============================================================
-- 一、扩展 employee 表 - 新增身份证地址字段
-- ============================================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'employee' AND column_name = 'id_address') THEN
        ALTER TABLE employee ADD COLUMN id_address VARCHAR(256);
        RAISE NOTICE 'Added id_address column to employee';
    END IF;
END $$;

-- 注释
COMMENT ON COLUMN employee.id_address IS '身份证地址';

-- ============================================================
-- 二、验证查询
-- ============================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_name = 'employee' AND column_name = 'id_address';
    RAISE NOTICE 'v67迁移验证：employee新增字段 % 个', v_count;
END $$;

COMMIT;
